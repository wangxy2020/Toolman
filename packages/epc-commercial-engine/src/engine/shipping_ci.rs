use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use anyhow::{anyhow, Context, Result};
use calamine::{open_workbook_auto, Reader, Sheets};
use chrono::Utc;
use regex::Regex;
use rust_xlsxwriter::{Format, FormatAlign, Workbook};
use sha2::{Digest, Sha256};

use crate::engine::align::{
    self, cell_to_string, find_current_column, find_description_column, find_item_column,
    normalize_item_key, parse_boq_number,
};
use crate::engine::scanner;
use crate::ledger::{shipping_ci_ledger_path, ProcessLedger};
use crate::license;
use crate::types::{
    AlignedIpcWriteJob, AlignedIpcWriteRow, CommitShippingCiLedgerRequest, ErrorCode, IpcFileStatus,
    ProgressCiWriteJob, ProgressCiWriteRow, ShippingCiDiscoveredFile, ShippingCiFileQueue,
    ShippingCiFileResult, ShippingCiLedgerCommitEntry, ShippingCiMismatchKind, ShippingCiMismatchRow,
    ShippingCiWorkflowReport, ShippingCiWorkflowResponse, WorkspaceShippingCiWorkflowRequest,
};

pub fn run_workspace_shipping_ci_workflow(
    request: &WorkspaceShippingCiWorkflowRequest,
) -> ShippingCiWorkflowResponse {
    let workspace = Path::new(&request.workspace_root);
    if !workspace.is_dir() {
        return invalid_args(format!("工作区不存在: {}", request.workspace_root));
    }

    let license_file = crate::ledger::license_path(Path::new(&request.data_dir));
    if let Err(err) = license::verify_license(&license_file) {
        let msg = err.to_string();
        let code = if msg.contains("AUTH_EXPIRED") {
            ErrorCode::AuthExpired
        } else {
            ErrorCode::InternalError
        };
        return ShippingCiWorkflowResponse {
            ok: false,
            report: None,
            error_code: Some(code),
            error_message: Some(msg),
        };
    }

    let log_path = shipping_ci_ledger_path(workspace)
        .display()
        .to_string();
    let data_dir = Path::new(&request.data_dir);
    let mut ledger = ProcessLedger::load_shipping_ci(workspace, data_dir);

    let scan = match scanner::scan_workspace(workspace) {
        Ok(s) => s,
        Err(e) => return internal_err(e.to_string()),
    };
    let discovered = build_discovered_shipping_ci_files(workspace, &scan, &ledger);
    if discovered.is_empty() {
        return failure_response(
            ErrorCode::InvalidArgs,
            "未发现待处理海运商业发票：请在 substation_lot/SCHn-IPCx/ 等嵌套目录下放置 xlsx，\
             文件名含 FOB/CIF/CIP 或 Commercial Invoice（排除 Packing List；期号取自 SCHn-IPCx 文件夹名）"
                .to_string(),
            workspace,
            discovered,
            &log_path,
        );
    }

    let groups = group_shipping_ci_discovered(workspace, &discovered);
    let defer_ledger = request.defer_ledger_success;
    let mut file_results = Vec::new();
    let mut output_paths = Vec::new();
    let mut aligned_ipc_write_jobs = Vec::new();
    let mut progress_ci_write_jobs = Vec::new();
    let mut pending_ledger_commits = Vec::new();
    let mut success_count = 0u32;
    let mut skipped_count = 0u32;
    let mut failed_count = 0u32;

    for group in &groups {
        let all_skipped = group
            .sources
            .iter()
            .all(|s| s.queue == ShippingCiFileQueue::AlreadyProcessed);
        if all_skipped {
            for row in &group.sources {
                skipped_count += 1;
                file_results.push(skipped_file_result(row));
            }
            continue;
        }

        match process_shipping_ci_group(workspace, group) {
            Ok(group_result) => {
                if let Some(ProcessOutcome {
                    output,
                    aligned_job,
                    progress_ci_job,
                    ..
                }) = group_result.outcome
                {
                    if defer_ledger {
                        pending_ledger_commits.push(ShippingCiLedgerCommitEntry {
                            file_name: group.ledger_name.clone(),
                            md5: group.ledger_md5.clone(),
                        });
                    } else {
                        ledger.record_success_shipping_ci(&group.ledger_name, &group.ledger_md5);
                    }
                    success_count += group.sources.len() as u32;
                    output_paths.push(output.display().to_string());
                    if let Some(job) = aligned_job {
                        aligned_ipc_write_jobs.push(job);
                    }
                    if let Some(job) = progress_ci_job {
                        progress_ci_write_jobs.push(job);
                    }
                    for (source, validation) in &group_result.per_file {
                        file_results.push(shipping_ci_file_result_from_validation(
                            source,
                            validation,
                            IpcFileStatus::Success,
                            None,
                            Some(&output),
                        ));
                    }
                } else {
                    let err = group_result
                        .error_message
                        .clone()
                        .unwrap_or_else(|| "步骤 2 数据检查未通过".to_string());
                    ledger.record_failed(&group.ledger_name, &group.ledger_md5, &err);
                    for (source, validation) in &group_result.per_file {
                        let file_failed = !validation.analysis_ok;
                        if file_failed {
                            failed_count += 1;
                        }
                        file_results.push(shipping_ci_file_result_from_validation(
                            source,
                            validation,
                            if validation.analysis_ok {
                                IpcFileStatus::Success
                            } else {
                                IpcFileStatus::Failed
                            },
                            if file_failed { Some(err.clone()) } else { None },
                            None,
                        ));
                    }
                }
            }
            Err(err) => {
                ledger.record_failed(&group.ledger_name, &group.ledger_md5, &err);
                failed_count += group.sources.len() as u32;
                for row in &group.sources {
                    file_results.push(ShippingCiFileResult {
                        file_name: row.file_name.clone(),
                        file_path: row.file_path.clone(),
                        status: IpcFileStatus::Failed,
                        error_message: Some(err.clone()),
                        skipped_reason: None,
                        output_path: None,
                        mismatch_count: 0,
                        mismatches: Vec::new(),
                        analysis_ok: Some(false),
                        checked_row_count: None,
                        matched_row_count: None,
                        description_match_count: None,
                        analysis_row_error_count: None,
                        boq_reference_kind: None,
                        boq_reference_path: None,
                        boq_schedule_digit: None,
                    });
                }
            }
        }
    }

    if let Err(e) = ledger.save_shipping_ci(workspace) {
        return internal_err(format!("保存 shipping_ci_process_log.txt 失败: {e}"));
    }

    ShippingCiWorkflowResponse {
        ok: failed_count == 0 || success_count > 0,
        report: Some(ShippingCiWorkflowReport {
            processed_at: Utc::now().to_rfc3339(),
            workspace_root: workspace.display().to_string(),
            success_count,
            skipped_count,
            failed_count,
            discovered_files: discovered,
            files: file_results,
            output_paths,
            aligned_ipc_write_jobs,
            progress_ci_write_jobs,
            shipping_ci_process_log_path: log_path,
            pending_ledger_commits,
        }),
        error_code: None,
        error_message: None,
    }
}

pub fn commit_shipping_ci_ledger_successes(request: &CommitShippingCiLedgerRequest) -> Result<()> {
    let workspace = Path::new(&request.workspace_root);
    let data_dir = Path::new(&request.data_dir);
    let mut ledger = ProcessLedger::load_shipping_ci(workspace, data_dir);
    for entry in &request.successes {
        ledger.record_success_shipping_ci(&entry.file_name, &entry.md5);
    }
    ledger
        .save_shipping_ci(workspace)
        .map_err(|e| anyhow!("保存 shipping_ci_process_log.txt 失败: {e}"))
}

fn skipped_file_result(row: &ShippingCiDiscoveredFile) -> ShippingCiFileResult {
    ShippingCiFileResult {
        file_name: row.file_name.clone(),
        file_path: row.file_path.clone(),
        status: IpcFileStatus::Skipped,
        error_message: None,
        skipped_reason: Some(format!(
            "shipping_ci_process_log.txt 已记录全流程 SUCCESS @ {}",
            row.ledger_processed_at.clone().unwrap_or_default()
        )),
        output_path: None,
        mismatch_count: 0,
        mismatches: Vec::new(),
        analysis_ok: None,
        checked_row_count: None,
        matched_row_count: None,
        description_match_count: None,
        analysis_row_error_count: None,
        boq_reference_kind: None,
        boq_reference_path: None,
        boq_schedule_digit: None,
    }
}

struct ShippingCiProcessGroup {
    sch_ipc_dir: PathBuf,
    ledger_name: String,
    ledger_md5: String,
    ipc_period: String,
    sch_digit: u8,
    sources: Vec<ShippingCiDiscoveredFile>,
}

struct FileStep2Validation {
    analysis_ok: bool,
    checked_row_count: u32,
    matched_row_count: u32,
    description_match_count: u32,
    item_not_found_count: u32,
    mismatches: Vec<ShippingCiMismatchRow>,
    boq_reference_kind: String,
    boq_reference_path: String,
    boq_schedule_digit: u8,
}

struct ProcessGroupResult {
    per_file: Vec<(ShippingCiDiscoveredFile, FileStep2Validation)>,
    outcome: Option<ProcessOutcome>,
    error_message: Option<String>,
}

struct ProcessOutcome {
    output: PathBuf,
    aligned_job: Option<AlignedIpcWriteJob>,
    progress_ci_job: Option<ProgressCiWriteJob>,
}

#[derive(Clone)]
struct ShippingCiSourceRow {
    item: String,
    description: String,
    qty: Option<f64>,
}

#[derive(Clone)]
struct BoqReferenceRow {
    item: String,
    description: String,
    unit: String,
    est_qty: Option<f64>,
    unit_price: f64,
    previous_qty: f64,
}

fn build_discovered_shipping_ci_files(
    workspace: &Path,
    scan: &scanner::WorkspaceScan,
    ledger: &ProcessLedger,
) -> Vec<ShippingCiDiscoveredFile> {
    let mut out = Vec::new();
    let mut seen = HashSet::new();

    for entry in &scan.entries {
        let path = Path::new(&entry.file_path);
        if !is_shipping_commercial_invoice_candidate(workspace, path) {
            continue;
        }
        if align::is_aligned_master_path(path) || scanner::is_work1_boq_original_source_name(&entry.file_name) {
            continue;
        }

        let relative = path
            .strip_prefix(workspace)
            .map(|p| p.display().to_string())
            .unwrap_or_else(|_| entry.relative_path.clone());
        let folder = path
            .parent()
            .and_then(|p| p.strip_prefix(workspace).ok())
            .map(|p| p.display().to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| entry.folder_path.clone());

        let (ipc_period, sch_digit) = ipc_period_and_sch_from_context(path);
        seen.insert(entry.file_path.clone());
        out.push(ShippingCiDiscoveredFile {
            file_name: entry.file_name.clone(),
            file_path: entry.file_path.clone(),
            relative_path: relative,
            folder_path: folder,
            role_reason: "海运商业发票（FOB/CIF/CIP Commercial Invoice）".to_string(),
            ipc_period,
            sch_digit,
            queue: ShippingCiFileQueue::PendingProcess,
            in_ledger: false,
            ledger_processed_at: None,
        });
    }

    apply_group_ledger_queues(workspace, &mut out, ledger);
    out.sort_by(|a, b| a.file_path.cmp(&b.file_path));
    out
}

fn apply_group_ledger_queues(
    workspace: &Path,
    files: &mut [ShippingCiDiscoveredFile],
    ledger: &ProcessLedger,
) {
    let groups = group_shipping_ci_discovered(workspace, files);
    for group in groups {
        if !ledger.is_marked_success(&group.ledger_name, &group.ledger_md5) {
            continue;
        }
        let processed_at = ledger
            .find_by_file_name(&group.ledger_name)
            .map(|e| e.processed_at.clone());
        for row in files.iter_mut() {
            if group
                .sources
                .iter()
                .any(|s| s.file_path == row.file_path)
            {
                row.queue = ShippingCiFileQueue::AlreadyProcessed;
                row.in_ledger = true;
                row.ledger_processed_at = processed_at.clone();
            }
        }
    }
}

fn group_shipping_ci_discovered(
    workspace: &Path,
    discovered: &[ShippingCiDiscoveredFile],
) -> Vec<ShippingCiProcessGroup> {
    let mut map: HashMap<String, ShippingCiProcessGroup> = HashMap::new();
    for row in discovered {
        let path = PathBuf::from(&row.file_path);
        let sch_ipc_dir = sch_ipc_folder_path(workspace, &path).unwrap_or_else(|| {
            path.parent().unwrap_or(workspace).to_path_buf()
        });
        let sch_ipc_key = sch_ipc_folder_relative(workspace, &path)
            .unwrap_or_else(|| row.folder_path.clone());
        let group_key = format!("{}|{}|SCH{}", sch_ipc_key, row.ipc_period, row.sch_digit);
        let entry = map.entry(group_key).or_insert_with(|| ShippingCiProcessGroup {
            sch_ipc_dir: sch_ipc_dir.clone(),
            ledger_name: shipping_ci_group_ledger_name(&sch_ipc_key, &row.ipc_period, row.sch_digit),
            ledger_md5: String::new(),
            ipc_period: row.ipc_period.clone(),
            sch_digit: row.sch_digit,
            sources: Vec::new(),
        });
        entry.sources.push(row.clone());
    }
    let mut groups: Vec<ShippingCiProcessGroup> = map.into_values().collect();
    for group in &mut groups {
        group.ledger_md5 = hash_group_source_fingerprint(&group.sources);
    }
    groups.sort_by(|a, b| a.ledger_name.cmp(&b.ledger_name));
    groups
}

fn shipping_ci_group_ledger_name(sch_ipc_key: &str, period: &str, sch: u8) -> String {
    format!("GROUP|{sch_ipc_key}|SCH{sch}|{period}")
}

fn sch_ipc_folder_relative(workspace: &Path, path: &Path) -> Option<String> {
    let rel = path.strip_prefix(workspace).ok()?;
    let mut acc = PathBuf::new();
    for comp in rel.components() {
        if let std::path::Component::Normal(name) = comp {
            acc.push(name);
            if sch_ipc_folder_re().is_match(&name.to_string_lossy()) {
                return Some(acc.display().to_string());
            }
        }
    }
    None
}

fn sch_ipc_folder_path(workspace: &Path, path: &Path) -> Option<PathBuf> {
    let rel = sch_ipc_folder_relative(workspace, path)?;
    Some(workspace.join(rel))
}

/// 海运商业发票候选：须位于 SCHn-IPCx 文件夹内（可嵌套 substation_lot 等子目录）。
pub fn is_shipping_commercial_invoice_candidate(workspace: &Path, path: &Path) -> bool {
    let name = path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or_default()
        .to_lowercase();
    if !name.ends_with(".xlsx") || name.starts_with("~$") {
        return false;
    }
    if !path_in_sch_ipc_folder(workspace, path) {
        return false;
    }
    if is_likely_progress_ipc_invoice_filename(path) {
        return false;
    }
    if is_packing_list_file_name(&name) {
        return false;
    }
    shipping_ci_filename_markers(&name)
}

fn is_packing_list_file_name(name: &str) -> bool {
    (name.contains("packing") && name.contains("list")) || name.contains("packlist")
}

fn is_packing_list_sheet_name(name: &str) -> bool {
    let n = name.to_lowercase();
    (n.contains("packing") && n.contains("list")) || n.contains("packlist")
}

fn is_commercial_invoice_sheet_name(name: &str) -> bool {
    let n = name.to_lowercase();
    if is_packing_list_sheet_name(name) {
        return false;
    }
    (n.contains("commercial") && n.contains("invoice")) || n.contains("commecial")
}

fn shipping_ci_filename_markers(name: &str) -> bool {
    let has_incoterm = ["fob", "cif", "cip"].iter().any(|t| name.contains(t));
    let has_ci = (name.contains("commercial") && name.contains("invoice"))
        || name.contains("commecial");
    has_incoterm || has_ci
}

/// 进度款 IPC 申报表（文件名同时含 SCH/Schedule 与 IPC 期号），非海运商业发票。
fn is_likely_progress_ipc_invoice_filename(path: &Path) -> bool {
    if scanner::extract_ipc_period(path).is_none() {
        return false;
    }
    let stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or_default()
        .to_lowercase();
    scanner::extract_sch_schedule_number(path).is_some()
        || stem.contains("sch")
        || stem.contains("schedule")
}

pub fn path_in_sch_ipc_folder(workspace: &Path, path: &Path) -> bool {
    let rel = match path.strip_prefix(workspace) {
        Ok(r) => r,
        Err(_) => return false,
    };
    rel.components().any(|c| {
        let s = c.as_os_str().to_string_lossy();
        sch_ipc_folder_re().is_match(&s)
    })
}

fn sch_ipc_folder_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?i)sch\s*[\s_-]*(\d+).*ipc").unwrap())
}

/// 从 CIP 文件名或其所在 SCHn-IPCx 文件夹推断 Schedule 分项号（无法推断时返回 None）
fn sch_digit_from_context(path: &Path) -> Option<u8> {
    if let Some(digit) = scanner::extract_sch_schedule_number(path) {
        return Some(digit);
    }
    let mut combined = String::new();
    if let Some(parent) = path.parent() {
        combined.push_str(&parent.to_string_lossy());
        combined.push(' ');
    }
    combined.push_str(&path.file_name().unwrap_or_default().to_string_lossy());
    sch_ipc_folder_re()
        .captures(&combined)
        .and_then(|c| c.get(1))
        .and_then(|m| m.as_str().parse().ok())
}

/// IPC 期号优先级：SCHn-IPCx 文件夹名（用户对该期发票的命名，
/// 如 "7.SCH 1-2025004(IPC7)-USD-…" → IPC7）→ 文件名自身 → 兜底 IPC001。
fn ipc_period_and_sch_from_context(path: &Path) -> (String, u8) {
    let period = ipc_period_from_ancestor_folders(path)
        .or_else(|| scanner::extract_ipc_period(path))
        .unwrap_or_else(|| "IPC001".to_string());
    let sch = sch_digit_from_context(path).unwrap_or(1);
    (period, sch)
}

/// 逐级向上从文件夹名提取 IPC 期号：先找 SCHn-IPCx 文件夹，
/// 再退回最近 3 级内任意含 IPC 期号的文件夹名。
fn ipc_period_from_ancestor_folders(path: &Path) -> Option<String> {
    let mut dir = path.parent();
    while let Some(d) = dir {
        if let Some(name) = d.file_name().and_then(|s| s.to_str()) {
            if sch_ipc_folder_re().is_match(name) {
                if let Some(period) = scanner::extract_ipc_period_from_name(name) {
                    return Some(period);
                }
            }
        }
        dir = d.parent();
    }
    let mut dir = path.parent();
    for _ in 0..3 {
        let Some(d) = dir else { break };
        if let Some(name) = d.file_name().and_then(|s| s.to_str()) {
            if let Some(period) = scanner::extract_ipc_period_from_name(name) {
                return Some(period);
            }
        }
        dir = d.parent();
    }
    None
}

fn process_shipping_ci_group(
    workspace: &Path,
    group: &ShippingCiProcessGroup,
) -> Result<ProcessGroupResult, String> {
    // BOQ 对照分表优先取 CIP 自身 SCHn-IPCx 文件夹/文件名中的分项号；
    // 模板可能来自其他 SCH 文件夹（如 SCH4 的历史发票），其分项号仅作兜底，
    // 否则 SCH1 的 CIP 会被错误地拿去与 Schedule4 对照（Item 22.1.x 无匹配）。
    let context_sch_digit = group
        .sources
        .iter()
        .find_map(|s| sch_digit_from_context(Path::new(&s.file_path)));
    // 模板优先选同 Schedule 的已完成发票（不同 Schedule 的发票格式可能不同）
    let template_source = find_progress_ci_template(
        workspace,
        &group.sch_ipc_dir,
        context_sch_digit.unwrap_or(group.sch_digit),
    );
    let template_boq_sch_digit = context_sch_digit
        .or_else(|| {
            template_source
                .as_ref()
                .and_then(|p| scanner::extract_sch_schedule_number(p))
        })
        .unwrap_or(group.sch_digit);

    let mut per_file = Vec::new();
    let mut merged_ci_rows = Vec::new();
    let mut any_validation_fail = false;
    let mut resolved_boq: Option<(PathBuf, &'static str, Vec<BoqReferenceRow>, u8, String)> = None;

    for source in &group.sources {
        let path = PathBuf::from(&source.file_path);
        let sch_ipc_dir = sch_ipc_folder_path(workspace, &path).unwrap_or_else(|| group.sch_ipc_dir.clone());

        let rows = match read_shipping_ci_rows(&path) {
            Err(e) => {
                any_validation_fail = true;
                per_file.push((source.clone(), file_step2_read_error(e.to_string())));
                continue;
            }
            Ok(r) => r,
        };

        let boq_sch_digit = template_boq_sch_digit;
        let (boq_path, boq_kind) = match resolve_boq_reference(workspace, &path, &sch_ipc_dir) {
            Err(e) => {
                any_validation_fail = true;
                per_file.push((source.clone(), file_step2_boq_unavailable(e.to_string())));
                continue;
            }
            Ok(v) => v,
        };
        let (boq_rows, boq_sheet_name) = match load_boq_reference_rows(&boq_path, boq_sch_digit) {
            Err(e) => {
                any_validation_fail = true;
                per_file.push((source.clone(), file_step2_boq_unavailable(e.to_string())));
                continue;
            }
            Ok(r) => r,
        };
        let boq_reference_path = boq_path.display().to_string();
        let validation = validate_ci_rows_against_boq(
            &rows,
            &boq_rows,
            boq_kind,
            boq_sch_digit,
            &boq_reference_path,
        );
        if !validation.analysis_ok {
            any_validation_fail = true;
        } else {
            merged_ci_rows.extend(rows);
            if resolved_boq.is_none() {
                resolved_boq = Some((boq_path, boq_kind, boq_rows, boq_sch_digit, boq_sheet_name));
            }
        }
        per_file.push((source.clone(), validation));
    }

    if any_validation_fail || merged_ci_rows.is_empty() {
        let error_message = build_step2_validation_error_message(&per_file);
        return Ok(ProcessGroupResult {
            per_file,
            outcome: None,
            error_message: Some(error_message),
        });
    }

    let Some((boq_path, _boq_kind, boq_rows, boq_sch_digit, boq_sheet_name)) = resolved_boq else {
        return Ok(ProcessGroupResult {
            per_file,
            outcome: None,
            error_message: Some("步骤 2 数据检查未通过：无可对照的 BOQ 数据".to_string()),
        });
    };

    let ci_rows = merge_shipping_ci_rows(merged_ci_rows);
    let period = group.ipc_period.clone();
    let output_name =
        build_progress_output_filename(workspace, &group.sch_ipc_dir, group.sch_digit, &period);
    let output = group.sch_ipc_dir.join(&output_name);

    let preserve_template_format = if let Some(template) = &template_source {
        if template != &output {
            std::fs::copy(template, &output).map_err(|e| e.to_string())?;
        }
        true
    } else if output.exists() && is_progress_payment_ci_template(workspace, &output) {
        true
    } else {
        false
    };

    let progress_rows = build_progress_rows(&ci_rows, &boq_rows);
    let progress_ci_job = if preserve_template_format {
        let folder_name = group
            .sch_ipc_dir
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("");
        Some(build_progress_ci_write_job(
            &output,
            &period,
            boq_sch_digit,
            currency_from_sheet_name(&boq_sheet_name),
            sch_ipc_folder_batch_number(folder_name),
            &progress_rows,
        ))
    } else {
        write_progress_ipc_workbook(&output, &period, group.sch_digit, &progress_rows)
            .map_err(|e| e.to_string())?;
        None
    };

    let aligned_job = if align::is_aligned_master_path(&boq_path) {
        Some(build_aligned_ipc_write_job(
            &boq_path,
            boq_sch_digit,
            &period,
            &progress_rows,
        )?)
    } else {
        None
    };

    Ok(ProcessGroupResult {
        per_file,
        outcome: Some(ProcessOutcome {
            output,
            aligned_job,
            progress_ci_job,
        }),
        error_message: None,
    })
}

fn file_step2_boq_unavailable(reason: String) -> FileStep2Validation {
    FileStep2Validation {
        analysis_ok: false,
        checked_row_count: 0,
        matched_row_count: 0,
        description_match_count: 0,
        item_not_found_count: 0,
        mismatches: vec![ShippingCiMismatchRow {
            kind: ShippingCiMismatchKind::BoqNotFound,
            item: String::new(),
            description: String::new(),
            boq_item: None,
            boq_description: None,
            reason: reason.clone(),
        }],
        boq_reference_kind: String::new(),
        boq_reference_path: String::new(),
        boq_schedule_digit: 0,
    }
}

fn file_step2_read_error(reason: String) -> FileStep2Validation {
    FileStep2Validation {
        analysis_ok: false,
        checked_row_count: 0,
        matched_row_count: 0,
        description_match_count: 0,
        item_not_found_count: 0,
        mismatches: vec![ShippingCiMismatchRow {
            kind: ShippingCiMismatchKind::ItemNotFound,
            item: String::new(),
            description: String::new(),
            boq_item: None,
            boq_description: None,
            reason,
        }],
        boq_reference_kind: String::new(),
        boq_reference_path: String::new(),
        boq_schedule_digit: 0,
    }
}

fn shipping_ci_file_result_from_validation(
    source: &ShippingCiDiscoveredFile,
    validation: &FileStep2Validation,
    status: IpcFileStatus,
    error_message: Option<String>,
    output_path: Option<&Path>,
) -> ShippingCiFileResult {
    ShippingCiFileResult {
        file_name: source.file_name.clone(),
        file_path: source.file_path.clone(),
        status,
        error_message,
        skipped_reason: None,
        output_path: output_path.map(|p| p.display().to_string()),
        mismatch_count: validation.mismatches.len() as u32,
        mismatches: validation.mismatches.clone(),
        analysis_ok: Some(validation.analysis_ok),
        checked_row_count: Some(validation.checked_row_count),
        matched_row_count: Some(validation.matched_row_count),
        description_match_count: Some(validation.description_match_count),
        analysis_row_error_count: Some(validation.item_not_found_count),
        boq_reference_kind: Some(validation.boq_reference_kind.clone()),
        boq_reference_path: Some(validation.boq_reference_path.clone()),
        boq_schedule_digit: Some(validation.boq_schedule_digit),
    }
}

struct BoqLookup<'a> {
    item_keys: HashSet<String>,
    by_description: HashMap<String, Vec<&'a BoqReferenceRow>>,
}

fn build_boq_lookup<'a>(boq_rows: &'a [BoqReferenceRow]) -> BoqLookup<'a> {
    let mut item_keys = HashSet::new();
    let mut by_description: HashMap<String, Vec<&BoqReferenceRow>> = HashMap::new();
    for row in boq_rows {
        for key in boq_item_lookup_keys(&row.item) {
            item_keys.insert(key);
        }
        let desc_key = normalize_description_key(&row.description);
        if !desc_key.is_empty() {
            by_description.entry(desc_key).or_default().push(row);
        }
    }
    BoqLookup {
        item_keys,
        by_description,
    }
}

fn normalize_description_key(description: &str) -> String {
    description
        .trim()
        .to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn validate_ci_rows_against_boq(
    ci_rows: &[ShippingCiSourceRow],
    boq_rows: &[BoqReferenceRow],
    boq_kind: &str,
    boq_schedule_digit: u8,
    boq_reference_path: &str,
) -> FileStep2Validation {
    let lookup = build_boq_lookup(boq_rows);
    let mut checked_row_count = 0u32;
    let mut matched_row_count = 0u32;
    let mut description_match_count = 0u32;
    let mut item_not_found_count = 0u32;
    let mut mismatches = Vec::new();

    for ci in ci_rows {
        if ci.item.trim().is_empty()
            || !is_boq_matchable_item(&ci.item)
            || is_summary_ci_label(&ci.item)
        {
            continue;
        }
        checked_row_count += 1;

        if ci_item_matches_boq(&ci.item, &lookup.item_keys) {
            matched_row_count += 1;
            continue;
        }

        let desc_key = normalize_description_key(&ci.description);
        if let Some(boq_matches) = lookup.by_description.get(&desc_key).filter(|v| !v.is_empty()) {
            description_match_count += 1;
            let boq = boq_matches[0];
            mismatches.push(ShippingCiMismatchRow {
                kind: ShippingCiMismatchKind::DescriptionMatchItemMismatch,
                item: ci.item.clone(),
                description: ci.description.clone(),
                boq_item: Some(boq.item.clone()),
                boq_description: Some(boq.description.clone()),
                reason: format!(
                    "Description 与 BOQ 一致，但 Item 编号不一致（海运 {} → BOQ {}）",
                    ci.item, boq.item
                ),
            });
            continue;
        }

        item_not_found_count += 1;
        mismatches.push(ShippingCiMismatchRow {
            kind: ShippingCiMismatchKind::ItemNotFound,
            item: ci.item.clone(),
            description: ci.description.clone(),
            boq_item: None,
            boq_description: None,
            reason: format!(
                "Item 与 Description 均未在 {boq_kind}（Schedule{boq_schedule_digit}）中找到对应行"
            ),
        });
    }

    let analysis_ok = description_match_count == 0 && item_not_found_count == 0;
    FileStep2Validation {
        analysis_ok,
        checked_row_count,
        matched_row_count,
        description_match_count,
        item_not_found_count,
        mismatches,
        boq_reference_kind: boq_kind.to_string(),
        boq_reference_path: boq_reference_path.to_string(),
        boq_schedule_digit,
    }
}

fn build_step2_validation_error_message(
    per_file: &[(ShippingCiDiscoveredFile, FileStep2Validation)],
) -> String {
    let mut desc_mismatch = 0u32;
    let mut hard_mismatch = 0u32;
    let mut boq_missing = 0u32;
    for (_, validation) in per_file {
        desc_mismatch += validation.description_match_count;
        hard_mismatch += validation.item_not_found_count;
        if validation
            .mismatches
            .iter()
            .any(|m| m.kind == ShippingCiMismatchKind::BoqNotFound)
        {
            boq_missing += 1;
        }
    }
    if boq_missing > 0 && desc_mismatch == 0 && hard_mismatch == 0 {
        return format!(
            "步骤 2 数据检查未通过：{boq_missing} 个文件未找到 BOQ_aligned 或 BOQ.xlsx，无法对照"
        );
    }
    if desc_mismatch > 0 && hard_mismatch == 0 {
        return format!(
            "步骤 2 数据检查未通过：{desc_mismatch} 行 Description 可对应 BOQ，但 Item 编号不一致，请人工核对并修正后重试"
        );
    }
    if desc_mismatch > 0 {
        return format!(
            "步骤 2 数据检查未通过：{hard_mismatch} 行无法对应 BOQ；另有 {desc_mismatch} 行 Item 编号与 Description 不一致"
        );
    }
    if boq_missing > 0 {
        return format!(
            "步骤 2 数据检查未通过：{hard_mismatch} 行 Item 与 BOQ 无法对应；{boq_missing} 个文件缺少 BOQ 对照表"
        );
    }
    format!("步骤 2 数据检查未通过：{hard_mismatch} 行 Item 与 BOQ 无法对应")
}

fn read_shipping_ci_rows(ci_path: &Path) -> Result<Vec<ShippingCiSourceRow>> {
    let mut workbook: Sheets<_> = open_workbook_auto(ci_path)
        .with_context(|| format!("无法打开商业发票 {}", ci_path.display()))?;
    let sheet_names = workbook.sheet_names().to_vec();
    let sheet_name = sheet_names
        .iter()
        .find(|n| is_commercial_invoice_sheet_name(n))
        .or_else(|| {
            sheet_names
                .iter()
                .find(|n| !is_packing_list_sheet_name(n))
        })
        .cloned()
        .ok_or_else(|| anyhow!("商业发票无可用工作表（已跳过 Packing List）"))?;

    let range = workbook
        .worksheet_range(&sheet_name)
        .with_context(|| format!("读取 {sheet_name} 失败"))?;
    let sheet_rows: Vec<Vec<String>> = range
        .rows()
        .map(|row| row.iter().map(cell_to_string).collect())
        .collect();

    let (headers, data_start) = align::locate_shipping_ci_merged_header(&sheet_rows)
        .ok_or_else(|| anyhow!("无法识别商业发票表头（需 Item / Item No / No 等序号列）"))?;
    let item_col = find_item_column(&headers).ok_or_else(|| anyhow!("缺少 Item No 列"))?;
    let desc_col = find_description_column(&headers);
    let qty_col = find_current_column(&headers).or_else(|| find_qty_column(&headers));

    let mut rows = Vec::new();
    for row in sheet_rows.iter().skip(data_start) {
        let item = row.get(item_col).cloned().unwrap_or_default();
        let description = desc_col
            .and_then(|c| row.get(c))
            .cloned()
            .unwrap_or_default();
        if item.trim().is_empty() && description.trim().is_empty() {
            continue;
        }
        let qty = qty_col.and_then(|c| parse_boq_number(&row.get(c).cloned().unwrap_or_default()));
        rows.push(ShippingCiSourceRow {
            item,
            description,
            qty,
        });
    }
    if rows.is_empty() {
        return Err(anyhow!("商业发票未解析到有效行"));
    }
    Ok(rows)
}

fn find_qty_column(headers: &[String]) -> Option<usize> {
    headers.iter().position(|h| {
        let n = h.trim().to_lowercase();
        n == "qty" || n == "quantity" || n.contains("qty")
    })
}

fn hash_group_source_fingerprint(sources: &[ShippingCiDiscoveredFile]) -> String {
    let mut parts: Vec<String> = sources
        .iter()
        .filter_map(|s| {
            scanner::file_md5(Path::new(&s.file_path))
                .ok()
                .map(|md5| format!("{}:{md5}", s.file_name))
        })
        .collect();
    parts.sort();
    if parts.is_empty() {
        return format!("empty-{}", sources.len());
    }
    hex::encode(Sha256::digest(parts.join("||").as_bytes()))
}

fn shipping_ci_item_key(item: &str) -> String {
    let key = normalize_item_key(item);
    key.strip_suffix(".0")
        .map(|s| s.to_string())
        .unwrap_or(key)
}

fn segment_normalized_item_key(item: &str) -> String {
    item.split('.')
        .map(|part| {
            let part = part.trim();
            if let Ok(n) = part.parse::<f64>() {
                if n.fract().abs() < f64::EPSILON {
                    return (n as i64).to_string();
                }
                return n.to_string();
            }
            part.to_uppercase()
        })
        .collect::<Vec<_>>()
        .join(".")
        .replace(' ', "")
        .to_uppercase()
}

fn boq_item_lookup_keys(item: &str) -> Vec<String> {
    vec![
        shipping_ci_item_key(item),
        segment_normalized_item_key(item),
    ]
}

fn ci_item_matches_boq(ci_item: &str, boq_keys: &HashSet<String>) -> bool {
    boq_item_lookup_keys(ci_item)
        .iter()
        .any(|k| boq_keys.contains(k))
}

fn is_summary_ci_label(item: &str) -> bool {
    let n = item.trim().to_lowercase();
    n.contains("total")
        || n.contains("subtotal")
        || n.contains("grand")
        || n.contains("boq value")
}

fn merge_shipping_ci_rows(rows: Vec<ShippingCiSourceRow>) -> Vec<ShippingCiSourceRow> {
    let mut map: HashMap<String, ShippingCiSourceRow> = HashMap::new();
    for row in rows {
        if row.item.trim().is_empty() {
            continue;
        }
        let key = shipping_ci_item_key(&row.item);
        if let Some(existing) = map.get_mut(&key) {
            if let (Some(a), Some(b)) = (existing.qty, row.qty) {
                existing.qty = Some(a + b);
            } else if row.qty.is_some() {
                existing.qty = row.qty;
            }
            if existing.description.trim().is_empty() && !row.description.trim().is_empty() {
                existing.description = row.description.clone();
            }
        } else {
            map.insert(key, row);
        }
    }
    let mut out: Vec<_> = map.into_values().collect();
    out.sort_by(|a, b| compare_item_numbers(&a.item, &b.item));
    out
}

/// Item 编号按数字分段比较：4 < 4.1 < 11 < 22.1 < 22.1.2 < 22.1.13。
/// 非数字段按文本比较且排在同位置数字段之后。
fn compare_item_numbers(a: &str, b: &str) -> std::cmp::Ordering {
    fn segments(s: &str) -> Vec<(u8, u64, String)> {
        s.trim()
            .trim_matches('.')
            .split('.')
            .map(|p| {
                let p = p.trim();
                match p.parse::<u64>() {
                    Ok(n) => (0u8, n, String::new()),
                    Err(_) => (1u8, 0, p.to_uppercase()),
                }
            })
            .collect()
    }
    segments(a).cmp(&segments(b))
}

fn resolve_boq_reference(
    workspace: &Path,
    ci_path: &Path,
    sch_ipc_dir: &Path,
) -> Result<(PathBuf, &'static str)> {
    let substation_lot = sch_ipc_dir.parent().unwrap_or(sch_ipc_dir);
    let search_roots = vec![
        Some(sch_ipc_dir.to_path_buf()),
        Some(substation_lot.to_path_buf()),
        ci_path.parent().map(|p| p.to_path_buf()),
        ci_path.parent().and_then(|p| p.parent()).map(|p| p.to_path_buf()),
        Some(workspace.to_path_buf()),
    ];
    for root in search_roots.into_iter().flatten() {
        if let Some(aligned) = find_aligned_in_dir(&root) {
            return Ok((aligned, "BOQ_aligned"));
        }
    }
    for root in [
        ci_path.parent().map(|p| p.to_path_buf()),
        Some(workspace.to_path_buf()),
    ]
    .into_iter()
    .flatten()
    {
        if let Some(boq) = find_canonical_boq_in_dir(&root) {
            return Ok((boq, "BOQ.xlsx"));
        }
    }
    Err(anyhow!(
        "未找到 BOQ_aligned 或 BOQ.xlsx，请先运行工作 1 生成合同价格表"
    ))
}

fn find_aligned_in_dir(dir: &Path) -> Option<PathBuf> {
    let entries = std::fs::read_dir(dir).ok()?;
    let mut candidates: Vec<PathBuf> = entries
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| align::is_aligned_master_path(p))
        .collect();
    candidates.sort_by_key(|p| std::fs::metadata(p).and_then(|m| m.modified()).ok());
    candidates.pop()
}

fn find_canonical_boq_in_dir(dir: &Path) -> Option<PathBuf> {
    let entries = std::fs::read_dir(dir).ok()?;
    entries
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .find(|p| {
            let name = p.file_name().and_then(|s| s.to_str()).unwrap_or_default().to_lowercase();
            name.contains("boq")
                && name.ends_with(".xlsx")
                && !name.contains("aligned")
                && !name.contains("original")
        })
}

/// 返回（对照行, 实际使用的分表名）；分表名含货币后缀（如 Schedule1-USD）
fn load_boq_reference_rows(
    boq_path: &Path,
    sch_digit: u8,
) -> Result<(Vec<BoqReferenceRow>, String)> {
    let state = if align::is_aligned_master_path(boq_path) {
        align::load_master_workbook(boq_path)?
    } else {
        align::load_master_workbook_for_boq_format(boq_path)?
    };
    let sheet_name = state
        .sheets
        .keys()
        .find(|n| align::schedule_sheet_number(n) == Some(sch_digit))
        .or_else(|| {
            state
                .sheets
                .keys()
                .find(|n| align::schedule_sheet_number(n).is_some())
        })
        .cloned()
        .ok_or_else(|| anyhow!("母表缺少 Schedule{sch_digit} 分表"))?;
    let sheet = state.sheets.get(&sheet_name).expect("sheet");
    let headers = &sheet.headers;
    let layout = align::detect_boq_column_layout(headers, sheet.item_col);
    let item_col = sheet.item_col;
    let desc_col = layout.description_col;
    let period_cols = &sheet.period_columns;

    let mut rows = Vec::new();
    for row in &sheet.rows {
        let item = row.cells.get(item_col).cloned().unwrap_or_default();
        if item.trim().is_empty() || !is_boq_matchable_item(&item) {
            continue;
        }
        let unit_price = row
            .cells
            .get(layout.unit_price_col)
            .and_then(|v| parse_boq_number(v))
            .unwrap_or(0.0);
        let previous_qty = period_cols
            .values()
            .filter_map(|&col| {
                row.cells
                    .get(col)
                    .and_then(|v| parse_boq_number(v))
                    .filter(|n| n.abs() > 0.0)
            })
            .last()
            .unwrap_or(0.0);
        rows.push(BoqReferenceRow {
            item,
            description: desc_col
                .and_then(|c| row.cells.get(c))
                .cloned()
                .unwrap_or_default(),
            unit: layout
                .unit_col
                .and_then(|c| row.cells.get(c))
                .cloned()
                .unwrap_or_default(),
            est_qty: layout
                .qty_col
                .and_then(|c| row.cells.get(c))
                .and_then(|v| parse_boq_number(v)),
            unit_price,
            previous_qty,
        });
    }
    Ok((rows, sheet_name))
}

#[derive(Clone)]
struct ProgressRow {
    item: String,
    description: String,
    unit: String,
    est_qty: Option<f64>,
    unit_price: f64,
    previous: f64,
    current: f64,
    end_total: f64,
    proportion: Option<f64>,
    current_total_price: f64,
}

fn is_boq_matchable_item(item: &str) -> bool {
    let t = item.trim();
    !t.is_empty()
        && (t.contains('.')
            || t.chars().any(|c| c.is_ascii_alphabetic())
            || t.parse::<f64>().is_ok())
}

fn is_progress_payment_ci_template(workspace: &Path, path: &Path) -> bool {
    let name = path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or_default()
        .to_lowercase();
    if !name.ends_with(".xlsx") || name.starts_with("~$") || is_packing_list_file_name(&name) {
        return false;
    }
    if is_shipping_commercial_invoice_candidate(workspace, path) {
        return false;
    }
    is_likely_progress_ipc_invoice_filename(path)
}

/// 进度款发票模板候选项排名要素
struct ProgressCiTemplateCandidate {
    /// 0=同 Schedule，1=Schedule 未知，2=不同 Schedule
    sch_rank: u8,
    modified: Option<std::time::SystemTime>,
    /// 越小越靠近当前 SCHn-IPCx 文件夹
    scope: usize,
    path: PathBuf,
}

/// 候选模板与目标 Schedule 的匹配等级（不同 Schedule 的发票格式可能不同）
fn progress_ci_template_sch_rank(path: &Path, target_sch: u8) -> u8 {
    match sch_digit_from_context(path) {
        Some(d) if d == target_sch => 0,
        None => 1,
        Some(_) => 2,
    }
}

/// 收集目录内已完成的进度款商业发票候选项（不要求与本期 IPC 期号一致）
fn collect_progress_ci_template_candidates_in_dir(
    workspace: &Path,
    dir: &Path,
    target_sch: u8,
    scope: usize,
    out: &mut Vec<ProgressCiTemplateCandidate>,
) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.filter_map(|e| e.ok()) {
        let path = entry.path();
        if !path.is_file() || !is_progress_payment_ci_template(workspace, &path) {
            continue;
        }
        let modified = std::fs::metadata(&path).and_then(|m| m.modified()).ok();
        out.push(ProgressCiTemplateCandidate {
            sch_rank: progress_ci_template_sch_rank(&path, target_sch),
            modified,
            scope,
            path,
        });
    }
}

/// 模板优先级：同 Schedule > Schedule 未知 > 跨 Schedule（不同 Schedule 格式可能不同）；
/// 同级中取修改时间距现在最近者，再按目录就近。搜索范围：
/// 当前 SCHn-IPCx 文件夹 → 工作区内上级及同级 SCH 文件夹 → File Templates。
fn find_progress_ci_template(workspace: &Path, sch_ipc_dir: &Path, target_sch: u8) -> Option<PathBuf> {
    let mut candidates = Vec::new();
    let mut scope = 0usize;
    collect_progress_ci_template_candidates_in_dir(workspace, sch_ipc_dir, target_sch, scope, &mut candidates);

    let mut walk = sch_ipc_dir.parent();
    while let Some(parent) = walk {
        if !parent.starts_with(workspace) {
            break;
        }
        scope += 1;
        collect_progress_ci_template_candidates_in_dir(workspace, parent, target_sch, scope, &mut candidates);
        if let Ok(entries) = std::fs::read_dir(parent) {
            for entry in entries.filter_map(|e| e.ok()) {
                let path = entry.path();
                if !path.is_dir() {
                    continue;
                }
                let name = path.file_name().and_then(|s| s.to_str()).unwrap_or_default();
                if !sch_ipc_folder_re().is_match(name) || path == sch_ipc_dir {
                    continue;
                }
                collect_progress_ci_template_candidates_in_dir(
                    workspace,
                    &path,
                    target_sch,
                    scope + 1,
                    &mut candidates,
                );
            }
        }
        walk = parent.parent();
    }

    if !candidates.is_empty() {
        candidates.sort_by(|a, b| {
            a.sch_rank
                .cmp(&b.sch_rank)
                // 修改时间新者在前（None 视为最旧）
                .then_with(|| b.modified.cmp(&a.modified))
                .then_with(|| a.scope.cmp(&b.scope))
                .then_with(|| a.path.cmp(&b.path))
        });
        return Some(candidates.swap_remove(0).path);
    }
    find_file_templates_progress_ci(workspace)
}

fn find_file_templates_progress_ci(workspace: &Path) -> Option<PathBuf> {
    for dir_name in ["File Templates", "file templates", "文件模板"] {
        let root = workspace.join(dir_name);
        if !root.is_dir() {
            continue;
        }
        if let Some(found) = find_progress_ci_template_recursive(&root) {
            return Some(found);
        }
    }
    None
}

fn find_progress_ci_template_recursive(dir: &Path) -> Option<PathBuf> {
    let entries = std::fs::read_dir(dir).ok()?;
    for entry in entries.filter_map(|e| e.ok()) {
        let path = entry.path();
        if path.is_dir() {
            if let Some(found) = find_progress_ci_template_recursive(&path) {
                return Some(found);
            }
            continue;
        }
        let name = path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or_default()
            .to_lowercase();
        if !name.ends_with(".xlsx") {
            continue;
        }
        if name.contains("progress")
            || (name.contains("commercial") && name.contains("invoice"))
            || name.contains("ipc")
        {
            return Some(path);
        }
    }
    None
}

fn build_progress_rows(ci_rows: &[ShippingCiSourceRow], boq_rows: &[BoqReferenceRow]) -> Vec<ProgressRow> {
    let mut boq_map: HashMap<String, &BoqReferenceRow> = HashMap::new();
    for row in boq_rows {
        for key in boq_item_lookup_keys(&row.item) {
            boq_map.entry(key).or_insert(row);
        }
    }
    let mut out = Vec::new();
    for ci in ci_rows {
        let boq = boq_item_lookup_keys(&ci.item)
            .iter()
            .find_map(|key| boq_map.get(key).copied());
        let current = ci.qty.unwrap_or(0.0);
        let (unit, est_qty, unit_price, previous) = if let Some(b) = boq {
            (
                b.unit.clone(),
                b.est_qty,
                b.unit_price,
                b.previous_qty,
            )
        } else {
            (String::new(), None, 0.0, 0.0)
        };
        let end_total = previous + current;
        let proportion = est_qty
            .filter(|q| q.abs() > f64::EPSILON)
            .map(|q| end_total / q);
        let current_total = unit_price * current;
        out.push(ProgressRow {
            item: ci.item.clone(),
            description: if ci.description.trim().is_empty() {
                boq.map(|b| b.description.clone()).unwrap_or_default()
            } else {
                ci.description.clone()
            },
            unit,
            est_qty,
            unit_price,
            previous,
            current,
            end_total,
            proportion,
            current_total_price: current_total,
        });
    }
    out
}

fn sch_ipc_folder_batch_number(folder_name: &str) -> Option<String> {
    static BATCH_RE: OnceLock<Regex> = OnceLock::new();
    let re = BATCH_RE.get_or_init(|| Regex::new(r"(?i)sch\s*\d+\s*[-_]\s*(\d{4,})").unwrap());
    re.captures(folder_name)
        .and_then(|c| c.get(1).map(|m| m.as_str().to_string()))
}

/// 输出名规则：`{项目文件夹}-SCH{n}-{IPC期号}.xlsx`，
/// 如 SSLOT4/7.SCH 1-2025004(IPC7)-… 下输出 `SSLOT4-SCH1-IPC7.xlsx`
fn build_progress_output_filename(
    workspace: &Path,
    sch_ipc_dir: &Path,
    sch: u8,
    period: &str,
) -> String {
    let project = sch_ipc_dir
        .parent()
        .and_then(|p| scanner::extract_project_name(p, workspace))
        .or_else(|| scanner::extract_project_name(sch_ipc_dir, workspace))
        .unwrap_or_else(|| "PROJECT".to_string());
    let ipc_code = period.to_uppercase().replace(' ', "");
    format!("{project}-SCH{sch}-{ipc_code}.xlsx")
}

fn write_progress_ipc_workbook(output: &Path, _period: &str, _sch: u8, rows: &[ProgressRow]) -> Result<()> {
    let mut workbook = Workbook::new();
    let worksheet = workbook.add_worksheet();
    worksheet.set_name("Commercial Invoice")?;

    let header_fmt = Format::new().set_bold().set_border(rust_xlsxwriter::FormatBorder::Thin);
    let headers = [
        "Item",
        "Description",
        "Unit",
        "Est. Qty.",
        "Unit Price",
        "Previous",
        "Current",
        "Period-End Comp. Total Qty",
        "Completed Settlement Proportion",
        "Current Total Price",
    ];
    for (col, h) in headers.iter().enumerate() {
        worksheet.write_string_with_format(0, col as u16, *h, &header_fmt)?;
    }

    let num_fmt = Format::new()
        .set_num_format("#,##0.00")
        .set_align(FormatAlign::Right);
    for (i, row) in rows.iter().enumerate() {
        let r = (i + 1) as u32;
        worksheet.write_string(r, 0, &row.item)?;
        worksheet.write_string(r, 1, &row.description)?;
        worksheet.write_string(r, 2, &row.unit)?;
        if let Some(q) = row.est_qty {
            worksheet.write_number_with_format(r, 3, q, &num_fmt)?;
        }
        worksheet.write_number_with_format(r, 4, row.unit_price, &num_fmt)?;
        worksheet.write_number_with_format(r, 5, row.previous, &num_fmt)?;
        worksheet.write_number_with_format(r, 6, row.current, &num_fmt)?;
        worksheet.write_number_with_format(r, 7, row.end_total, &num_fmt)?;
        if let Some(p) = row.proportion {
            worksheet.write_number_with_format(r, 8, p, &num_fmt)?;
        }
        worksheet.write_number_with_format(r, 9, row.current_total_price, &num_fmt)?;
    }

    workbook.save(output)?;
    Ok(())
}

/// 从 BOQ 分表名提取货币代码（如 Schedule1-USD → USD）
fn currency_from_sheet_name(sheet_name: &str) -> Option<String> {
    let upper = sheet_name.to_uppercase();
    ["USD", "TZS", "EUR", "CNY", "RMB"]
        .iter()
        .find(|cur| upper.contains(*cur))
        .map(|cur| (*cur).to_string())
}

fn build_progress_ci_write_job(
    output: &Path,
    period: &str,
    sch_digit: u8,
    currency: Option<String>,
    batch_number: Option<String>,
    rows: &[ProgressRow],
) -> ProgressCiWriteJob {
    ProgressCiWriteJob {
        output_path: output.display().to_string(),
        period_column_header: period.to_string(),
        sch_digit,
        currency,
        batch_number,
        rows: rows.iter().map(progress_row_to_write_row).collect(),
    }
}

fn progress_row_to_write_row(row: &ProgressRow) -> ProgressCiWriteRow {
    ProgressCiWriteRow {
        item: row.item.clone(),
        description: row.description.clone(),
        unit: row.unit.clone(),
        est_qty: row.est_qty,
        unit_price: row.unit_price,
        previous: row.previous,
        current: row.current,
        end_total: row.end_total,
        proportion: row.proportion,
        current_total_price: row.current_total_price,
    }
}

fn build_aligned_ipc_write_job(
    aligned_path: &Path,
    sch_digit: u8,
    period: &str,
    rows: &[ProgressRow],
) -> Result<AlignedIpcWriteJob, String> {
    let state = align::load_master_workbook(aligned_path).map_err(|e| e.to_string())?;
    let sheet_name = state
        .sheets
        .keys()
        .find(|n| align::schedule_sheet_number(n) == Some(sch_digit))
        .cloned()
        .ok_or_else(|| format!("aligned 母表缺少 Schedule{sch_digit}"))?;
    let writes: Vec<AlignedIpcWriteRow> = rows
        .iter()
        .filter(|r| r.unit_price.abs() > f64::EPSILON || r.current_total_price.abs() > f64::EPSILON)
        .map(|r| AlignedIpcWriteRow {
            item: r.item.clone(),
            unit_price: r.unit_price,
            amount: r.current_total_price,
        })
        .collect();
    Ok(AlignedIpcWriteJob {
        master_path: aligned_path.display().to_string(),
        worksheet_name: sheet_name,
        period_column_header: period.to_string(),
        rows: writes,
    })
}

fn invalid_args(message: String) -> ShippingCiWorkflowResponse {
    ShippingCiWorkflowResponse {
        ok: false,
        report: None,
        error_code: Some(ErrorCode::InvalidArgs),
        error_message: Some(message),
    }
}

fn internal_err(message: String) -> ShippingCiWorkflowResponse {
    ShippingCiWorkflowResponse {
        ok: false,
        report: None,
        error_code: Some(ErrorCode::InternalError),
        error_message: Some(message),
    }
}

fn failure_response(
    code: ErrorCode,
    message: String,
    workspace: &Path,
    discovered_files: Vec<ShippingCiDiscoveredFile>,
    log_path: &str,
) -> ShippingCiWorkflowResponse {
    ShippingCiWorkflowResponse {
        ok: false,
        report: Some(ShippingCiWorkflowReport {
            processed_at: Utc::now().to_rfc3339(),
            workspace_root: workspace.display().to_string(),
            success_count: 0,
            skipped_count: 0,
            failed_count: 0,
            discovered_files,
            files: Vec::new(),
            output_paths: Vec::new(),
            aligned_ipc_write_jobs: Vec::new(),
            progress_ci_write_jobs: Vec::new(),
            shipping_ci_process_log_path: log_path.to_string(),
            pending_ledger_commits: Vec::new(),
        }),
        error_code: Some(code),
        error_message: Some(message),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sch_digit_from_context_prefers_sch_ipc_folder() {
        // CIP 自身文件名无 SCH，应取上级 SCHn-IPCx 文件夹中的分项号
        assert_eq!(
            sch_digit_from_context(Path::new(
                "/ws/SSLOT4/7.SCH 1-2025004(IPC7)-USD-CIRCUIT BREAKER/HQW46-LOT4-QG006/HQW46-LOT4-QG006-CIP.xlsx"
            )),
            Some(1)
        );
        assert_eq!(
            sch_digit_from_context(Path::new(
                "/ws/SSLOT4/2.SS-LOT4-TDM-SCH4-2025002(IPC002)/HQW46-LOT4-QG001-CIF.xlsx"
            )),
            Some(4)
        );
        // 无任何 SCH 上下文时返回 None（由调用方兜底）
        assert_eq!(
            sch_digit_from_context(Path::new("/ws/SSLOT4/misc/QG999-CIP.xlsx")),
            None
        );
    }

    /// 真实数据回归：SCH1 文件夹内的 CIP 不应被 SCH4 历史模板带偏到 Schedule4，
    /// 且 Item 22.1/22.1.1~22.1.13 应在 Schedule1 中全部匹配。
    #[test]
    fn desktop_test_root_sslot4_sch1_cip_matches_schedule1() {
        let workspace = Path::new("/Users/wangxy/Desktop/test");
        let cip = workspace.join(
            "SSLOT4/7.SCH 1-2025004(IPC7)-USD-CIRCUIT BREAKER/HQW46-LOT4-QG006/HQW46-LOT4-QG006-CIP.xlsx",
        );
        if !cip.is_file() {
            return;
        }

        assert_eq!(sch_digit_from_context(&cip), Some(1));

        let sch_ipc_dir = sch_ipc_folder_path(workspace, &cip).expect("sch_ipc_dir");
        // 历史模板来自 SCH4 兄弟目录（先前误导 BOQ 分表选择的来源），现仅作兜底
        let template = find_progress_ci_template(workspace, &sch_ipc_dir, 1);
        let resolved = sch_digit_from_context(&cip)
            .or_else(|| {
                template
                    .as_ref()
                    .and_then(|p| scanner::extract_sch_schedule_number(p))
            })
            .unwrap_or(1);
        assert_eq!(resolved, 1, "BOQ 对照分表应为 Schedule1，而非模板的 SCH 号");

        let rows = read_shipping_ci_rows(&cip).expect("read CIP rows");
        let (boq_path, boq_kind) =
            resolve_boq_reference(workspace, &cip, &sch_ipc_dir).expect("resolve BOQ");
        let (boq_rows, _boq_sheet_name) =
            load_boq_reference_rows(&boq_path, resolved).expect("load BOQ rows");
        let validation = validate_ci_rows_against_boq(
            &rows,
            &boq_rows,
            boq_kind,
            resolved,
            &boq_path.display().to_string(),
        );
        assert!(
            validation.analysis_ok,
            "CIP 应与 Schedule1 全部匹配，mismatches: {:?}",
            validation.mismatches
        );
    }

    #[test]
    fn detects_shipping_ci_filename() {
        let ws = Path::new("/ws");
        assert!(is_shipping_commercial_invoice_candidate(
            ws,
            Path::new("/ws/SCH1-IPC007/FOB Commercial Invoice.xlsx")
        ));
        assert!(is_shipping_commercial_invoice_candidate(
            ws,
            Path::new("/ws/SSLOT2/SCH1-IPC12/TBEA-HQW46-LOT2-QG031--CIF.xlsx")
        ));
        assert!(is_shipping_commercial_invoice_candidate(
            ws,
            Path::new("/ws/TLLOT3/SCH1-IPC17/TBEA-HQW45-QG039--CIP-LOT3.xlsx")
        ));
        assert!(!is_shipping_commercial_invoice_candidate(
            ws,
            Path::new("/ws/SCH1-IPC007/TAZASSLOT1-SCH1-IPC007.xlsx")
        ));
        assert!(!is_shipping_commercial_invoice_candidate(
            ws,
            Path::new("/ws/SSLOT2/TBEA-HQW46-LOT2-QG031--CIF.xlsx")
        ));
        assert!(!is_shipping_commercial_invoice_candidate(
            ws,
            Path::new("/ws/SSLOT2/SCH1-IPC12/TBEA-Packing List-CIF.xlsx")
        ));
    }

    #[test]
    fn path_in_nested_sch_ipc_folder() {
        let ws = Path::new("/Users/wangxy/Desktop/test");
        assert!(path_in_sch_ipc_folder(
            ws,
            Path::new("/Users/wangxy/Desktop/test/SSLOT2/SCH1-IPC12/file.xlsx")
        ));
    }

    #[test]
    fn sch_ipc_folder_pattern() {
        assert!(sch_ipc_folder_re().is_match("SCH4-IPC002"));
        assert!(sch_ipc_folder_re().is_match("SCH 1 - IPC007"));
        assert!(sch_ipc_folder_re().is_match("SCH1-2025004 (IPC7)"));
    }

    #[test]
    fn progress_output_filename_uses_lot_folder_and_ipc_folder() {
        let ws = Path::new("/ws");
        let dir = Path::new("/ws/SSLOT4/7.SCH 1-2025004(IPC7)-USD-CIRCUIT BREAKER");
        let name = build_progress_output_filename(ws, dir, 1, "IPC7");
        assert_eq!(name, "SSLOT4-SCH1-IPC7.xlsx");
    }

    #[test]
    fn ipc_period_prefers_sch_ipc_folder_name() {
        // CIP 文件名无 IPC 期号，期号来自 SCHn-IPCx 文件夹名（含 '.' 前缀也能识别）
        let cip = Path::new(
            "/ws/SSLOT4/7.SCH 1-2025004(IPC7)-USD-CIRCUIT BREAKER/HQW46-LOT4-QG006/HQW46-LOT4-QG006-CIP.xlsx",
        );
        let (period, sch) = ipc_period_and_sch_from_context(cip);
        assert_eq!(period, "IPC7");
        assert_eq!(sch, 1);

        // 文件夹名中的期号优先于同文件夹其他文件/文件名中的期号
        let in_folder = Path::new("/ws/SSLOT4/SCH4-IPC002/SS-LOT4-CIP (IPC9).xlsx");
        let (period, _) = ipc_period_and_sch_from_context(in_folder);
        assert_eq!(period, "IPC002");
    }

    #[test]
    fn merge_rows_sorted_by_numeric_item_segments() {
        let rows: Vec<ShippingCiSourceRow> = ["22.1.13", "4", "11", "4.1", "22.1.2", "22.1", "11.1"]
            .iter()
            .map(|item| ShippingCiSourceRow {
                item: (*item).to_string(),
                description: String::new(),
                qty: Some(1.0),
            })
            .collect();
        let sorted: Vec<String> = merge_shipping_ci_rows(rows).into_iter().map(|r| r.item).collect();
        assert_eq!(sorted, vec!["4", "4.1", "11", "11.1", "22.1", "22.1.2", "22.1.13"]);
    }

    #[test]
    fn progress_template_prefers_same_schedule_over_recency_and_proximity() {
        let ws = std::env::temp_dir().join(format!("epc_tmpl_same_sch_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&ws);
        let cur = ws.join("SSLOT4/7.SCH 1-2025004(IPC7)-USD-CIRCUIT BREAKER");
        let sch4_dir = ws.join("SSLOT4/2.SS-LOT4-TDM-SCH4-2025002(IPC002)-施工");
        let sch1_dir = ws.join("SSLOT4/1.SCH 1-2025001(IPC5)");
        for d in [&cur, &sch4_dir, &sch1_dir] {
            std::fs::create_dir_all(d).unwrap();
        }
        // 当前文件夹内只有 SCH4 格式的旧发票（更近、更新），同 Schedule 的在兄弟文件夹
        let sch4_in_cur = cur.join("SS-LOT4-TDM-SCH4-2025002 (IPC002).xlsx");
        let sch4_sibling = sch4_dir.join("SS-LOT4-TDM-SCH4-2025002 (IPC002).xlsx");
        let sch1_sibling = sch1_dir.join("SS-LOT4-TDM-SCH1-2025001 (IPC005).xlsx");
        for f in [&sch4_in_cur, &sch4_sibling, &sch1_sibling] {
            std::fs::write(f, b"x").unwrap();
        }
        // SCH1 候选刻意设为最旧，验证「同 Schedule」优先于「更近/更新」
        let old = std::time::SystemTime::now() - std::time::Duration::from_secs(86_400 * 30);
        std::fs::File::options()
            .write(true)
            .open(&sch1_sibling)
            .unwrap()
            .set_modified(old)
            .unwrap();

        let found = find_progress_ci_template(&ws, &cur, 1);
        assert_eq!(found.as_deref(), Some(sch1_sibling.as_path()));
        let _ = std::fs::remove_dir_all(&ws);
    }

    #[test]
    fn progress_template_prefers_recent_within_same_schedule() {
        let ws = std::env::temp_dir().join(format!("epc_tmpl_recent_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&ws);
        let cur = ws.join("SSLOT4/7.SCH 1-2025004(IPC7)-USD");
        std::fs::create_dir_all(&cur).unwrap();
        let older = cur.join("SS-LOT4-TDM-SCH1-2025001 (IPC005).xlsx");
        let newer = cur.join("SS-LOT4-TDM-SCH1-2025003 (IPC006).xlsx");
        for f in [&older, &newer] {
            std::fs::write(f, b"x").unwrap();
        }
        let now = std::time::SystemTime::now();
        std::fs::File::options()
            .write(true)
            .open(&older)
            .unwrap()
            .set_modified(now - std::time::Duration::from_secs(86_400 * 60))
            .unwrap();
        std::fs::File::options()
            .write(true)
            .open(&newer)
            .unwrap()
            .set_modified(now - std::time::Duration::from_secs(60))
            .unwrap();

        let found = find_progress_ci_template(&ws, &cur, 1);
        assert_eq!(found.as_deref(), Some(newer.as_path()));
        let _ = std::fs::remove_dir_all(&ws);
    }

    #[test]
    fn currency_from_sheet_name_extracts_known_codes() {
        assert_eq!(
            currency_from_sheet_name("Schedule1-USD"),
            Some("USD".to_string())
        );
        assert_eq!(
            currency_from_sheet_name("Schedule4-TZS"),
            Some("TZS".to_string())
        );
        assert_eq!(currency_from_sheet_name("Schedule2"), None);
    }

    #[test]
    fn finds_progress_template_without_matching_current_ipc() {
        let ws = Path::new("/ws");
        let template = Path::new(
            "/ws/SSLOT4/SCH1-2025004 (IPC7)/SS-LOT4-TDM-SCH4-2025002 (IPC002).xlsx",
        );
        assert!(is_progress_payment_ci_template(ws, template));
        assert!(is_likely_progress_ipc_invoice_filename(template));
    }

    #[test]
    fn segment_item_keys_treat_equivalent_codes_as_match() {
        let keys: HashSet<String> = boq_item_lookup_keys("1.01").into_iter().collect();
        assert!(ci_item_matches_boq("1.1", &keys));
    }

    #[test]
    fn step2_validation_marks_description_match_item_mismatch() {
        let boq = vec![BoqReferenceRow {
            item: "1.01".to_string(),
            description: "Concrete works".to_string(),
            unit: "m3".to_string(),
            est_qty: Some(10.0),
            unit_price: 100.0,
            previous_qty: 0.0,
        }];
        let ci = vec![ShippingCiSourceRow {
            item: "2.01".to_string(),
            description: "Concrete works".to_string(),
            qty: Some(1.0),
        }];
        let result = validate_ci_rows_against_boq(&ci, &boq, "BOQ_aligned", 1, "/ws/boq.xlsx");
        assert!(!result.analysis_ok);
        assert_eq!(result.description_match_count, 1);
        assert_eq!(result.mismatches[0].boq_item.as_deref(), Some("1.01"));
        assert_eq!(result.mismatches.len(), 1);
        assert_eq!(
            result.mismatches[0].kind,
            ShippingCiMismatchKind::DescriptionMatchItemMismatch
        );
    }

    #[test]
    fn step2_validation_passes_when_items_match() {
        let boq = vec![BoqReferenceRow {
            item: "1.01".to_string(),
            description: "Concrete works".to_string(),
            unit: "m3".to_string(),
            est_qty: Some(10.0),
            unit_price: 100.0,
            previous_qty: 0.0,
        }];
        let ci = vec![ShippingCiSourceRow {
            item: "1.01".to_string(),
            description: "Concrete works".to_string(),
            qty: Some(1.0),
        }];
        let result = validate_ci_rows_against_boq(&ci, &boq, "BOQ_aligned", 1, "/ws/boq.xlsx");
        assert!(result.analysis_ok);
        assert_eq!(result.matched_row_count, 1);
        assert!(result.mismatches.is_empty());
    }
}
