use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use anyhow::{anyhow, Context, Result};
use calamine::{open_workbook_auto, Data, DataType, Reader};
use chrono::{Datelike, Duration, NaiveDate, Utc};
use regex::Regex;
use rust_xlsxwriter::{Color, Format, FormatAlign, FormatBorder, Workbook, ExcelDateTime};
use walkdir::WalkDir;

use crate::data_overrides::{self, DataOverridesFile, PaymentDataPatch};
use crate::ledger::{
    ledger_path, payment_data_root, payment_ledger_path, LedgerStatus, ProcessLedger,
};
use super::align;
use super::scanner::{self, file_md5};
use crate::types::{
    DiscoveredAlignedWorkbook, ErrorCode, IpcFileStatus, PaymentAlignedQueue, PaymentFileResult,
    PaymentIncompleteUnit, PaymentWorkflowReport, PaymentWorkflowResponse,
    WorkspacePaymentWorkflowRequest,
};

const IPC_PAYMENT_HEADERS: [&str; 18] = [
    "project_id",
    "substation_lot",
    "schedule",
    "currency",
    "ipc_no",
    "ipc_application",
    "advance_payment_retention",
    "other_retentions",
    "price_adjustment",
    "price_revise",
    "ipc_amount_due",
    "ipc_amount_due1",
    "ipc_amount_due2",
    "effective_date",
    "period",
    "due_date",
    "paid_date1",
    "paid_date2",
];

const PROJECT_IPC_BASE_HEADERS: [&str; 7] = [
    "project_id",
    "substation_lot",
    "schedule",
    "currency",
    "boq_amount",
    "total_ipc_amount",
    "percentage_completed",
];

const PAYMENT_AMOUNT_HEADERS: [&str; 8] = [
    "ipc_application",
    "advance_payment_retention",
    "other_retentions",
    "price_adjustment",
    "price_revise",
    "ipc_amount_due",
    "ipc_amount_due1",
    "ipc_amount_due2",
];

const PAYMENT_DATE_HEADERS: [&str; 4] = [
    "effective_date",
    "due_date",
    "paid_date1",
    "paid_date2",
];

/// 无法从 aligned / 工作 4 统计得出，仅用户或大模型维护；工作 5 重算时不得覆盖（修订层 lock 仍优先）。
pub const PAYMENT_USER_MANAGED_FIELDS: [&str; 9] = [
    "price_adjustment",
    "price_revise",
    "ipc_amount_due1",
    "ipc_amount_due2",
    "effective_date",
    "period",
    "due_date",
    "paid_date1",
    "paid_date2",
];

#[derive(Debug, Clone, Copy, Default)]
pub struct RecalculatePaymentOptions {
    /// 工作 5 等工作流：只重算引擎可从 aligned 推导的列，不写入手工/回款列。
    pub workflow_mode: bool,
}

impl RecalculatePaymentOptions {
    pub fn workflow() -> Self {
        Self { workflow_mode: true }
    }

    pub fn after_user_edit() -> Self {
        Self { workflow_mode: false }
    }
}

const PROJECT_AMOUNT_HEADERS: [&str; 3] = ["boq_amount", "total_ipc_amount", "percentage_completed"];

/// `process_aligned_file` 在账本已 SUCCESS 但汇总表缺列时补齐后仍标记为 Skipped，并带此原因
const BACKFILL_SKIP_REASON: &str = "账本已记录，已补齐缺失的支付/项目汇总列";

#[derive(Debug, Clone)]
struct AlignedFileSummary {
    file_path: PathBuf,
    file_name: String,
    sheet_name: String,
    ledger_key: String,
    project_id: String,
    substation_lot: String,
    schedule: String,
    currency: String,
    ipc_no: String,
    ipc_column: String,
    ipc_amount: f64,
    boq_amount: f64,
    md5: String,
}

#[derive(Debug, Clone)]
struct SheetIpcExtract {
    sheet_name: String,
    schedule: String,
    ipc_column: String,
    amount: f64,
    currency: String,
    boq_amount: f64,
}

#[derive(Debug, Clone)]
struct ParsedFilenameMeta {
    project_id: String,
    substation_lot: String,
    currency: String,
    ipc_no: String,
}

#[derive(Debug, Clone)]
struct PaymentRow {
    key: String,
    values: HashMap<String, String>,
}

#[derive(Debug, Clone)]
struct ProjectRow {
    key: String,
    values: HashMap<String, String>,
}

pub fn run_workspace_payment_workflow(request: &WorkspacePaymentWorkflowRequest) -> PaymentWorkflowResponse {
    let workspace = Path::new(&request.workspace_root);
    if !workspace.is_dir() {
        return invalid_args(format!("工作区目录不存在: {}", workspace.display()));
    }

    let data_dir = Path::new(&request.data_dir);
    let ipc_process_log_path = ledger_path(workspace);
    let process_ledger = ProcessLedger::load(workspace, data_dir);

    let payment_root = payment_data_root(workspace);
    if let Err(err) = fs::create_dir_all(&payment_root) {
        return internal_err(format!("创建 payment 目录失败: {err}"));
    }

    let payment_log_path = payment_ledger_path(workspace);
    let payment_ledger = ProcessLedger::load_payment(workspace, data_dir);

    let default_period = request
        .period
        .as_ref()
        .map(|s| s.trim().to_uppercase())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "IPCX".to_string());

    let workbook_paths = list_aligned_workbook_paths(workspace);
    if workbook_paths.is_empty() {
        return step1_failure(
            workspace,
            &default_period,
            &ipc_process_log_path,
            &payment_log_path,
            &payment_root,
            Vec::new(),
            "未发现 *_aligned.xlsx 文件，请先执行「进度款工程量数据统计」".to_string(),
        );
    }

    let discovered_aligned = match build_discovered_aligned_workbooks(
        workspace,
        &workbook_paths,
        &payment_ledger,
        &default_period,
    ) {
        Ok(files) => files,
        Err(err) => {
            return step1_failure(
                workspace,
                &default_period,
                &ipc_process_log_path,
                &payment_log_path,
                &payment_root,
                Vec::new(),
                format!("扫描 aligned 文件失败: {err}"),
            );
        }
    };

    if let Err(message) = evaluate_step1_gate(&process_ledger, &discovered_aligned) {
        return step1_failure(
            workspace,
            &default_period,
            &ipc_process_log_path,
            &payment_log_path,
            &payment_root,
            discovered_aligned,
            message,
        );
    }

    let aligned_files = match discover_aligned_files(workspace, &default_period) {
        Ok(files) => files,
        Err(err) => {
            return step1_failure(
                workspace,
                &default_period,
                &ipc_process_log_path,
                &payment_log_path,
                &payment_root,
                discovered_aligned,
                format!("读取 aligned 明细失败: {err}"),
            );
        }
    };

    if aligned_files.is_empty() {
        return step1_failure(
            workspace,
            &default_period,
            &ipc_process_log_path,
            &payment_log_path,
            &payment_root,
            discovered_aligned,
            format!("aligned 文件中无「{default_period}」期 IPC 列，请核对期数"),
        );
    }

    let mut ledger = payment_ledger;

    let payment_xlsx = payment_root.join("ipc_payment_data.xlsx");
    let project_xlsx = payment_root.join("project_ipc_data.xlsx");

    let data_overrides = if request.ignore_revisions.unwrap_or(false) {
        data_overrides::DataOverridesFile::default()
    } else {
        data_overrides::load_data_overrides(workspace)
    };

    let mut payment_rows = load_payment_rows(&payment_xlsx).unwrap_or_default();
    if let Err(err) = hydrate_payment_user_managed_fields(workspace, &mut payment_rows) {
        return internal_err(format!("读取 ipc_payment_data.csv 手工列失败: {err}"));
    }
    apply_payment_overrides_map(&mut payment_rows, &data_overrides);
    let mut project_rows = load_project_rows(&project_xlsx).unwrap_or_default();
    let mut project_ipc_columns = collect_existing_project_ipc_columns(&project_rows);

    let mut file_results: Vec<PaymentFileResult> = Vec::new();
    let mut diagnostics: Vec<HashMap<String, String>> = Vec::new();
    let mut backfill_count: u32 = 0;

    for file in &aligned_files {
        match process_aligned_file(
            file,
            &default_period,
            &mut ledger,
            &mut payment_rows,
            &mut project_rows,
            &mut project_ipc_columns,
            &data_overrides,
        ) {
            Ok(result) => {
                if result.skipped_reason.as_deref() == Some(BACKFILL_SKIP_REASON) {
                    backfill_count += 1;
                }
                file_results.push(result);
            }
            Err(err) => {
                ledger.record_failed(&file.ledger_key, &file.md5, &err.to_string());
                diagnostics.push(HashMap::from([
                    ("fileName".to_string(), file.file_name.clone()),
                    ("filePath".to_string(), file.file_path.display().to_string()),
                    ("error".to_string(), err.to_string()),
                ]));
                file_results.push(PaymentFileResult {
                    file_name: file.file_name.clone(),
                    file_path: file.file_path.display().to_string(),
                    status: IpcFileStatus::Failed,
                    error_message: Some(err.to_string()),
                    skipped_reason: None,
                    reviewed_only: None,
                    ipc_amount: None,
                    ipc_column: None,
                });
            }
        }
    }

    apply_payment_overrides_map(&mut payment_rows, &data_overrides);

    if let Err(err) = save_payment_xlsx(&payment_xlsx, &payment_rows) {
        return internal_err(format!("写入 ipc_payment_data.xlsx 失败: {err}"));
    }
    if let Err(err) = save_project_xlsx(&project_xlsx, &project_rows, &project_ipc_columns) {
        return internal_err(format!("写入 project_ipc_data.xlsx 失败: {err}"));
    }
    if let Err(err) = export_payment_rows_to_csv(&payment_root.join("ipc_payment_data.csv"), &payment_rows) {
        return internal_err(format!("导出 ipc_payment_data.csv 失败: {err}"));
    }
    if let Err(err) =
        export_project_rows_to_csv(&payment_root.join("project_ipc_data.csv"), &project_rows, &project_ipc_columns)
    {
        return internal_err(format!("导出 project_ipc_data.csv 失败: {err}"));
    }

    if let Err(err) = ledger.save_payment(workspace) {
        return internal_err(format!("写入 {} 失败: {err}", payment_log_path.display()));
    }
    if !diagnostics.is_empty() {
        let _ = fs::write(
            payment_root.join(format!("payment_diagnostics_{}.json", default_period.to_lowercase())),
            serde_json::to_string_pretty(&diagnostics).unwrap_or_default(),
        );
    }

    let success_count = file_results
        .iter()
        .filter(|r| r.status == IpcFileStatus::Success)
        .count() as u32;
    let skipped_count = file_results
        .iter()
        .filter(|r| r.status == IpcFileStatus::Skipped)
        .count() as u32;
    let failed_count = file_results
        .iter()
        .filter(|r| r.status == IpcFileStatus::Failed)
        .count() as u32;
    let incomplete_units = audit_incomplete_payment_units(&aligned_files, &project_rows, &payment_rows);
    let incomplete_count = incomplete_units.len() as u32;

    PaymentWorkflowResponse {
        ok: failed_count == 0 && incomplete_count == 0,
        report: Some(PaymentWorkflowReport {
            processed_at: Utc::now().to_rfc3339(),
            workspace_root: workspace.display().to_string(),
            period: default_period,
            success_count,
            skipped_count,
            failed_count,
            backfill_count,
            incomplete_count,
            incomplete_units,
            discovered_aligned_files: discovered_aligned,
            files: file_results,
            ipc_process_log_path: ipc_process_log_path.display().to_string(),
            ipc_payment_data_path: payment_xlsx.display().to_string(),
            project_ipc_data_path: project_xlsx.display().to_string(),
            ipc_payment_log_path: payment_log_path.display().to_string(),
            output_csv_paths: vec![
                payment_root.join("ipc_payment_data.csv").display().to_string(),
                payment_root.join("project_ipc_data.csv").display().to_string(),
            ],
        }),
        error_code: None,
        error_message: None,
    }
}

fn step1_failure(
    workspace: &Path,
    period: &str,
    ipc_process_log_path: &Path,
    payment_log_path: &Path,
    payment_root: &Path,
    discovered_aligned: Vec<DiscoveredAlignedWorkbook>,
    message: String,
) -> PaymentWorkflowResponse {
    PaymentWorkflowResponse {
        ok: false,
        report: Some(PaymentWorkflowReport {
            processed_at: Utc::now().to_rfc3339(),
            workspace_root: workspace.display().to_string(),
            period: period.to_string(),
            success_count: 0,
            skipped_count: 0,
            failed_count: 0,
            backfill_count: 0,
            incomplete_count: 0,
            incomplete_units: Vec::new(),
            discovered_aligned_files: discovered_aligned,
            files: Vec::new(),
            ipc_process_log_path: ipc_process_log_path.display().to_string(),
            ipc_payment_data_path: payment_root.join("ipc_payment_data.xlsx").display().to_string(),
            project_ipc_data_path: payment_root.join("project_ipc_data.xlsx").display().to_string(),
            ipc_payment_log_path: payment_log_path.display().to_string(),
            output_csv_paths: Vec::new(),
        }),
        error_code: Some(ErrorCode::InvalidArgs),
        error_message: Some(message),
    }
}

fn evaluate_step1_gate(
    process_ledger: &ProcessLedger,
    discovered: &[DiscoveredAlignedWorkbook],
) -> Result<(), String> {
    if discovered.is_empty() {
        return Err("未发现 *_aligned.xlsx 文件，请先执行「进度款工程量数据统计」".to_string());
    }

    let process_success = process_ledger
        .entries
        .values()
        .any(|e| e.status == LedgerStatus::Success);
    if !process_success {
        return Err(
            "ipc_process_log 中无 SUCCESS 记录，请先完成「进度款工程量数据统计」（工程量清单分析并写入母表）"
                .to_string(),
        );
    }

    let actionable = discovered
        .iter()
        .filter(|d| d.queue != PaymentAlignedQueue::NotReady)
        .count();
    if actionable == 0 {
        return Err(
            "aligned 文件中无当前期数的 IPC 列可统计，请核对期数或重新执行「进度款工程量数据统计」".to_string(),
        );
    }

    Ok(())
}

fn list_aligned_workbook_paths(workspace: &Path) -> Vec<PathBuf> {
    let mut by_path: BTreeMap<String, PathBuf> = BTreeMap::new();
    for entry in WalkDir::new(workspace).into_iter().filter_map(Result::ok) {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let Some(name) = path.file_name().and_then(|s| s.to_str()) else {
            continue;
        };
        if !name.to_lowercase().ends_with("_aligned.xlsx") {
            continue;
        }
        let key = path
            .canonicalize()
            .unwrap_or_else(|_| path.to_path_buf())
            .display()
            .to_string();
        by_path.entry(key).or_insert_with(|| path.to_path_buf());
    }
    by_path.into_values().collect()
}

fn build_discovered_aligned_workbooks(
    workspace: &Path,
    workbook_paths: &[PathBuf],
    payment_ledger: &ProcessLedger,
    period: &str,
) -> Result<Vec<DiscoveredAlignedWorkbook>> {
    let mut out = Vec::new();
    for path in workbook_paths {
        let name = path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("aligned.xlsx")
            .to_string();
        let md5 = file_md5(path).unwrap_or_default();
        let sheet_extracts = extract_ipc_sheets_from_aligned(path, period)?;
        let schedule_count = sheet_extracts.len() as u32;

        let mut pending_units = 0u32;
        let mut done_units = 0u32;
        let mut latest_processed_at: Option<String> = None;

        for sheet in &sheet_extracts {
            let ledger_key = format!("{}|{}|{}", name, sheet.sheet_name, sheet.ipc_column);
            if payment_ledger.is_marked_success(&ledger_key, &md5) {
                done_units += 1;
                if let Some(entry) = payment_ledger.find_by_file_name(&ledger_key) {
                    latest_processed_at = match &latest_processed_at {
                        Some(prev) if prev >= &entry.processed_at => Some(prev.clone()),
                        _ => Some(entry.processed_at.clone()),
                    };
                }
            } else {
                pending_units += 1;
            }
        }

        let (queue, role_reason) = if schedule_count == 0 {
            (
                PaymentAlignedQueue::NotReady,
                format!("无「{period}」期 IPC 列"),
            )
        } else if pending_units == 0 {
            (
                PaymentAlignedQueue::AlreadyProcessed,
                format!("{schedule_count} 个 Schedule 已在 ipc_payment_log 记录为 SUCCESS"),
            )
        } else if done_units > 0 {
            (
                PaymentAlignedQueue::PendingProcess,
                format!("待处理 {pending_units} · 已记录 {done_units} 个 Schedule"),
            )
        } else {
            (
                PaymentAlignedQueue::PendingProcess,
                format!("{schedule_count} 个 Schedule 待写入支付汇总"),
            )
        };

        let relative_path = path
            .strip_prefix(workspace)
            .map(|p| p.display().to_string())
            .unwrap_or_else(|_| path.display().to_string());
        let folder_path = path
            .parent()
            .and_then(|p| p.strip_prefix(workspace).ok())
            .map(|p| p.display().to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| ".".to_string());

        out.push(DiscoveredAlignedWorkbook {
            file_name: name,
            file_path: path.display().to_string(),
            relative_path,
            folder_path,
            queue,
            role_reason,
            schedule_count,
            ipc_period: if schedule_count > 0 {
                Some(normalize_ipc_period_label(period))
            } else {
                None
            },
            ledger_processed_at: latest_processed_at,
        });
    }

    out.sort_by(|a, b| {
        a.folder_path
            .cmp(&b.folder_path)
            .then_with(|| a.file_name.cmp(&b.file_name))
    });
    Ok(out)
}

fn normalize_ipc_period_label(period: &str) -> String {
    if let Some(caps) = ipc_period_re().captures(period.trim()) {
        let n: u32 = caps
            .get(1)
            .and_then(|m| m.as_str().parse().ok())
            .unwrap_or(0);
        return format!("IPC{n}");
    }
    period.trim().to_uppercase()
}

fn ipc_column_matches_period(ipc_label: &str, period: &str) -> bool {
    let target = normalize_ipc_period_label(period);
    let label = normalize_ipc_period_label(ipc_label);
    label == target
}

fn process_aligned_file(
    file: &AlignedFileSummary,
    default_period: &str,
    ledger: &mut ProcessLedger,
    payment_rows: &mut HashMap<String, PaymentRow>,
    project_rows: &mut HashMap<String, ProjectRow>,
    project_ipc_columns: &mut BTreeSet<String>,
    overrides: &DataOverridesFile,
) -> Result<PaymentFileResult> {
    let period = if file.ipc_column.is_empty() {
        default_period.to_string()
    } else {
        file.ipc_column.clone()
    };
    let key = format!("{}|{}|{}|{}", file.project_id, file.substation_lot, file.schedule, file.ipc_no);

    let payment_key = format!(
        "{}|{}|{}|{}",
        file.project_id, file.substation_lot, file.schedule, file.ipc_no
    );
    let mut ledger_backfill = false;
    if ledger.is_marked_success(&file.ledger_key, &file.md5) {
        let needs_backfill = project_ipc_value_missing(project_rows, file)
            || payment_ipc_value_missing(payment_rows, &payment_key)
            || project_boq_amount_needs_backfill(project_rows, file);
        if !needs_backfill {
            return Ok(PaymentFileResult {
                file_name: format!("{} [{}]", file.file_name, file.sheet_name),
                file_path: file.file_path.display().to_string(),
                status: IpcFileStatus::Skipped,
                error_message: None,
                skipped_reason: Some("已处理过，执行复核（不重复添加）".to_string()),
                reviewed_only: Some(true),
                ipc_amount: Some(file.ipc_amount),
                ipc_column: Some(period),
            });
        }
        ledger_backfill = true;
    }

    upsert_payment_row(payment_rows, &key, file, overrides)?;
    upsert_project_row(
        project_rows,
        project_ipc_columns,
        file,
        &period,
        overrides,
    )?;
    ledger.record_success(&file.ledger_key, &file.md5, &period);

    if ledger_backfill {
        return Ok(PaymentFileResult {
            file_name: format!("{} [{}]", file.file_name, file.sheet_name),
            file_path: file.file_path.display().to_string(),
            status: IpcFileStatus::Skipped,
            error_message: None,
            skipped_reason: Some(BACKFILL_SKIP_REASON.to_string()),
            reviewed_only: Some(true),
            ipc_amount: Some(file.ipc_amount),
            ipc_column: Some(period),
        });
    }

    Ok(PaymentFileResult {
        file_name: format!("{} [{}]", file.file_name, file.sheet_name),
        file_path: file.file_path.display().to_string(),
        status: IpcFileStatus::Success,
        error_message: None,
        skipped_reason: None,
        reviewed_only: Some(false),
        ipc_amount: Some(file.ipc_amount),
        ipc_column: Some(period),
    })
}

fn project_row_key(file: &AlignedFileSummary) -> String {
    format!("{}|{}|{}", file.project_id, file.substation_lot, file.schedule)
}

fn project_boq_amount_needs_backfill(
    project_rows: &HashMap<String, ProjectRow>,
    file: &AlignedFileSummary,
) -> bool {
    if file.boq_amount.abs() <= f64::EPSILON {
        return false;
    }
    let key = project_row_key(file);
    let Some(row) = project_rows.get(&key) else {
        return true;
    };
    let current = row
        .values
        .get("boq_amount")
        .map(|v| parse_f64(v))
        .unwrap_or(0.0);
    current.abs() <= f64::EPSILON || (current - 1.0).abs() < f64::EPSILON
}

fn project_ipc_value_missing(project_rows: &HashMap<String, ProjectRow>, file: &AlignedFileSummary) -> bool {
    let key = project_row_key(file);
    let Some(row) = project_rows.get(&key) else {
        return true;
    };
    project_ipc_cell_missing(row, &file.ipc_column)
}

fn project_ipc_cell_missing(row: &ProjectRow, ipc_column: &str) -> bool {
    let target = normalize_ipc_period_label(ipc_column);
    let has_positive = row.values.iter().any(|(k, v)| {
        k.to_uppercase().starts_with("IPC")
            && normalize_ipc_period_label(k) == target
            && parse_f64(v).abs() > f64::EPSILON
    });
    !has_positive
}

fn payment_ipc_value_missing(payment_rows: &HashMap<String, PaymentRow>, payment_key: &str) -> bool {
    let Some(row) = payment_rows.get(payment_key) else {
        return true;
    };
    row.values
        .get("ipc_application")
        .map(|v| parse_f64(v).abs() <= f64::EPSILON)
        .unwrap_or(true)
}

fn audit_incomplete_payment_units(
    aligned_files: &[AlignedFileSummary],
    project_rows: &HashMap<String, ProjectRow>,
    payment_rows: &HashMap<String, PaymentRow>,
) -> Vec<PaymentIncompleteUnit> {
    let mut out = Vec::new();
    for file in aligned_files {
        let payment_key = format!(
            "{}|{}|{}|{}",
            file.project_id, file.substation_lot, file.schedule, file.ipc_no
        );
        if project_ipc_value_missing(project_rows, file)
            || payment_ipc_value_missing(payment_rows, &payment_key)
            || project_boq_amount_needs_backfill(project_rows, file)
        {
            out.push(PaymentIncompleteUnit {
                file_name: file.file_name.clone(),
                sheet_name: file.sheet_name.clone(),
                ipc_column: file.ipc_column.clone(),
                project_id: file.project_id.clone(),
                schedule: file.schedule.clone(),
            });
        }
    }
    out
}

fn apply_payment_overrides_map(rows: &mut HashMap<String, PaymentRow>, overrides: &DataOverridesFile) {
    for row in rows.values_mut() {
        merge_payment_patches_into_row(&mut row.values, &row.key, overrides);
    }
}

fn merge_payment_patches_into_row(
    values: &mut HashMap<String, String>,
    row_key: &str,
    overrides: &DataOverridesFile,
) {
    for patch in &overrides.payment_patches {
        if data_overrides::patch_applies_to_row(patch, row_key, values) {
            for (k, v) in &patch.values {
                values.insert(k.clone(), v.clone());
            }
        }
    }
}

/// 工作 5 启动前：从 ipc_payment_data.csv 补全 xlsx 无法读出的手工列（如公式列、日期列）。
pub fn hydrate_payment_user_managed_fields(
    workspace: &Path,
    rows: &mut HashMap<String, PaymentRow>,
) -> Result<()> {
    let csv_path = payment_data_root(workspace).join("ipc_payment_data.csv");
    if !csv_path.is_file() {
        return Ok(());
    }
    merge_user_managed_fields_from_payment_csv(rows, &csv_path)
}

fn merge_user_managed_fields_from_payment_csv(
    rows: &mut HashMap<String, PaymentRow>,
    csv_path: &Path,
) -> Result<()> {
    let csv_rows = load_payment_rows_from_csv(csv_path)?;
    for (key, csv_row) in csv_rows {
        let entry = rows.entry(key.clone()).or_insert_with(|| PaymentRow {
            key: csv_row.key.clone(),
            values: HashMap::new(),
        });
        for field in PAYMENT_USER_MANAGED_FIELDS {
            let csv_val = csv_row
                .values
                .get(field)
                .map(String::as_str)
                .unwrap_or_default()
                .trim();
            let existing = entry
                .values
                .get(field)
                .map(String::as_str)
                .unwrap_or_default()
                .trim();
            if let Some(merged) = pick_user_managed_field_value(existing, csv_val) {
                entry.values.insert(field.to_string(), merged);
            }
        }
    }
    Ok(())
}

fn pick_user_managed_field_value(xlsx_val: &str, csv_val: &str) -> Option<String> {
    if !csv_val.is_empty() {
        return Some(csv_val.to_string());
    }
    if !xlsx_val.is_empty() {
        return Some(xlsx_val.to_string());
    }
    None
}

/// 保存前：内存中若手工列为空，从磁盘 xlsx 回填，避免工作 5 整表重写时抹掉用户在 Excel 中的输入。
fn preserve_user_managed_fields_before_save(
    payment_xlsx: &Path,
    rows: &mut HashMap<String, PaymentRow>,
) -> Result<()> {
    if !payment_xlsx.is_file() {
        return Ok(());
    }
    let on_disk = load_user_managed_fields_from_xlsx(payment_xlsx)?;
    for (key, fields) in on_disk {
        let Some(row) = rows.get_mut(&key) else {
            continue;
        };
        for (field, disk_val) in fields {
            if disk_val.trim().is_empty() {
                continue;
            }
            let mem = row
                .values
                .get(&field)
                .map(String::as_str)
                .unwrap_or_default()
                .trim();
            if mem.is_empty() {
                row.values.insert(field, disk_val);
            }
        }
    }
    Ok(())
}

fn load_user_managed_fields_from_xlsx(
    path: &Path,
) -> Result<HashMap<String, HashMap<String, String>>> {
    if !path.exists() {
        return Ok(HashMap::new());
    }
    let mut workbook = open_workbook_auto(path)
        .with_context(|| format!("无法打开 {}", path.display()))?;
    let sheet = workbook
        .sheet_names()
        .first()
        .cloned()
        .ok_or_else(|| anyhow!("文件无工作表"))?;
    let range = workbook.worksheet_range(&sheet)?;
    let raw: Vec<Vec<Data>> = range.rows().map(|row| row.to_vec()).collect();
    if raw.is_empty() {
        return Ok(HashMap::new());
    }
    let headers: Vec<String> = raw[0]
        .iter()
        .map(|c| payment_cell_value_to_string(c, ""))
        .collect();
    let mut out = HashMap::new();
    for row in raw.iter().skip(1) {
        let mut map = HashMap::new();
        for (i, h) in headers.iter().enumerate() {
            if i < row.len() {
                map.insert(h.clone(), payment_cell_value_to_string(&row[i], h));
            }
        }
        let key = format!(
            "{}|{}|{}|{}",
            map.get("project_id").cloned().unwrap_or_default(),
            map.get("substation_lot").cloned().unwrap_or_default(),
            map.get("schedule").cloned().unwrap_or_default(),
            map.get("ipc_no").cloned().unwrap_or_default()
        );
        if key == "|||" {
            continue;
        }
        let mut fields = HashMap::new();
        for field in PAYMENT_USER_MANAGED_FIELDS {
            if let Some(v) = map.get(field).filter(|v| !v.trim().is_empty()) {
                fields.insert(field.to_string(), v.clone());
            }
        }
        if !fields.is_empty() {
            out.insert(key, fields);
        }
    }
    Ok(out)
}

fn upsert_payment_row(
    rows: &mut HashMap<String, PaymentRow>,
    key: &str,
    file: &AlignedFileSummary,
    overrides: &DataOverridesFile,
) -> Result<()> {
    let row = rows.entry(key.to_string()).or_insert_with(|| PaymentRow {
        key: key.to_string(),
        values: HashMap::new(),
    });

    row.values.insert("project_id".to_string(), file.project_id.clone());
    row.values
        .insert("substation_lot".to_string(), file.substation_lot.clone());
    row.values.insert("schedule".to_string(), file.schedule.clone());
    row.values.insert("currency".to_string(), file.currency.clone());
    row.values.insert("ipc_no".to_string(), file.ipc_no.clone());

    merge_payment_patches_into_row(&mut row.values, &row.key, overrides);

    let row_key = row.key.clone();
    let set_unless_locked =
        |values: &mut HashMap<String, String>, field: &str, computed: String| {
            if data_overrides::is_field_locked(overrides, &row_key, values, field) {
                return;
            }
            values.insert(field.to_string(), computed);
        };

    set_unless_locked(
        &mut row.values,
        "ipc_application",
        format!("{:.2}", file.ipc_amount),
    );

    recalculate_payment_row_derived_fields(
        &mut row.values,
        &row_key,
        overrides,
        RecalculatePaymentOptions::workflow(),
    )?;

    Ok(())
}

/// 按业务规则重算 payment 行衍生列（预付款、保留金、应付金额、到期日等），尊重修订层 lock。
pub fn recalculate_payment_row_derived_fields(
    values: &mut HashMap<String, String>,
    row_key: &str,
    overrides: &DataOverridesFile,
    options: RecalculatePaymentOptions,
) -> Result<()> {
    let ipc_application = parse_f64(
        values
            .get("ipc_application")
            .map(String::as_str)
            .unwrap_or("0"),
    );
    let price_adjustment = parse_f64(
        values
            .get("price_adjustment")
            .map(String::as_str)
            .unwrap_or("0"),
    );
    let price_revise = parse_f64(
        values
            .get("price_revise")
            .map(String::as_str)
            .unwrap_or("0"),
    );
    let advance = ipc_application * 0.20;
    let retention = ipc_application * 0.15;
    let amount_due = ipc_application - advance - retention - price_adjustment - price_revise;
    let period_days = values
        .get("period")
        .and_then(|p| p.trim().parse::<i64>().ok())
        .unwrap_or(90);

    let set_unless_locked =
        |values: &mut HashMap<String, String>, field: &str, computed: String| {
            if data_overrides::is_field_locked(overrides, row_key, values, field) {
                return;
            }
            values.insert(field.to_string(), computed);
        };

    set_unless_locked(
        values,
        "advance_payment_retention",
        format!("{:.2}", advance),
    );
    set_unless_locked(values, "other_retentions", format!("{:.2}", retention));
    set_unless_locked(values, "ipc_amount_due", format!("{:.2}", amount_due));

    if options.workflow_mode {
        return Ok(());
    }

    if !data_overrides::is_field_locked(overrides, row_key, values, "price_adjustment") {
        values.insert(
            "price_adjustment".to_string(),
            value_or_default(values.get("price_adjustment"), "0.00"),
        );
    }
    if !data_overrides::is_field_locked(overrides, row_key, values, "price_revise") {
        values.insert(
            "price_revise".to_string(),
            value_or_default(values.get("price_revise"), "0.00"),
        );
    }
    set_unless_locked(values, "ipc_amount_due", format!("{:.2}", amount_due));
    if !data_overrides::is_field_locked(overrides, row_key, values, "ipc_amount_due1") {
        values.insert(
            "ipc_amount_due1".to_string(),
            value_or_default(values.get("ipc_amount_due1"), ""),
        );
    }
    if !data_overrides::is_field_locked(overrides, row_key, values, "ipc_amount_due2") {
        values.insert(
            "ipc_amount_due2".to_string(),
            value_or_default(values.get("ipc_amount_due2"), ""),
        );
    }
    if !data_overrides::is_field_locked(overrides, row_key, values, "period") {
        values
            .entry("period".to_string())
            .or_insert_with(|| period_days.to_string());
    }
    if !data_overrides::is_field_locked(overrides, row_key, values, "due_date") {
        let eff = values
            .get("effective_date")
            .cloned()
            .unwrap_or_default();
        if let Some(due) = due_date_from_effective(&eff, period_days) {
            values.insert("due_date".to_string(), due);
        }
    }
    if !data_overrides::is_field_locked(overrides, row_key, values, "paid_date1") {
        values.insert(
            "paid_date1".to_string(),
            value_or_default(values.get("paid_date1"), ""),
        );
    }
    if !data_overrides::is_field_locked(overrides, row_key, values, "paid_date2") {
        values.insert(
            "paid_date2".to_string(),
            value_or_default(values.get("paid_date2"), ""),
        );
    }

    Ok(())
}

/// 大模型/用户直接编辑 `ipc_payment_data.csv` 后，合并到 xlsx 并重算衍生列（UI 与统计以 xlsx 为准）。
pub fn sync_payment_workbook_from_payment_csv(
    workspace: &Path,
    csv_path: &Path,
    overrides: &DataOverridesFile,
) -> Result<u32> {
    let payment_root = payment_data_root(workspace);
    let payment_xlsx = payment_root.join("ipc_payment_data.xlsx");
    let csv_rows = load_payment_rows_from_csv(csv_path)?;
    if csv_rows.is_empty() {
        return Ok(0);
    }

    let mut payment_rows = load_payment_rows(&payment_xlsx).unwrap_or_default();
    let mut touched = 0u32;

    for (key, csv_row) in &csv_rows {
        let entry = payment_rows
            .entry(key.clone())
            .or_insert_with(|| PaymentRow {
                key: key.clone(),
                values: csv_row.values.clone(),
            });
        merge_payment_patches_into_row(&mut entry.values, &entry.key, overrides);

        for header in IPC_PAYMENT_HEADERS {
            let Some(csv_val) = csv_row.values.get(header) else {
                continue;
            };
            if csv_val.trim().is_empty() {
                continue;
            }
            if data_overrides::is_field_locked(overrides, &entry.key, &entry.values, header) {
                continue;
            }
            entry.values.insert(header.to_string(), csv_val.clone());
        }

        recalculate_payment_row_derived_fields(
            &mut entry.values,
            &entry.key,
            overrides,
            RecalculatePaymentOptions::after_user_edit(),
        )?;
        touched += 1;
    }

    save_payment_xlsx(&payment_xlsx, &payment_rows)?;
    export_payment_rows_to_csv(
        &payment_root.join("ipc_payment_data.csv"),
        &payment_rows,
    )?;
    Ok(touched)
}

/// 重算 ipc_payment_data.xlsx 全部行的衍生列
pub fn recalculate_payment_workbook_derivatives(
    workspace: &Path,
    overrides: &DataOverridesFile,
) -> Result<u32> {
    let payment_root = payment_data_root(workspace);
    let payment_xlsx = payment_root.join("ipc_payment_data.xlsx");
    if !payment_xlsx.is_file() {
        return Ok(0);
    }
    let mut payment_rows = load_payment_rows(&payment_xlsx).unwrap_or_default();
    for row in payment_rows.values_mut() {
        let row_key = row.key.clone();
        recalculate_payment_row_derived_fields(
            &mut row.values,
            &row_key,
            overrides,
            RecalculatePaymentOptions::after_user_edit(),
        )?;
    }
    save_payment_xlsx(&payment_xlsx, &payment_rows)?;
    export_payment_rows_to_csv(
        &payment_root.join("ipc_payment_data.csv"),
        &payment_rows,
    )?;
    Ok(payment_rows.len() as u32)
}

/// 重算 project_ipc_data.xlsx 的 total_ipc_amount / percentage_completed
pub fn recalculate_project_workbook_derivatives(
    workspace: &Path,
    overrides: &DataOverridesFile,
) -> Result<u32> {
    let payment_root = payment_data_root(workspace);
    let project_xlsx = payment_root.join("project_ipc_data.xlsx");
    if !project_xlsx.is_file() {
        return Ok(0);
    }
    let mut project_rows = load_project_rows(&project_xlsx).unwrap_or_default();
    let ipc_columns = collect_existing_project_ipc_columns(&project_rows);
    for row in project_rows.values_mut() {
        recalculate_project_row_totals(&mut row.values, &row.key, overrides);
    }
    save_project_xlsx(&project_xlsx, &project_rows, &ipc_columns)?;
    export_project_rows_to_csv(
        &payment_root.join("project_ipc_data.csv"),
        &project_rows,
        &ipc_columns,
    )?;
    Ok(project_rows.len() as u32)
}

fn recalculate_project_row_totals(
    values: &mut HashMap<String, String>,
    row_key: &str,
    overrides: &DataOverridesFile,
) {
    let total_ipc_amount: f64 = values
        .iter()
        .filter(|(k, _)| k.to_uppercase().starts_with("IPC"))
        .map(|(_, v)| parse_f64(v))
        .sum();
    let boq_amount = {
        let parsed = parse_f64(values.get("boq_amount").map(String::as_str).unwrap_or("1"));
        if parsed.abs() <= f64::EPSILON {
            1.0
        } else {
            parsed
        }
    };
    let percentage = total_ipc_amount / boq_amount;
    if !data_overrides::is_field_locked(overrides, row_key, values, "total_ipc_amount") {
        values.insert(
            "total_ipc_amount".to_string(),
            format!("{:.2}", total_ipc_amount),
        );
    }
    if !data_overrides::is_field_locked(overrides, row_key, values, "percentage_completed") {
        values.insert(
            "percentage_completed".to_string(),
            format!("{:.6}", percentage),
        );
    }
}

/// 从 aligned 母表强制同步 payment / project 行（忽略 payment 账本 SKIP，用于 LLM 编辑后传播）
pub fn force_sync_payment_from_aligned_workbook(
    workspace: &Path,
    aligned_path: &Path,
    period_hint: &str,
    overrides: &DataOverridesFile,
) -> Result<()> {
    let summaries = build_aligned_summaries_for_workbook(aligned_path, period_hint)?;
    if summaries.is_empty() {
        return Ok(());
    }

    let payment_root = payment_data_root(workspace);
    fs::create_dir_all(&payment_root)?;
    let payment_xlsx = payment_root.join("ipc_payment_data.xlsx");
    let project_xlsx = payment_root.join("project_ipc_data.xlsx");

    let mut payment_rows = load_payment_rows(&payment_xlsx).unwrap_or_default();
    hydrate_payment_user_managed_fields(workspace, &mut payment_rows)?;
    apply_payment_overrides_map(&mut payment_rows, overrides);
    let mut project_rows = load_project_rows(&project_xlsx).unwrap_or_default();
    let mut project_ipc_columns = collect_existing_project_ipc_columns(&project_rows);

    for file in &summaries {
        let key = format!(
            "{}|{}|{}|{}",
            file.project_id, file.substation_lot, file.schedule, file.ipc_no
        );
        let period = if file.ipc_column.is_empty() {
            period_hint.to_string()
        } else {
            file.ipc_column.clone()
        };
        upsert_payment_row(&mut payment_rows, &key, file, overrides)?;
        upsert_project_row(
            &mut project_rows,
            &mut project_ipc_columns,
            file,
            &period,
            overrides,
        )?;
    }

    for row in payment_rows.values_mut() {
        let row_key = row.key.clone();
        recalculate_payment_row_derived_fields(
            &mut row.values,
            &row_key,
            overrides,
            RecalculatePaymentOptions::workflow(),
        )?;
    }
    for row in project_rows.values_mut() {
        recalculate_project_row_totals(&mut row.values, &row.key, overrides);
    }

    save_payment_xlsx(&payment_xlsx, &payment_rows)?;
    save_project_xlsx(&project_xlsx, &project_rows, &project_ipc_columns)?;
    export_payment_rows_to_csv(&payment_root.join("ipc_payment_data.csv"), &payment_rows)?;
    export_project_rows_to_csv(
        &payment_root.join("project_ipc_data.csv"),
        &project_rows,
        &project_ipc_columns,
    )?;
    Ok(())
}

fn build_aligned_summaries_for_workbook(
    aligned_path: &Path,
    preferred_period: &str,
) -> Result<Vec<AlignedFileSummary>> {
    let name = aligned_path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("aligned.xlsx");
    let sheet_extracts = extract_ipc_sheets_from_aligned(aligned_path, preferred_period)?;
    if sheet_extracts.is_empty() {
        return Ok(Vec::new());
    }
    let parsed = parse_meta_from_filename(name, preferred_period);
    let md5 = file_md5(aligned_path).unwrap_or_default();
    Ok(sheet_extracts
        .into_iter()
        .map(|sheet| {
            let ipc_no = sheet.ipc_column.clone();
            AlignedFileSummary {
                file_path: aligned_path.to_path_buf(),
                file_name: name.to_string(),
                sheet_name: sheet.sheet_name.clone(),
                ledger_key: format!("{}|{}|{}", name, sheet.sheet_name, sheet.ipc_column),
                project_id: parsed.project_id.clone(),
                substation_lot: parsed.substation_lot.clone(),
                schedule: sheet.schedule,
                currency: sheet.currency,
                ipc_no,
                ipc_column: sheet.ipc_column,
                ipc_amount: sheet.amount,
                boq_amount: sheet.boq_amount,
                md5: md5.clone(),
            }
        })
        .collect())
}

/// 将 data_overrides.json 合并写入 ipc_payment_data.xlsx（不跑全量工作流）
pub fn apply_payment_data_overrides_to_workbook(workspace: &Path) -> Result<()> {
    let payment_root = payment_data_root(workspace);
    let payment_xlsx = payment_root.join("ipc_payment_data.xlsx");
    let overrides = data_overrides::load_data_overrides(workspace);
    if overrides.payment_patches.is_empty() {
        return Ok(());
    }
    let mut payment_rows = load_payment_rows(&payment_xlsx).unwrap_or_default();
    apply_payment_overrides_map(&mut payment_rows, &overrides);
    for row in payment_rows.values_mut() {
        let row_key = row.key.clone();
        recalculate_payment_row_derived_fields(
            &mut row.values,
            &row_key,
            &overrides,
            RecalculatePaymentOptions::after_user_edit(),
        )?;
    }
    save_payment_xlsx(&payment_xlsx, &payment_rows)?;
    export_payment_rows_to_csv(&payment_root.join("ipc_payment_data.csv"), &payment_rows)?;
    Ok(())
}

pub fn append_payment_data_patch(workspace: &Path, patch: PaymentDataPatch) -> Result<()> {
    data_overrides::append_payment_patch(workspace, patch)?;
    apply_payment_data_overrides_to_workbook(workspace)
}

/// CSV / IPC 编辑后：将生效日期等写入 ipc_payment_data.xlsx 对应行并重算 due_date 等衍生列
pub fn sync_payment_row_after_ipc_csv_edit(
    workspace: &Path,
    ipc_path: &Path,
    csv_fields: &super::ipc_cleaned_cache::CleanedCsvPaymentFields,
    overrides: &DataOverridesFile,
) -> Result<bool> {
    if csv_fields.effective_date.is_none()
        && csv_fields.period.is_none()
        && csv_fields.due_date.is_none()
    {
        return Ok(false);
    }

    let (period, schedule_hint) = scanner::ipc_period_and_schedule_hint(ipc_path, "IPCX");
    let payment_root = payment_data_root(workspace);
    let payment_xlsx = payment_root.join("ipc_payment_data.xlsx");
    if !payment_xlsx.is_file() {
        return Ok(false);
    }

    let mut payment_rows = load_payment_rows(&payment_xlsx).unwrap_or_default();
    let Some(row_key) = find_payment_row_key_for_ipc(&payment_rows, ipc_path, &period, &schedule_hint)
    else {
        return Ok(false);
    };

    let row = payment_rows.get_mut(&row_key).expect("row key exists");
    merge_payment_patches_into_row(&mut row.values, &row_key, overrides);

    let set_unless_locked = |values: &mut HashMap<String, String>, field: &str, value: String| {
        if data_overrides::is_field_locked(overrides, &row_key, values, field) {
            return;
        }
        values.insert(field.to_string(), value);
    };

    if let Some(ref eff) = csv_fields.effective_date {
        set_unless_locked(&mut row.values, "effective_date", eff.clone());
    }
    if let Some(ref p) = csv_fields.period {
        set_unless_locked(&mut row.values, "period", p.clone());
    }
    if let Some(ref due) = csv_fields.due_date {
        set_unless_locked(&mut row.values, "due_date", due.clone());
    }

    recalculate_payment_row_derived_fields(
        &mut row.values,
        &row_key,
        overrides,
        RecalculatePaymentOptions::after_user_edit(),
    )?;

    if let Some(ref eff) = csv_fields.effective_date {
        let match_keys = data_overrides::PaymentRowMatch {
            project_id: row.values.get("project_id").cloned(),
            substation_lot: row.values.get("substation_lot").cloned(),
            schedule: row.values.get("schedule").cloned(),
            ipc_no: row.values.get("ipc_no").cloned(),
        };
        let _ = data_overrides::record_payment_row_field_revision(
            workspace,
            &row_key,
            match_keys,
            "effective_date",
            eff,
        );
    }
    if let Some(ref p) = csv_fields.period {
        let match_keys = data_overrides::PaymentRowMatch {
            project_id: row.values.get("project_id").cloned(),
            substation_lot: row.values.get("substation_lot").cloned(),
            schedule: row.values.get("schedule").cloned(),
            ipc_no: row.values.get("ipc_no").cloned(),
        };
        let _ = data_overrides::record_payment_row_field_revision(
            workspace, &row_key, match_keys, "period", p,
        );
    }

    save_payment_xlsx(&payment_xlsx, &payment_rows)?;
    export_payment_rows_to_csv(
        &payment_root.join("ipc_payment_data.csv"),
        &payment_rows,
    )?;
    Ok(true)
}

fn find_payment_row_key_for_ipc(
    rows: &HashMap<String, PaymentRow>,
    ipc_path: &Path,
    period: &str,
    schedule_hint: &str,
) -> Option<String> {
    let file_name = ipc_path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or_default();
    let meta = parse_meta_from_filename(file_name, period);
    let schedule = schedule_hint.to_string();

    let mut candidates: Vec<data_overrides::PaymentRowMatch> = vec![
        data_overrides::PaymentRowMatch {
            project_id: Some(meta.project_id.clone()),
            substation_lot: Some(meta.substation_lot.clone()),
            schedule: Some(schedule.clone()),
            ipc_no: Some(meta.ipc_no.clone()),
        },
    ];

    let upper = file_name.to_uppercase();
    if upper.contains("SSLOT1-IRI") || upper.contains("SLOT1-IRI") {
        candidates.push(data_overrides::PaymentRowMatch {
            project_id: Some("SSLOT1-IRI".to_string()),
            substation_lot: Some(String::new()),
            schedule: Some(schedule.clone()),
            ipc_no: Some(meta.ipc_no.clone()),
        });
        candidates.push(data_overrides::PaymentRowMatch {
            project_id: Some("SSLOT1".to_string()),
            substation_lot: Some("IRI".to_string()),
            schedule: Some(schedule.clone()),
            ipc_no: Some(meta.ipc_no.clone()),
        });
    }

    for m in &candidates {
        for (key, row) in rows {
            if data_overrides::payment_row_matches_strict(&row.values, m) {
                return Some(key.clone());
            }
        }
    }
    None
}

fn upsert_project_row(
    rows: &mut HashMap<String, ProjectRow>,
    ipc_columns: &mut BTreeSet<String>,
    file: &AlignedFileSummary,
    ipc_column: &str,
    overrides: &DataOverridesFile,
) -> Result<()> {
    ipc_columns.insert(ipc_column.to_string());
    let key = format!("{}|{}|{}", file.project_id, file.substation_lot, file.schedule);
    let row = rows.entry(key.clone()).or_insert_with(|| ProjectRow {
        key,
        values: HashMap::new(),
    });
    row.values.insert("project_id".to_string(), file.project_id.clone());
    row.values
        .insert("substation_lot".to_string(), file.substation_lot.clone());
    row.values.insert("schedule".to_string(), file.schedule.clone());
    row.values.insert("currency".to_string(), file.currency.clone());
    let existing_boq = row
        .values
        .get("boq_amount")
        .map(|v| parse_f64(v))
        .unwrap_or(0.0);
    if file.boq_amount.abs() > f64::EPSILON {
        let should_write = existing_boq.abs() <= f64::EPSILON
            || (existing_boq - 1.0).abs() < f64::EPSILON
            || file.boq_amount > existing_boq + f64::EPSILON;
        if should_write && !data_overrides::is_field_locked(overrides, &row.key, &row.values, "boq_amount") {
            row.values
                .insert("boq_amount".to_string(), format!("{:.2}", file.boq_amount));
        }
    } else if existing_boq.abs() <= f64::EPSILON
        && !data_overrides::is_field_locked(overrides, &row.key, &row.values, "boq_amount")
    {
        row.values
            .entry("boq_amount".to_string())
            .or_insert_with(|| "1".to_string());
    }
    if !data_overrides::is_field_locked(overrides, &row.key, &row.values, ipc_column) {
        row.values
            .insert(ipc_column.to_string(), format!("{:.2}", file.ipc_amount));
    }

    let total_ipc_amount: f64 = row
        .values
        .iter()
        .filter(|(k, _)| k.to_uppercase().starts_with("IPC"))
        .map(|(_, v)| parse_f64(v))
        .sum();
    let boq_amount = {
        let parsed = parse_f64(row.values.get("boq_amount").map(String::as_str).unwrap_or("1"));
        if parsed.abs() <= f64::EPSILON { 1.0 } else { parsed }
    };
    let percentage = total_ipc_amount / boq_amount;
    row.values
        .insert("total_ipc_amount".to_string(), format!("{:.2}", total_ipc_amount));
    row.values
        .insert("percentage_completed".to_string(), format!("{:.6}", percentage));
    Ok(())
}

fn discover_aligned_files(workspace: &Path, preferred_period: &str) -> Result<Vec<AlignedFileSummary>> {
    let mut out = Vec::new();
    for entry in WalkDir::new(workspace).into_iter().filter_map(Result::ok) {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let Some(name) = path.file_name().and_then(|s| s.to_str()) else {
            continue;
        };
        if !name.to_lowercase().ends_with("_aligned.xlsx") {
            continue;
        }
        let sheet_extracts = extract_ipc_sheets_from_aligned(path, preferred_period)?;
        if sheet_extracts.is_empty() {
            continue;
        }
        let parsed = parse_meta_from_filename(name, preferred_period);
        let md5 = file_md5(path).unwrap_or_default();
        for sheet in sheet_extracts {
            let ipc_no = sheet.ipc_column.clone();
            out.push(AlignedFileSummary {
                file_path: path.to_path_buf(),
                file_name: name.to_string(),
                sheet_name: sheet.sheet_name.clone(),
                ledger_key: format!("{}|{}|{}", name, sheet.sheet_name, sheet.ipc_column),
                project_id: parsed.project_id.clone(),
                substation_lot: parsed.substation_lot.clone(),
                schedule: sheet.schedule,
                currency: sheet.currency,
                ipc_no,
                ipc_column: sheet.ipc_column,
                ipc_amount: sheet.amount,
                boq_amount: sheet.boq_amount,
                md5: md5.clone(),
            });
        }
    }
    Ok(out)
}

fn extract_ipc_sheets_from_aligned(path: &Path, preferred_period: &str) -> Result<Vec<SheetIpcExtract>> {
    let master = align::load_master_workbook(path)
        .with_context(|| format!("解析 aligned 母表失败 {}", path.display()))?;
    let filter_period = preferred_period.trim().to_uppercase() != "IPCX";
    let mut out = Vec::new();
    for (sheet_name, sheet_state) in &master.sheets {
        let Some(schedule) = schedule_from_sheet_name(sheet_name) else {
            continue;
        };
        let currency = align::currency_for_master_sheet(sheet_state, path);
        let boq_amount = align::schedule_boq_amount_for_sheet(sheet_state).unwrap_or(0.0);
        let period_cols = align::list_master_ipc_period_columns(&sheet_state.headers);
        for (col_idx, ipc_label) in period_cols {
            if filter_period && !ipc_column_matches_period(&ipc_label, preferred_period) {
                continue;
            }
            let amount =
                align::schedule_ipc_period_total_for_sheet(sheet_state, col_idx, &ipc_label).unwrap_or(0.0);
            out.push(SheetIpcExtract {
                sheet_name: sheet_name.clone(),
                schedule: schedule.clone(),
                ipc_column: ipc_label,
                amount,
                currency: currency.clone(),
                boq_amount,
            });
        }
    }
    Ok(out)
}

fn schedule_from_sheet_name(sheet_name: &str) -> Option<String> {
    align::schedule_sheet_number(sheet_name).map(|d| format!("Schedule{d}"))
}

/// 从 aligned 母表文件名解析 project_id / substation_lot（`-` 与空格均作分隔符）
fn parse_meta_from_filename(file_name: &str, ipc_col: &str) -> ParsedFilenameMeta {
    let stem = align::contract_master_stem(Path::new(file_name));
    let tokens = tokenize_filename_stem(&stem);
    let project_id = tokens
        .first()
        .map(|t| normalize_project_id_token(t))
        .filter(|t| !t.is_empty())
        .unwrap_or_else(|| "UNKNOWN".to_string());

    let boq_idx = tokens.iter().position(|t| is_boq_token(t));
    let substation_lot = if let Some(boq_i) = boq_idx {
        if boq_i > 1 {
            tokens[1..boq_i]
                .iter()
                .filter(|t| !is_metadata_skip_token(t))
                .map(|t| t.to_string())
                .collect::<Vec<_>>()
                .join("-")
        } else {
            String::new()
        }
    } else {
        tokens
            .iter()
            .skip(1)
            .take_while(|t| !is_metadata_skip_token(t))
            .map(|t| t.to_string())
            .collect::<Vec<_>>()
            .join("-")
    };

    let currency = tokens
        .iter()
        .find(|p| {
            let up = p.to_uppercase();
            up.contains("USD") || up.contains("TZS") || up.contains("EUR")
        })
        .map(|p| {
            let up = p.to_uppercase();
            if up.contains("TZS") {
                "TZS".to_string()
            } else if up.contains("EUR") {
                "EUR".to_string()
            } else {
                "USD".to_string()
            }
        })
        .unwrap_or_else(|| "USD".to_string());

    let ipc_no = ipc_period_from_text(file_name)
        .or_else(|| ipc_period_from_text(ipc_col))
        .unwrap_or_else(|| ipc_col.to_string());

    ParsedFilenameMeta {
        project_id,
        substation_lot,
        currency,
        ipc_no,
    }
}

fn tokenize_filename_stem(stem: &str) -> Vec<String> {
    filename_token_split_re()
        .split(stem)
        .map(str::trim)
        .filter(|t| !t.is_empty())
        .map(|t| t.to_string())
        .collect()
}

fn normalize_project_id_token(token: &str) -> String {
    if let Some(id) = scanner::project_id_from_token_text(token) {
        return id;
    }
    token.to_uppercase()
}

fn is_boq_token(token: &str) -> bool {
    let up = token.to_uppercase();
    up == "BOQ" || up.starts_with("BOQ")
}

fn is_metadata_skip_token(token: &str) -> bool {
    let up = token.to_uppercase();
    if is_boq_token(token) {
        return true;
    }
    if up.contains("USD") || up.contains("TZS") || up.contains("EUR") {
        return true;
    }
    if up.starts_with("IPC") {
        return true;
    }
    schedule_from_sheet_name(token).is_some() || sch_sheet_re().is_match(token)
}

fn ipc_period_from_text(text: &str) -> Option<String> {
    let caps = ipc_period_re().captures(text)?;
    Some(format!("IPC{}", caps.get(1)?.as_str()))
}

fn schedule_sheet_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?i)schedule\s*[\s_-]*(\d+)").unwrap())
}

fn sch_sheet_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?i)sch\s*[\s_-]*(\d+)").unwrap())
}

fn filename_token_split_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"[\s\-_]+").unwrap())
}

fn ipc_period_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?i)ipc\s*_?\s*(\d+)").unwrap())
}

fn schedule_sort_key(schedule: &str) -> u8 {
    let up = schedule.to_uppercase();
    if let Some(caps) = schedule_sheet_re().captures(&up) {
        if let Ok(n) = caps.get(1).unwrap().as_str().parse::<u8>() {
            return n;
        }
    }
    99
}

fn ipc_column_sort_key(col: &str) -> (u32, String) {
    let up = col.trim().to_uppercase();
    if let Some(caps) = ipc_period_re().captures(&up) {
        let n: u32 = caps.get(1).unwrap().as_str().parse().unwrap_or(0);
        return (n, up);
    }
    (u32::MAX, up)
}

fn compare_project_row_keys(a: &ProjectRow, b: &ProjectRow) -> std::cmp::Ordering {
    let pid = |r: &ProjectRow| r.values.get("project_id").cloned().unwrap_or_default();
    let lot = |r: &ProjectRow| r.values.get("substation_lot").cloned().unwrap_or_default();
    let sch = |r: &ProjectRow| r.values.get("schedule").cloned().unwrap_or_default();
    pid(a)
        .cmp(&pid(b))
        .then_with(|| lot(a).cmp(&lot(b)))
        .then_with(|| schedule_sort_key(&sch(a)).cmp(&schedule_sort_key(&sch(b))))
        .then_with(|| sch(a).cmp(&sch(b)))
}

fn load_payment_rows_from_csv(path: &Path) -> Result<HashMap<String, PaymentRow>> {
    if !path.is_file() {
        return Ok(HashMap::new());
    }
    let content = fs::read_to_string(path)
        .with_context(|| format!("无法读取 {}", path.display()))?;
    let mut lines = content.lines();
    let Some(header_line) = lines.next() else {
        return Ok(HashMap::new());
    };
    let headers = parse_payment_csv_line(header_line)?;
    let mut out = HashMap::new();
    for line in lines {
        if line.trim().is_empty() {
            continue;
        }
        let fields = parse_payment_csv_line(line)?;
        let mut map = HashMap::new();
        for (i, h) in headers.iter().enumerate() {
            map.insert(h.clone(), fields.get(i).cloned().unwrap_or_default());
        }
        let key = format!(
            "{}|{}|{}|{}",
            map.get("project_id").cloned().unwrap_or_default(),
            map.get("substation_lot").cloned().unwrap_or_default(),
            map.get("schedule").cloned().unwrap_or_default(),
            map.get("ipc_no").cloned().unwrap_or_default()
        );
        if key == "|||" {
            continue;
        }
        out.insert(key.clone(), PaymentRow { key, values: map });
    }
    Ok(out)
}

fn parse_payment_csv_line(line: &str) -> Result<Vec<String>> {
    let mut fields = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;
    let mut chars = line.chars().peekable();

    while let Some(ch) = chars.next() {
        match ch {
            '"' if in_quotes => {
                if chars.peek() == Some(&'"') {
                    current.push('"');
                    chars.next();
                } else {
                    in_quotes = false;
                }
            }
            '"' => in_quotes = true,
            ',' if !in_quotes => {
                fields.push(current.clone());
                current.clear();
            }
            c => current.push(c),
        }
    }
    fields.push(current);
    Ok(fields)
}

fn load_payment_rows(path: &Path) -> Result<HashMap<String, PaymentRow>> {
    if !path.exists() {
        return Ok(HashMap::new());
    }
    let mut workbook = open_workbook_auto(path)
        .with_context(|| format!("无法打开 {}", path.display()))?;
    let sheet = workbook
        .sheet_names()
        .first()
        .cloned()
        .ok_or_else(|| anyhow!("文件无工作表"))?;
    let range = workbook.worksheet_range(&sheet)?;
    let raw: Vec<Vec<Data>> = range.rows().map(|row| row.to_vec()).collect();
    if raw.is_empty() {
        return Ok(HashMap::new());
    }
    let headers: Vec<String> = raw[0]
        .iter()
        .map(|c| payment_cell_value_to_string(c, ""))
        .collect();
    let mut out = HashMap::new();
    for row in raw.iter().skip(1) {
        let mut map = HashMap::new();
        for (i, h) in headers.iter().enumerate() {
            map.insert(
                h.clone(),
                row.get(i)
                    .map(|c| payment_cell_value_to_string(c, h))
                    .unwrap_or_default(),
            );
        }
        let key = format!(
            "{}|{}|{}|{}",
            map.get("project_id").cloned().unwrap_or_default(),
            map.get("substation_lot").cloned().unwrap_or_default(),
            map.get("schedule").cloned().unwrap_or_default(),
            map.get("ipc_no").cloned().unwrap_or_default()
        );
        out.insert(key.clone(), PaymentRow { key, values: map });
    }
    Ok(out)
}

fn load_project_rows(path: &Path) -> Result<HashMap<String, ProjectRow>> {
    if !path.exists() {
        return Ok(HashMap::new());
    }
    let mut workbook = open_workbook_auto(path)
        .with_context(|| format!("无法打开 {}", path.display()))?;
    let sheet = workbook
        .sheet_names()
        .first()
        .cloned()
        .ok_or_else(|| anyhow!("文件无工作表"))?;
    let range = workbook.worksheet_range(&sheet)?;
    let rows: Vec<Vec<String>> = range
        .rows()
        .map(|row| row.iter().map(cell_to_string).collect())
        .collect();
    if rows.is_empty() {
        return Ok(HashMap::new());
    }
    let headers = &rows[0];
    let mut out = HashMap::new();
    for row in rows.iter().skip(1) {
        let mut map = HashMap::new();
        for (i, h) in headers.iter().enumerate() {
            map.insert(h.clone(), row.get(i).cloned().unwrap_or_default());
        }
        let key = format!(
            "{}|{}|{}",
            map.get("project_id").cloned().unwrap_or_default(),
            map.get("substation_lot").cloned().unwrap_or_default(),
            map.get("schedule").cloned().unwrap_or_default()
        );
        out.insert(key.clone(), ProjectRow { key, values: map });
    }
    Ok(out)
}

fn collect_existing_project_ipc_columns(rows: &HashMap<String, ProjectRow>) -> BTreeSet<String> {
    let mut cols = BTreeSet::new();
    for row in rows.values() {
        for key in row.values.keys() {
            if key.to_uppercase().starts_with("IPC") {
                cols.insert(key.to_uppercase());
            }
        }
    }
    cols
}

fn excel_col_name(zero_based: usize) -> String {
    let mut n = zero_based + 1;
    let mut name = String::new();
    while n > 0 {
        let rem = (n - 1) % 26;
        name.insert(0, (b'A' + rem as u8) as char);
        n = (n - 1) / 26;
    }
    name
}

fn payment_header_col(header: &str) -> Option<usize> {
    IPC_PAYMENT_HEADERS.iter().position(|h| *h == header)
}

fn save_payment_xlsx(path: &Path, rows: &HashMap<String, PaymentRow>) -> Result<()> {
    let mut rows_to_write = rows.clone();
    preserve_user_managed_fields_before_save(path, &mut rows_to_write)?;

    let mut wb = Workbook::new();
    let ws = wb.add_worksheet();
    ws.set_name("ipc_payment_data")?;
    let (header_fmt, text_fmt, money_fmt, date_fmt) = payment_table_formats();
    let col_count = IPC_PAYMENT_HEADERS.len() as u16;
    for (col, h) in IPC_PAYMENT_HEADERS.iter().enumerate() {
        ws.write_string_with_format(0, col as u16, *h, &header_fmt)?;
        ws.set_column_width(col as u16, 20.0)?;
    }
    let app_col = payment_header_col("ipc_application").map(excel_col_name);
    let advance_col = payment_header_col("advance_payment_retention").map(excel_col_name);
    let retention_col = payment_header_col("other_retentions").map(excel_col_name);
    let price_adj_col = payment_header_col("price_adjustment").map(excel_col_name);
    let price_rev_col = payment_header_col("price_revise").map(excel_col_name);
    let effective_col = payment_header_col("effective_date").map(excel_col_name);
    let period_col = payment_header_col("period").map(excel_col_name);
    let mut sorted: Vec<_> = rows_to_write.values().collect();
    sorted.sort_by_key(|r| r.key.clone());
    let last_row = sorted.len() as u32;
    for (ridx, row) in sorted.iter().enumerate() {
        let r = (ridx + 1) as u32;
        let r1 = r + 1;
        for (col, h) in IPC_PAYMENT_HEADERS.iter().enumerate() {
            let col_u16 = col as u16;
            let value = row.values.get(*h).cloned().unwrap_or_default();

            if h == &"advance_payment_retention" {
                if let (Some(app), Some(_adv)) = (&app_col, &advance_col) {
                    let formula = format!("={app}{r1}*0.2");
                    ws.write_formula_with_format(r, col_u16, formula.as_str(), &money_fmt)?;
                    continue;
                }
            }
            if h == &"other_retentions" {
                if let (Some(app), Some(_ret)) = (&app_col, &retention_col) {
                    let formula = format!("={app}{r1}*0.15");
                    ws.write_formula_with_format(r, col_u16, formula.as_str(), &money_fmt)?;
                    continue;
                }
            }
            if h == &"ipc_amount_due" {
                if let (Some(app), Some(adv), Some(ret), Some(adj), Some(rev)) = (
                    &app_col,
                    &advance_col,
                    &retention_col,
                    &price_adj_col,
                    &price_rev_col,
                ) {
                    let formula = format!("={app}{r1}-{adv}{r1}-{ret}{r1}-{adj}{r1}-{rev}{r1}");
                    ws.write_formula_with_format(r, col_u16, formula.as_str(), &money_fmt)?;
                    continue;
                }
            }
            if h == &"due_date" {
                if !value.trim().is_empty() {
                    write_payment_cell(
                        ws,
                        r,
                        col_u16,
                        h,
                        &value,
                        &text_fmt,
                        &money_fmt,
                        &date_fmt,
                    )?;
                    continue;
                }
                if let (Some(eff), Some(per)) = (&effective_col, &period_col) {
                    let formula = format!(r#"=IF({eff}{r1}="","",{eff}{r1}+{per}{r1})"#);
                    ws.write_formula_with_format(r, col_u16, formula.as_str(), &date_fmt)?;
                    continue;
                }
            }

            if PAYMENT_USER_MANAGED_FIELDS.contains(h) {
                write_payment_cell(
                    ws,
                    r,
                    col_u16,
                    h,
                    &value,
                    &text_fmt,
                    &money_fmt,
                    &date_fmt,
                )?;
                continue;
            }

            write_payment_cell(
                ws,
                r,
                col_u16,
                h,
                &value,
                &text_fmt,
                &money_fmt,
                &date_fmt,
            )?;
        }
    }
    ws.set_freeze_panes(1, 0)?;
    if last_row > 0 {
        ws.autofilter(0, 0, last_row, col_count - 1)?;
    }
    wb.save(path)?;
    Ok(())
}

fn save_project_xlsx(path: &Path, rows: &HashMap<String, ProjectRow>, ipc_columns: &BTreeSet<String>) -> Result<()> {
    let mut wb = Workbook::new();
    let ws = wb.add_worksheet();
    ws.set_name("project_ipc_data")?;
    let (header_fmt, text_fmt, money_fmt, _date_fmt) = payment_table_formats();
    let pct_fmt = Format::new()
        .set_num_format("0.00%")
        .set_align(FormatAlign::Right)
        .set_border(FormatBorder::Thin);

    let mut headers: Vec<String> = PROJECT_IPC_BASE_HEADERS.iter().map(|s| s.to_string()).collect();
    let mut ipc_cols: Vec<String> = ipc_columns.iter().cloned().collect();
    ipc_cols.sort_by_key(|c| ipc_column_sort_key(c));
    headers.extend(ipc_cols);
    let col_count = headers.len() as u16;
    for (col, h) in headers.iter().enumerate() {
        ws.write_string_with_format(0, col as u16, h, &header_fmt)?;
        ws.set_column_width(col as u16, 20.0)?;
    }
    let boq_col_idx = headers.iter().position(|h| h == "boq_amount");
    let total_col_idx = headers.iter().position(|h| h == "total_ipc_amount");
    let first_ipc_col_idx = headers.iter().position(|h| h.to_uppercase().starts_with("IPC"));
    let last_ipc_col_idx = headers.iter().rposition(|h| h.to_uppercase().starts_with("IPC"));

    let mut sorted: Vec<_> = rows.values().collect();
    sorted.sort_by(|a, b| compare_project_row_keys(a, b));
    let last_row = sorted.len() as u32;
    for (ridx, row) in sorted.iter().enumerate() {
        let r = (ridx + 1) as u32;
        let r1 = r + 1;
        for (col, h) in headers.iter().enumerate() {
            let col_u16 = col as u16;
            let value = row.values.get(h).cloned().unwrap_or_default();

            if h == "total_ipc_amount" {
                if let (Some(first), Some(last)) = (first_ipc_col_idx, last_ipc_col_idx) {
                    let formula = format!(
                        "=SUM({}{}:{}{})",
                        excel_col_name(first),
                        r1,
                        excel_col_name(last),
                        r1
                    );
                    ws.write_formula_with_format(r, col_u16, formula.as_str(), &money_fmt)?;
                    continue;
                }
            }
            if h == "percentage_completed" {
                if let (Some(boq_idx), Some(total_idx)) = (boq_col_idx, total_col_idx) {
                    let boq = excel_col_name(boq_idx);
                    let total = excel_col_name(total_idx);
                    let formula = format!("=IF({boq}{r1}=0,0,{total}{r1}/{boq}{r1})");
                    ws.write_formula_with_format(r, col_u16, formula.as_str(), &pct_fmt)?;
                    continue;
                }
            }

            write_project_cell(ws, r, col_u16, h, &value, &text_fmt, &money_fmt, &pct_fmt)?;
        }
    }
    ws.set_freeze_panes(1, 0)?;
    if last_row > 0 {
        ws.autofilter(0, 0, last_row, col_count - 1)?;
    }
    wb.save(path)?;
    Ok(())
}

fn payment_table_formats() -> (Format, Format, Format, Format) {
    let header_fmt = Format::new()
        .set_bold()
        .set_background_color(Color::RGB(0xD9E1F2))
        .set_align(FormatAlign::Center)
        .set_border(FormatBorder::Thin);
    let text_fmt = Format::new().set_border(FormatBorder::Thin);
    let money_fmt = Format::new()
        .set_num_format("#,##0.00")
        .set_align(FormatAlign::Right)
        .set_border(FormatBorder::Thin);
    let date_fmt = Format::new()
        .set_num_format("yyyy-mm-dd")
        .set_border(FormatBorder::Thin);
    (header_fmt, text_fmt, money_fmt, date_fmt)
}

fn write_payment_cell(
    ws: &mut rust_xlsxwriter::Worksheet,
    row: u32,
    col: u16,
    header: &str,
    value: &str,
    text_fmt: &Format,
    money_fmt: &Format,
    date_fmt: &Format,
) -> Result<()> {
    if PAYMENT_DATE_HEADERS.contains(&header) {
        return write_excel_date_cell(ws, row, col, value, text_fmt, date_fmt);
    }
    if PAYMENT_AMOUNT_HEADERS.contains(&header) {
        return write_excel_number_cell(ws, row, col, value, text_fmt, money_fmt);
    }
    ws.write_string_with_format(row, col, value, text_fmt)?;
    Ok(())
}

fn write_project_cell(
    ws: &mut rust_xlsxwriter::Worksheet,
    row: u32,
    col: u16,
    header: &str,
    value: &str,
    text_fmt: &Format,
    money_fmt: &Format,
    pct_fmt: &Format,
) -> Result<()> {
    if header == "percentage_completed" {
        if value.trim().is_empty() {
            ws.write_string_with_format(row, col, "", text_fmt)?;
        } else {
            ws.write_number_with_format(row, col, parse_f64(value), pct_fmt)?;
        }
        return Ok(());
    }
    if PROJECT_AMOUNT_HEADERS.contains(&header) || header.to_uppercase().starts_with("IPC") {
        return write_excel_number_cell(ws, row, col, value, text_fmt, money_fmt);
    }
    ws.write_string_with_format(row, col, value, text_fmt)?;
    Ok(())
}

fn write_excel_number_cell(
    ws: &mut rust_xlsxwriter::Worksheet,
    row: u32,
    col: u16,
    value: &str,
    text_fmt: &Format,
    money_fmt: &Format,
) -> Result<()> {
    if value.trim().is_empty() {
        ws.write_string_with_format(row, col, "", text_fmt)?;
        return Ok(());
    }
    ws.write_number_with_format(row, col, parse_f64(value), money_fmt)?;
    Ok(())
}

fn write_excel_date_cell(
    ws: &mut rust_xlsxwriter::Worksheet,
    row: u32,
    col: u16,
    value: &str,
    text_fmt: &Format,
    date_fmt: &Format,
) -> Result<()> {
    if value.trim().is_empty() {
        ws.write_string_with_format(row, col, "", text_fmt)?;
        return Ok(());
    }
    if let Ok(date) = NaiveDate::parse_from_str(value.trim(), "%Y-%m-%d") {
        let excel_date = ExcelDateTime::from_ymd(
            date.year() as u16,
            date.month() as u8,
            date.day() as u8,
        )?;
        ws.write_datetime_with_format(row, col, &excel_date, date_fmt)?;
        return Ok(());
    }
    ws.write_string_with_format(row, col, value, text_fmt)?;
    Ok(())
}

fn export_payment_rows_to_csv(csv_path: &Path, rows: &HashMap<String, PaymentRow>) -> Result<()> {
    let mut sorted: Vec<_> = rows.values().collect();
    sorted.sort_by_key(|r| r.key.clone());
    let mut out = String::new();
    out.push_str(
        &IPC_PAYMENT_HEADERS
            .iter()
            .map(|h| escape_csv_field(h))
            .collect::<Vec<_>>()
            .join(","),
    );
    out.push('\n');
    for row in sorted {
        let line = IPC_PAYMENT_HEADERS
            .iter()
            .map(|h| escape_csv_field(row.values.get(*h).map(String::as_str).unwrap_or("")))
            .collect::<Vec<_>>()
            .join(",");
        out.push_str(&line);
        out.push('\n');
    }
    fs::write(csv_path, out)?;
    Ok(())
}

fn export_project_rows_to_csv(
    csv_path: &Path,
    rows: &HashMap<String, ProjectRow>,
    ipc_columns: &BTreeSet<String>,
) -> Result<()> {
    let mut headers: Vec<String> = PROJECT_IPC_BASE_HEADERS.iter().map(|s| s.to_string()).collect();
    let mut ipc_cols: Vec<String> = ipc_columns.iter().cloned().collect();
    ipc_cols.sort_by_key(|c| ipc_column_sort_key(c));
    headers.extend(ipc_cols);

    let mut sorted: Vec<_> = rows.values().collect();
    sorted.sort_by(|a, b| compare_project_row_keys(a, b));

    let mut out = String::new();
    out.push_str(
        &headers
            .iter()
            .map(|h| escape_csv_field(h))
            .collect::<Vec<_>>()
            .join(","),
    );
    out.push('\n');
    for row in sorted {
        let line = headers
            .iter()
            .map(|h| escape_csv_field(row.values.get(h).map(String::as_str).unwrap_or("")))
            .collect::<Vec<_>>()
            .join(",");
        out.push_str(&line);
        out.push('\n');
    }
    fs::write(csv_path, out)?;
    Ok(())
}

fn escape_csv_field(v: &str) -> String {
    if v.contains(',') || v.contains('"') || v.contains('\n') {
        format!("\"{}\"", v.replace('"', "\"\""))
    } else {
        v.to_string()
    }
}

fn infer_default_period(files: &[AlignedFileSummary]) -> Option<String> {
    files.first().map(|f| f.ipc_column.clone())
}

fn parse_f64(s: &str) -> f64 {
    s.trim().replace(',', "").parse::<f64>().unwrap_or(0.0)
}

fn cell_to_string(cell: &impl DataType) -> String {
    payment_cell_value_to_string(cell, "")
}

fn payment_cell_value_to_string(cell: &impl DataType, header: &str) -> String {
    if let Some(v) = cell.get_string() {
        return v.to_string();
    }
    if cell.is_datetime() {
        if let Some(dt) = cell.as_datetime() {
            return dt.format("%Y-%m-%d").to_string();
        }
        if let Some(dt) = cell.get_datetime() {
            if let Some(ndt) = dt.as_datetime() {
                return ndt.format("%Y-%m-%d").to_string();
            }
        }
    }
    if let Some(iso) = cell.get_datetime_iso() {
        let trimmed = iso.trim();
        if trimmed.len() >= 10 {
            return trimmed[..10].to_string();
        }
        return iso.to_string();
    }
    if is_payment_date_header(header) {
        if let Some(v) = cell.get_float() {
            if let Some(date) = excel_serial_to_date_string(v) {
                return date;
            }
        }
        if let Some(v) = cell.get_int() {
            if let Some(date) = excel_serial_to_date_string(v as f64) {
                return date;
            }
        }
    }
    if let Some(v) = cell.get_float() {
        if PAYMENT_AMOUNT_HEADERS.contains(&header)
            || header.to_uppercase().starts_with("IPC")
        {
            return format!("{:.2}", v);
        }
        return format!("{:.2}", v);
    }
    if let Some(v) = cell.get_int() {
        return v.to_string();
    }
    if let Some(v) = cell.get_bool() {
        return if v { "TRUE".to_string() } else { "FALSE".to_string() };
    }
    String::new()
}

fn is_payment_date_header(header: &str) -> bool {
    PAYMENT_DATE_HEADERS.contains(&header)
}

fn excel_serial_to_date_string(serial: f64) -> Option<String> {
    if !(1.0..=100_000.0).contains(&serial) {
        return None;
    }
    let days = serial.floor() as i64;
    let epoch = NaiveDate::from_ymd_opt(1899, 12, 30)?;
    let date = epoch.checked_add_signed(Duration::days(days))?;
    Some(date.format("%Y-%m-%d").to_string())
}

fn value_or_default(existing: Option<&String>, default: &str) -> String {
    match existing {
        Some(v) if !v.trim().is_empty() => v.clone(),
        _ => default.to_string(),
    }
}

fn due_date_from_effective(effective: &str, period_days: i64) -> Option<String> {
    if effective.trim().is_empty() {
        return None;
    }
    let parsed = NaiveDate::parse_from_str(effective.trim(), "%Y-%m-%d").ok()?;
    Some((parsed + Duration::days(period_days)).format("%Y-%m-%d").to_string())
}

fn invalid_args(message: String) -> PaymentWorkflowResponse {
    PaymentWorkflowResponse {
        ok: false,
        report: None,
        error_code: Some(ErrorCode::InvalidArgs),
        error_message: Some(message),
    }
}

fn internal_err(message: String) -> PaymentWorkflowResponse {
    PaymentWorkflowResponse {
        ok: false,
        report: None,
        error_code: Some(ErrorCode::InternalError),
        error_message: Some(message),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_sslot1_iri_boq_filename() {
        let meta = parse_meta_from_filename("SSLOT1-IRI-BOQ_aligned.xlsx", "IPC4");
        assert_eq!(meta.project_id, "SSLOT1");
        assert_eq!(meta.substation_lot, "IRI");
    }

    #[test]
    fn parse_sslot4_space_boq_filename() {
        let meta = parse_meta_from_filename("SSLOT4 BOQ_aligned.xlsx", "IPC4");
        assert_eq!(meta.project_id, "SSLOT4");
        assert!(meta.substation_lot.is_empty());
    }

    #[test]
    fn schedule_from_sheet_names() {
        assert_eq!(
            schedule_from_sheet_name("Schedule 1 - TZS").as_deref(),
            Some("Schedule1")
        );
        assert_eq!(
            schedule_from_sheet_name("SCH2-BOQ").as_deref(),
            Some("Schedule2")
        );
        assert!(schedule_from_sheet_name("Summary").is_none());
    }

    #[test]
    fn ipc_column_matches_period_normalizes_zeros() {
        assert!(ipc_column_matches_period("IPC004", "IPC4"));
        assert!(ipc_column_matches_period("IPC4", "ipc4"));
        assert!(!ipc_column_matches_period("IPC3", "IPC4"));
    }

    #[test]
    fn recalculate_payment_row_updates_due_date_when_effective_changes() {
        let overrides = DataOverridesFile::default();
        let mut values = HashMap::from([
            ("ipc_application".to_string(), "1000.00".to_string()),
            ("effective_date".to_string(), "2026-05-01".to_string()),
            ("due_date".to_string(), "2026-06-01".to_string()),
            ("period".to_string(), "90".to_string()),
        ]);
        let row_key = data_overrides::payment_row_key_from_values(&values);
        recalculate_payment_row_derived_fields(
            &mut values,
            &row_key,
            &overrides,
            RecalculatePaymentOptions::after_user_edit(),
        )
        .unwrap();
        assert_eq!(values.get("due_date").map(String::as_str), Some("2026-07-30"));
        assert_eq!(values.get("advance_payment_retention").map(String::as_str), Some("200.00"));
    }

    #[test]
    fn workflow_recalculate_preserves_user_managed_fields() {
        let overrides = DataOverridesFile::default();
        let mut values = HashMap::from([
            ("ipc_application".to_string(), "1000.00".to_string()),
            ("price_adjustment".to_string(), "10.00".to_string()),
            ("price_revise".to_string(), "5.00".to_string()),
            ("effective_date".to_string(), "2026-05-30".to_string()),
            ("period".to_string(), "50".to_string()),
            ("due_date".to_string(), "2026-08-01".to_string()),
            ("paid_date1".to_string(), "2026-09-01".to_string()),
        ]);
        let row_key = data_overrides::payment_row_key_from_values(&values);
        recalculate_payment_row_derived_fields(
            &mut values,
            &row_key,
            &overrides,
            RecalculatePaymentOptions::workflow(),
        )
        .unwrap();
        assert_eq!(values.get("price_adjustment").map(String::as_str), Some("10.00"));
        assert_eq!(values.get("due_date").map(String::as_str), Some("2026-08-01"));
        assert_eq!(values.get("paid_date1").map(String::as_str), Some("2026-09-01"));
        assert_eq!(values.get("ipc_amount_due").map(String::as_str), Some("635.00"));
    }

    #[test]
    fn save_payment_xlsx_preserves_existing_paid_date_text() {
        use std::env;

        let workspace = env::temp_dir().join(format!("epc-pay-preserve-{}", std::process::id()));
        let _ = fs::remove_dir_all(&workspace);
        let payment_root = workspace.join("IPC_Payment_data");
        fs::create_dir_all(&payment_root).unwrap();
        let xlsx = payment_root.join("ipc_payment_data.xlsx");

        let row_key = "P1||S1|IPC007".to_string();
        let mut initial = HashMap::from([(
            row_key.clone(),
            PaymentRow {
                key: row_key.clone(),
                values: HashMap::from([
                    ("project_id".to_string(), "P1".to_string()),
                    ("substation_lot".to_string(), String::new()),
                    ("schedule".to_string(), "S1".to_string()),
                    ("ipc_no".to_string(), "IPC007".to_string()),
                    ("ipc_application".to_string(), "100.00".to_string()),
                    ("paid_date1".to_string(), "待确认".to_string()),
                ]),
            },
        )]);
        save_payment_xlsx(&xlsx, &initial).unwrap();

        initial
            .get_mut(&row_key)
            .unwrap()
            .values
            .insert("ipc_application".to_string(), "200.00".to_string());
        initial.get_mut(&row_key).unwrap().values.remove("paid_date1");

        save_payment_xlsx(&xlsx, &initial).unwrap();

        let rows = load_payment_rows(&xlsx).unwrap();
        let row = rows.get(&row_key).expect("row");
        assert_eq!(row.values.get("paid_date1").map(String::as_str), Some("待确认"));
        assert_eq!(row.values.get("ipc_application").map(String::as_str), Some("200.00"));
        let _ = fs::remove_dir_all(&workspace);
    }

    #[test]
    fn project_ipc_cell_missing_detects_empty_column() {
        let row = ProjectRow {
            key: "k".to_string(),
            values: HashMap::from([
                ("IPC4".to_string(), "100.00".to_string()),
                ("project_id".to_string(), "P1".to_string()),
            ]),
        };
        assert!(!project_ipc_cell_missing(&row, "IPC4"));
        assert!(project_ipc_cell_missing(&row, "IPC3"));
    }

    #[test]
    fn project_ipc_cell_missing_treats_zero_as_missing() {
        let row = ProjectRow {
            key: "k".to_string(),
            values: HashMap::from([("IPC007".to_string(), "0.00".to_string())]),
        };
        assert!(project_ipc_cell_missing(&row, "IPC007"));
    }

    #[test]
    fn audit_incomplete_lists_missing_project_ipc() {
        let file = AlignedFileSummary {
            file_path: PathBuf::from("/tmp/a_aligned.xlsx"),
            file_name: "a_aligned.xlsx".to_string(),
            sheet_name: "Schedule1".to_string(),
            ledger_key: "k".to_string(),
            project_id: "P1".to_string(),
            substation_lot: String::new(),
            schedule: "Schedule1".to_string(),
            currency: "USD".to_string(),
            ipc_no: "IPC3".to_string(),
            ipc_column: "IPC3".to_string(),
            ipc_amount: 1.0,
            boq_amount: 100.0,
            md5: "m".to_string(),
        };
        let project_rows = HashMap::from([(
            "P1||Schedule1".to_string(),
            ProjectRow {
                key: "P1||Schedule1".to_string(),
                values: HashMap::from([("IPC4".to_string(), "10".to_string())]),
            },
        )]);
        let payment_rows = HashMap::new();
        let incomplete = audit_incomplete_payment_units(&[file], &project_rows, &payment_rows);
        assert_eq!(incomplete.len(), 1);
        assert_eq!(incomplete[0].ipc_column, "IPC3");
    }

    #[test]
    fn project_row_sort_by_schedule_digit() {
        let mut rows = vec![
            ProjectRow {
                key: "b".to_string(),
                values: HashMap::from([
                    ("project_id".to_string(), "SSLOT1".to_string()),
                    ("substation_lot".to_string(), String::new()),
                    ("schedule".to_string(), "Schedule4".to_string()),
                ]),
            },
            ProjectRow {
                key: "a".to_string(),
                values: HashMap::from([
                    ("project_id".to_string(), "SSLOT1".to_string()),
                    ("substation_lot".to_string(), String::new()),
                    ("schedule".to_string(), "Schedule1".to_string()),
                ]),
            },
        ];
        rows.sort_by(compare_project_row_keys);
        assert_eq!(
            rows[0].values.get("schedule").map(String::as_str),
            Some("Schedule1")
        );
    }

    #[test]
    fn sync_payment_workbook_from_payment_csv_writes_xlsx_and_due_date() {
        use std::env;

        let workspace = env::temp_dir().join(format!("epc-pay-csv-sync-{}", std::process::id()));
        let _ = fs::remove_dir_all(&workspace);
        let payment_root = workspace.join("IPC_Payment_data");
        fs::create_dir_all(&payment_root).unwrap();
        let csv_path = payment_root.join("ipc_payment_data.csv");
        fs::write(
            &csv_path,
            "project_id,substation_lot,schedule,currency,ipc_no,ipc_application,advance_payment_retention,other_retentions,price_adjustment,price_revise,ipc_amount_due,ipc_amount_due1,ipc_amount_due2,effective_date,period,due_date,paid_date1,paid_date2\n\
SSLOT1,IRI,Schedule1,USD,IPC007,1000.00,,,,,,,,2026-05-30,50,,,\n",
        )
        .unwrap();

        let overrides = DataOverridesFile::default();
        let count =
            sync_payment_workbook_from_payment_csv(&workspace, &csv_path, &overrides).unwrap();
        assert_eq!(count, 1);

        let xlsx = payment_root.join("ipc_payment_data.xlsx");
        assert!(xlsx.is_file());
        let rows = load_payment_rows_from_csv(&csv_path).unwrap();
        let row = rows
            .get("SSLOT1|IRI|Schedule1|IPC007")
            .expect("payment row");
        assert_eq!(
            row.values.get("effective_date").map(String::as_str),
            Some("2026-05-30")
        );
        assert_eq!(row.values.get("due_date").map(String::as_str), Some("2026-07-19"));
        let _ = fs::remove_dir_all(&workspace);
    }
}
