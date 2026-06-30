use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use chrono::Utc;
use regex::Regex;

use crate::engine::align::{
    self, amounts_close, currency_for_master_sheet, detect_boq_column_layout,
    load_master_workbook_for_boq_format, normalize_contract_boq_sheet_for_format,
    parse_boq_number, row_is_boq_schedule_total, schedule_boq_amount_for_sheet,
    write_master_workbook, MasterSheetState, MasterWorkbookState,
};
use crate::engine::scanner;
use crate::ledger::{boq_format_ledger_path, ProcessLedger};
use crate::license;
use crate::types::{
    BoqFormatDiscoveredWorkbook, BoqFormatFileQueue, BoqFormatFileResult, BoqFormatSheetResult,
    BoqFormatWorkflowReport, BoqFormatWorkflowResponse, ErrorCode, IpcFileStatus,
    WorkbookFileRole, WorkspaceBoqFormatWorkflowRequest,
};

pub fn run_workspace_boq_format_workflow(
    request: &WorkspaceBoqFormatWorkflowRequest,
) -> BoqFormatWorkflowResponse {
    let data_dir = Path::new(&request.data_dir);
    let license_file = crate::ledger::license_path(data_dir);
    if let Err(err) = license::verify_license(&license_file) {
        let msg = err.to_string();
        let code = if msg.contains("AUTH_EXPIRED") {
            ErrorCode::AuthExpired
        } else {
            ErrorCode::InternalError
        };
        return BoqFormatWorkflowResponse {
            ok: false,
            report: None,
            error_code: Some(code),
            error_message: Some(msg),
        };
    }

    let workspace = Path::new(&request.workspace_root);
    if !workspace.is_dir() {
        return invalid_args(format!("工作区目录不存在: {}", workspace.display()));
    }

    let scan = match scanner::scan_workspace(workspace) {
        Ok(scan) => scan,
        Err(e) => return internal_err(format!("扫描工作区失败: {e}")),
    };

    let mut ledger = ProcessLedger::load_boq_format(workspace, data_dir);
    let log_path = boq_format_ledger_path(workspace).display().to_string();

    let discovered_files = build_discovered_boq_files(workspace, &scan, &ledger);

    if discovered_files.is_empty() {
        return failure_response(
            ErrorCode::InvalidArgs,
            "未发现 *_original.xlsx 原始合同价格表，请确认工作区存在源表且未被误删"
                .to_string(),
            workspace,
            Vec::new(),
            &log_path,
        );
    }

    let pending_count = discovered_files
        .iter()
        .filter(|d| d.queue == BoqFormatFileQueue::PendingProcess)
        .count();

    let mut file_results: Vec<BoqFormatFileResult> = Vec::new();
    let mut output_paths: Vec<String> = Vec::new();
    let mut success_count = 0u32;
    let mut skipped_count = 0u32;
    let mut failed_count = 0u32;

    for discovered in &discovered_files {
        if scanner::is_work1_formatted_boq_output(Path::new(&discovered.file_path)) {
            file_results.push(BoqFormatFileResult {
                file_name: discovered.file_name.clone(),
                file_path: discovered.file_path.clone(),
                status: IpcFileStatus::Failed,
                error_message: Some(discovered.role_reason.clone()),
                skipped_reason: None,
                output_path: None,
                output_csv_path: None,
                sheets: Vec::new(),
            });
            failed_count += 1;
            continue;
        }

        if discovered.queue == BoqFormatFileQueue::AlreadyProcessed {
            skipped_count += 1;
            let processed_at = discovered
                .ledger_processed_at
                .clone()
                .unwrap_or_default();
            file_results.push(BoqFormatFileResult {
                file_name: discovered.file_name.clone(),
                file_path: discovered.file_path.clone(),
                status: IpcFileStatus::Skipped,
                error_message: None,
                skipped_reason: Some(if discovered.role_reason.trim().is_empty() {
                    format!("boq_format_process_log.txt 已记录 SUCCESS @ {processed_at}")
                } else {
                    discovered.role_reason.clone()
                }),
                output_path: None,
                output_csv_path: None,
                sheets: Vec::new(),
            });
            continue;
        }

        let path = PathBuf::from(&discovered.file_path);
        let md5 = match scanner::file_md5(&path) {
            Ok(v) => v,
            Err(e) => {
                let err = e.to_string();
                ledger.record_failed(&discovered.file_name, "", &err);
                failed_count += 1;
                file_results.push(BoqFormatFileResult {
                    file_name: discovered.file_name.clone(),
                    file_path: discovered.file_path.clone(),
                    status: IpcFileStatus::Failed,
                    error_message: Some(err.clone()),
                    skipped_reason: None,
                    output_path: None,
                    output_csv_path: None,
                    sheets: Vec::new(),
                });
                continue;
            }
        };

        match process_one_boq(&path) {
            Ok((output, csv_output, sheets)) => {
                ledger.record_success_boq_format(&discovered.file_name, &md5);
                success_count += 1;
                output_paths.push(output.display().to_string());
                output_paths.push(csv_output.display().to_string());
                file_results.push(BoqFormatFileResult {
                    file_name: discovered.file_name.clone(),
                    file_path: discovered.file_path.clone(),
                    status: IpcFileStatus::Success,
                    error_message: None,
                    skipped_reason: None,
                    output_path: Some(output.display().to_string()),
                    output_csv_path: Some(csv_output.display().to_string()),
                    sheets,
                });
            }
            Err(err) => {
                ledger.record_failed(&discovered.file_name, &md5, &err);
                failed_count += 1;
                file_results.push(BoqFormatFileResult {
                    file_name: discovered.file_name.clone(),
                    file_path: discovered.file_path.clone(),
                    status: IpcFileStatus::Failed,
                    error_message: Some(err),
                    skipped_reason: None,
                    output_path: None,
                    output_csv_path: None,
                    sheets: Vec::new(),
                });
            }
        }
    }

    if let Err(e) = ledger.save_boq_format(workspace) {
        return internal_err(format!("保存 boq_format_process_log.txt 失败: {e}"));
    }

    let ok = failed_count == 0;
    BoqFormatWorkflowResponse {
        ok,
        report: Some(BoqFormatWorkflowReport {
            processed_at: Utc::now().to_rfc3339(),
            workspace_root: workspace.display().to_string(),
            success_count,
            skipped_count,
            failed_count,
            discovered_files,
            files: file_results,
            output_paths,
            boq_format_process_log_path: log_path,
        }),
        error_code: if failed_count > 0 {
            Some(ErrorCode::InternalError)
        } else {
            None
        },
        error_message: if failed_count > 0 {
            Some(format!("{failed_count} 个 BOQ 文件处理失败"))
        } else if pending_count == 0 && skipped_count > 0 {
            Some("全部 BOQ 已在 boq_format_process_log.txt 中标记为 SUCCESS，本次未改写文件".to_string())
        } else {
            None
        },
    }
}

fn build_discovered_boq_files(
    workspace: &Path,
    scan: &scanner::WorkspaceScan,
    ledger: &ProcessLedger,
) -> Vec<BoqFormatDiscoveredWorkbook> {
    let mut discovered = Vec::new();
    let mut indexed_sources: HashSet<String> = HashSet::new();

    for entry in select_work1_boq_source_entries(scan) {
        let path = Path::new(&entry.file_path);
        let row = discover_work1_source_row(workspace, path, entry, ledger);
        indexed_sources.insert(row.file_name.clone());
        discovered.push(row);
    }

    append_missing_boq_format_from_ledger(workspace, scan, ledger, &mut discovered, &mut indexed_sources);
    append_orphan_boq_format_outputs(workspace, scan, ledger, &mut discovered);

    sort_discovered_boq_files(&mut discovered);
    discovered
}

fn discover_work1_source_row(
    workspace: &Path,
    source_path: &Path,
    entry: &scanner::ClassifiedWorkbook,
    ledger: &ProcessLedger,
) -> BoqFormatDiscoveredWorkbook {
    let md5 = scanner::file_md5(source_path).ok();
    let ledger_entry_exact = md5
        .as_deref()
        .and_then(|hash| ledger.should_skip(&entry.file_name, hash));
    let ledger_entry_any = ledger_entry_exact
        .or_else(|| ledger.find_by_file_name(&entry.file_name));
    let ledger_exact_success = ledger_entry_exact
        .is_some_and(|e| e.status == crate::ledger::LedgerStatus::Success);
    let output_path = canonical_boq_output_path(source_path);
    let output_exists = output_path.is_file();

    let base_reason = if scanner::is_work1_boq_original_source_name(&entry.file_name) {
        "原始合同价格表（*_original.xlsx）".to_string()
    } else {
        format!(
            "{}（工作区无 *_original.xlsx 时的兼容识别）",
            entry.role_reason
        )
    };

    let (queue, role_reason) = resolve_work1_discover_queue(
        ledger_exact_success,
        ledger_entry_any,
        output_exists,
        &output_path,
        &base_reason,
    );

    let relative_path = source_path
        .strip_prefix(workspace)
        .map(|p| p.display().to_string())
        .unwrap_or_else(|_| entry.relative_path.clone());
    let folder_path = source_path
        .parent()
        .and_then(|p| p.strip_prefix(workspace).ok())
        .map(|p| p.display().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| entry.folder_path.clone());

    BoqFormatDiscoveredWorkbook {
        file_name: entry.file_name.clone(),
        file_path: source_path.display().to_string(),
        relative_path,
        folder_path,
        role_reason,
        project_name: scanner::extract_project_name(source_path, workspace),
        queue,
        in_ledger: ledger_entry_any.is_some(),
        ledger_processed_at: ledger_entry_any.map(|ent| ent.processed_at.clone()),
    }
}

/// 账本有 SUCCESS 但步骤 1 扫描未覆盖的源表（例如仅账本残留、或命名规则边缘情况）
fn append_missing_boq_format_from_ledger(
    workspace: &Path,
    _scan: &scanner::WorkspaceScan,
    ledger: &ProcessLedger,
    discovered: &mut Vec<BoqFormatDiscoveredWorkbook>,
    indexed_sources: &mut HashSet<String>,
) {
    use crate::ledger::BOQ_FORMAT_LEDGER_PERIOD;

    for entry in ledger.entries.values() {
        if entry.status != crate::ledger::LedgerStatus::Success {
            continue;
        }
        if entry.period.as_deref() != Some(BOQ_FORMAT_LEDGER_PERIOD) {
            continue;
        }
        if indexed_sources.contains(&entry.file_name) {
            continue;
        }
        let Some(source_path) = find_workspace_xlsx_by_file_name(workspace, &entry.file_name) else {
            continue;
        };
        let classified = scanner::classify_workbook(&source_path, workspace);
        let is_original = scanner::is_work1_boq_original_source_name(&classified.file_name);
        if scanner::is_work1_formatted_boq_output(&source_path)
            || align::is_aligned_master_path(&source_path)
        {
            continue;
        }
        if !is_original && classified.role != WorkbookFileRole::MasterContract {
            continue;
        }
        let row = discover_work1_source_row(workspace, &source_path, &classified, ledger);
        indexed_sources.insert(row.file_name.clone());
        discovered.push(row);
    }
}

/// 工作区存在 BOQ_format 输出但找不到对应 original 源表（源文件丢失）
fn append_orphan_boq_format_outputs(
    workspace: &Path,
    scan: &scanner::WorkspaceScan,
    _ledger: &ProcessLedger,
    discovered: &mut Vec<BoqFormatDiscoveredWorkbook>,
) {
    for output_path in list_work1_formatted_boq_outputs(workspace) {
        if discovered
            .iter()
            .any(|d| d.file_path == output_path.display().to_string())
        {
            continue;
        }
        let stem = output_path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or_default();
        let meta = parse_boq_filename_meta(stem);
        if workspace_has_matching_source(workspace, scan, &meta.project_id, &meta.substation_lot) {
            continue;
        }

        let file_name = output_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("BOQ_format.xlsx")
            .to_string();
        let relative_path = output_path
            .strip_prefix(workspace)
            .map(|p| p.display().to_string())
            .unwrap_or_else(|_| output_path.display().to_string());
        let folder_path = output_path
            .parent()
            .and_then(|p| p.strip_prefix(workspace).ok())
            .map(|p| p.display().to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| ".".to_string());

        discovered.push(BoqFormatDiscoveredWorkbook {
            file_name: file_name.clone(),
            file_path: output_path.display().to_string(),
            relative_path,
            folder_path,
            role_reason: format!(
                "工作区存在输出「{file_name}」，但找不到对应 original 源表，请恢复源文件后重新格式化"
            ),
            project_name: Some(meta.project_id),
            queue: BoqFormatFileQueue::PendingProcess,
            in_ledger: false,
            ledger_processed_at: None,
        });
    }
}

fn resolve_work1_discover_queue(
    ledger_exact_success: bool,
    ledger_entry_any: Option<&crate::ledger::LedgerEntry>,
    output_exists: bool,
    output_path: &Path,
    base_reason: &str,
) -> (BoqFormatFileQueue, String) {
    let output_name = output_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("BOQ_format.xlsx");
    let at = ledger_entry_any
        .map(|e| e.processed_at.as_str())
        .unwrap_or("—");

    if ledger_exact_success && output_exists {
        return (
            BoqFormatFileQueue::AlreadyProcessed,
            format!("{base_reason}；账本 SUCCESS（{at}），输出「{output_name}」存在"),
        );
    }
    if ledger_exact_success && !output_exists {
        return (
            BoqFormatFileQueue::PendingProcess,
            format!(
                "{base_reason}；账本 SUCCESS（{at}），但输出「{output_name}」已不存在，将重新格式化"
            ),
        );
    }
    if !ledger_exact_success && output_exists {
        return (
            BoqFormatFileQueue::PendingProcess,
            format!(
                "{base_reason}；输出「{output_name}」存在但账本无匹配 SUCCESS（或源文件已变更），将重新处理"
            ),
        );
    }
    (
        BoqFormatFileQueue::PendingProcess,
        format!("{base_reason}；待首次格式化，将生成「{output_name}」"),
    )
}

fn find_workspace_xlsx_by_file_name(workspace: &Path, file_name: &str) -> Option<PathBuf> {
    scanner::collect_xlsx_files(workspace)
        .ok()?
        .into_iter()
        .find(|p| p.file_name().and_then(|n| n.to_str()) == Some(file_name))
}

fn list_work1_formatted_boq_outputs(workspace: &Path) -> Vec<PathBuf> {
    let mut paths: Vec<PathBuf> = scanner::collect_xlsx_files(workspace)
        .unwrap_or_default()
        .into_iter()
        .filter(|p| scanner::is_work1_formatted_boq_output(p))
        .collect();
    paths.sort();
    paths
}

fn workspace_has_matching_source(
    workspace: &Path,
    scan: &scanner::WorkspaceScan,
    project_id: &str,
    substation_lot: &str,
) -> bool {
    let lot_key = substation_lot.trim().to_uppercase();
    let matches = |stem: &str| {
        let meta = parse_boq_filename_meta(stem);
        meta.project_id == project_id && meta.substation_lot.trim().to_uppercase() == lot_key
    };

    if select_work1_boq_source_entries(scan)
        .into_iter()
        .any(|e| {
            Path::new(&e.file_path)
                .file_stem()
                .and_then(|s| s.to_str())
                .is_some_and(matches)
        })
    {
        return true;
    }

    scanner::collect_xlsx_files(workspace)
        .unwrap_or_default()
        .into_iter()
        .any(|p| {
            let name = p.file_name().and_then(|n| n.to_str()).unwrap_or_default();
            if !scanner::is_work1_boq_original_source_name(name) || align::is_aligned_master_path(&p)
            {
                return false;
            }
            p.file_stem()
                .and_then(|s| s.to_str())
                .is_some_and(matches)
        })
}

fn sort_discovered_boq_files(files: &mut [BoqFormatDiscoveredWorkbook]) {
    files.sort_by(|a, b| {
        let key = |q: BoqFormatFileQueue| match q {
            BoqFormatFileQueue::PendingProcess => 0,
            BoqFormatFileQueue::AlreadyProcessed => 1,
        };
        key(a.queue)
            .cmp(&key(b.queue))
            .then_with(|| a.folder_path.cmp(&b.folder_path))
            .then_with(|| a.file_name.cmp(&b.file_name))
    });
}

/// 工作 1 仅处理原始 BOQ：优先 `*original*`（工作 4 将此类标为 Ignored，此处仍须纳入）；排除格式化配对输出与 `*_aligned`。
fn is_work1_boq_source_entry(entry: &scanner::ClassifiedWorkbook) -> bool {
    let path = Path::new(&entry.file_path);
    if align::is_aligned_master_path(path) || scanner::is_work1_formatted_boq_output(path) {
        return false;
    }
    scanner::is_work1_boq_original_source_name(&entry.file_name)
        || entry.role == WorkbookFileRole::MasterContract
}

/// 工作 1 仅处理原始 BOQ：优先 `*original*`；排除 `BOQ_format` 与 `*_aligned`。
fn select_work1_boq_source_entries(scan: &scanner::WorkspaceScan) -> Vec<&scanner::ClassifiedWorkbook> {
    let mut with_original: Vec<&scanner::ClassifiedWorkbook> = scan
        .entries
        .iter()
        .filter(|e| scanner::is_work1_boq_original_source_name(&e.file_name))
        .filter(|e| is_work1_boq_source_entry(e))
        .collect();

    if !with_original.is_empty() {
        with_original.sort_by(|a, b| a.file_path.cmp(&b.file_path));
        return with_original;
    }

    let mut candidates: Vec<&scanner::ClassifiedWorkbook> = scan
        .entries
        .iter()
        .filter(|e| e.role == WorkbookFileRole::MasterContract)
        .filter(|e| is_work1_boq_source_entry(e))
        .collect();
    candidates.sort_by(|a, b| a.file_path.cmp(&b.file_path));
    candidates
}

fn process_one_boq(
    source: &Path,
) -> Result<(PathBuf, PathBuf, Vec<BoqFormatSheetResult>), String> {
    let mut state = load_master_workbook_for_boq_format(source).map_err(|e| e.to_string())?;
    let mut sheet_reports = Vec::new();

    let sheet_names: Vec<String> = state.sheets.keys().cloned().collect();
    for sheet_name in sheet_names {
        let sheet = state.sheets.get_mut(&sheet_name).expect("sheet exists");
        let check = validate_boq_sheet(sheet);
        let normalize = normalize_contract_boq_sheet_for_format(sheet);
        ensure_schedule_total_row(sheet, &sheet_name);
        let check_after = validate_boq_sheet(sheet);
        if check_after.sum_check_ok == Some(false) {
            let decl = check_after.declared_total.unwrap_or(0.0);
            let sum = check_after.computed_sum.unwrap_or(0.0);
            return Err(format!(
                "{sheet_name} 明细 Total Price 合计 {sum:.2} 与 TOTAL SCHEDULE {decl:.2} 不一致"
            ));
        }
        sheet_reports.push(BoqFormatSheetResult {
            sheet_name: sheet_name.clone(),
            row_check_errors: check_after.row_formula_errors,
            sum_check_ok: check_after.sum_check_ok,
            declared_total: check.declared_total,
            computed_sum: check.computed_sum,
            dropped_empty_item: normalize.dropped_empty_item,
            dropped_note: normalize.dropped_note,
            dropped_subtotal: normalize.dropped_subtotal,
            dropped_duplicate: normalize.dropped_duplicate,
            output_row_count: normalize.output_row_count,
        });
    }

    align::refine_master_workbook_item_columns(&mut state);

    let output = canonical_boq_output_path(source);
    let csv_output = canonical_boq_csv_output_path(source);
    write_master_workbook(&state, source, &output).map_err(|e| e.to_string())?;
    write_boq_workbook_csv(&state, source, &csv_output).map_err(|e| e.to_string())?;
    Ok((output, csv_output, sheet_reports))
}

const BOQ_FORMAT_CSV_HEADERS: &[&str] = &[
    "item",
    "description",
    "unit",
    "est_qty",
    "unit_price",
    "total_price",
    "currency",
    "project_id",
    "substation_lot",
    "schedule",
];

fn canonical_boq_csv_output_path(source: &Path) -> PathBuf {
    let stem = source
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or_default();
    let file_name = format!("{}.csv", boq_original_stem_to_output_stem(stem));
    source
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .join(file_name)
}

fn schedule_label_number_from_sheet_name(sheet_name: &str) -> Option<u32> {
    static RE: OnceLock<Regex> = OnceLock::new();
    let re = RE.get_or_init(|| Regex::new(r"(?i)(?:schedule|sch)(?:\s|_|-)*(\d+)").unwrap());
    let caps = re.captures(sheet_name)?;
    caps.get(1)?.as_str().parse().ok()
}

fn schedule_label_from_sheet_name(sheet_name: &str) -> String {
    if let Some(n) = align::schedule_sheet_number(sheet_name) {
        return format!("Schedule{n}");
    }
    if let Some(n) = schedule_label_number_from_sheet_name(sheet_name) {
        return format!("Schedule{n}");
    }
    sheet_name.to_string()
}

fn schedule_sheet_sort_key(sheet_name: &str) -> u32 {
    align::schedule_sheet_number(sheet_name)
        .map(u32::from)
        .or_else(|| schedule_label_number_from_sheet_name(sheet_name))
        .unwrap_or(u32::MAX)
}

fn boq_csv_cell(cells: &[String], col: Option<usize>) -> String {
    col.and_then(|c| cells.get(c))
        .map(String::as_str)
        .unwrap_or("")
        .to_string()
}

fn write_boq_workbook_csv(
    state: &MasterWorkbookState,
    source: &Path,
    csv_path: &Path,
) -> std::io::Result<()> {
    let stem = source
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or_default();
    let meta = parse_boq_filename_meta(stem);

    let mut sheet_names: Vec<String> = state
        .sheets
        .keys()
        .filter(|name| align::is_schedule_sheet(name))
        .cloned()
        .collect();
    sheet_names.sort_by_key(|name| schedule_sheet_sort_key(name));

    let mut out = String::new();
    out.push_str(
        &BOQ_FORMAT_CSV_HEADERS
            .iter()
            .map(|h| escape_csv_field(h))
            .collect::<Vec<_>>()
            .join(","),
    );
    out.push('\n');

    for sheet_name in &sheet_names {
        let sheet = state
            .sheets
            .get(sheet_name)
            .expect("schedule sheet exists");
        let layout = detect_boq_column_layout(&sheet.headers, sheet.item_col);
        let currency = currency_for_master_sheet(sheet, source);
        let schedule = schedule_label_from_sheet_name(sheet_name);

        for row in &sheet.rows {
            let cells = &row.cells;
            let fields = [
                boq_csv_cell(cells, Some(sheet.item_col)),
                boq_csv_cell(cells, layout.description_col),
                boq_csv_cell(cells, layout.unit_col),
                boq_csv_cell(cells, layout.qty_col),
                boq_csv_cell(cells, Some(layout.unit_price_col)),
                boq_csv_cell(cells, layout.total_price_col),
                currency.clone(),
                meta.project_id.clone(),
                meta.substation_lot.clone(),
                schedule.clone(),
            ];
            out.push_str(
                &fields
                    .iter()
                    .map(|v| escape_csv_field(v))
                    .collect::<Vec<_>>()
                    .join(","),
            );
            out.push('\n');
        }
    }

    fs::write(csv_path, out)
}

fn escape_csv_field(v: &str) -> String {
    if v.contains(',') || v.contains('"') || v.contains('\n') {
        format!("\"{}\"", v.replace('"', "\"\""))
    } else {
        v.to_string()
    }
}

struct SheetValidation {
    row_formula_errors: u32,
    sum_check_ok: Option<bool>,
    declared_total: Option<f64>,
    computed_sum: Option<f64>,
}

fn validate_boq_sheet(sheet: &MasterSheetState) -> SheetValidation {
    let layout = detect_boq_column_layout(&sheet.headers, sheet.item_col);
    let item_col = sheet.item_col;
    let desc_col = sheet.description_col;
    let mut row_formula_errors = 0u32;

    for row in &sheet.rows {
        if row_is_boq_schedule_total(&row.cells, desc_col, item_col) {
            continue;
        }
        let Some(total_col) = layout.total_price_col else {
            continue;
        };
        let qty = layout
            .qty_col
            .and_then(|c| row.cells.get(c))
            .and_then(|v| parse_boq_number(v));
        let unit_price = row
            .cells
            .get(layout.unit_price_col)
            .and_then(|v| parse_boq_number(v));
        let total = row.cells.get(total_col).and_then(|v| parse_boq_number(v));
        if let (Some(q), Some(up), Some(tp)) = (qty, unit_price, total) {
            if q.abs() > f64::EPSILON && up.abs() > f64::EPSILON && !amounts_close(q * up, tp) {
                row_formula_errors += 1;
            }
        }
    }

    let computed_sum = layout.total_price_col.map(|col| {
        sheet
            .rows
            .iter()
            .filter(|r| !row_is_boq_schedule_total(&r.cells, desc_col, item_col))
            .filter_map(|r| r.cells.get(col).and_then(|v| parse_boq_number(v)))
            .sum::<f64>()
    });
    let declared_total = schedule_boq_amount_for_sheet(sheet);
    let sum_check_ok = match (computed_sum, declared_total) {
        (Some(sum), Some(decl)) if sum.abs() > f64::EPSILON || decl.abs() > f64::EPSILON => {
            Some(amounts_close(sum, decl))
        }
        _ => None,
    };

    SheetValidation {
        row_formula_errors,
        sum_check_ok,
        declared_total,
        computed_sum,
    }
}

fn ensure_schedule_total_row(sheet: &mut MasterSheetState, sheet_name: &str) {
    let item_col = sheet.item_col;
    let desc_col = sheet.description_col;
    let has_total = sheet
        .rows
        .iter()
        .any(|r| row_is_boq_schedule_total(&r.cells, desc_col, item_col));
    if has_total {
        return;
    }
    let schedule_no = align::schedule_sheet_number(sheet_name).unwrap_or(1);
    let mut cells = vec![String::new(); sheet.headers.len()];
    if let Some(col) = desc_col {
        cells[col] = format!("TOTAL SCHEDULE{schedule_no}");
    } else if let Some(cell) = cells.get_mut(item_col) {
        *cell = format!("TOTAL SCHEDULE{schedule_no}");
    }
    sheet.rows.push(align::MasterRow {
        cells,
        composite_key: format!("TOTAL|SCHEDULE{schedule_no}"),
    });
}

/// 由原始表 stem 推导输出 stem（去掉 `_original`，不加 `_format`）：`SSLOT1-IRI-BOQ_original` → `SSLOT1-IRI-BOQ`
pub fn boq_original_stem_to_output_stem(stem: &str) -> String {
    const ORIGINAL_SUFFIX: &str = "_original";
    let lower = stem.to_lowercase();
    if lower.ends_with(ORIGINAL_SUFFIX) {
        return stem[..stem.len() - ORIGINAL_SUFFIX.len()].to_string();
    }
    if let Some(pos) = lower.find("-original-") {
        return format!(
            "{}{}",
            &stem[..pos],
            &stem[pos + "-original-".len()..]
        );
    }
    stem.to_string()
}

pub fn work1_original_path_for_output(output: &Path) -> PathBuf {
    let stem = output
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or_default();
    let parent = output.parent().unwrap_or_else(|| Path::new("."));
    parent.join(format!("{stem}_original.xlsx"))
}

fn canonical_boq_output_path(source: &Path) -> PathBuf {
    let stem = source
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or_default();
    let file_name = format!("{}.xlsx", boq_original_stem_to_output_stem(stem));
    source.parent().unwrap_or_else(|| Path::new(".")).join(file_name)
}

struct BoqFilenameMeta {
    project_id: String,
    substation_lot: String,
}

fn parse_boq_filename_meta(stem: &str) -> BoqFilenameMeta {
    let stem = stem.trim();
    let stem = if stem.to_lowercase().ends_with("_original") {
        &stem[..stem.len() - "_original".len()]
    } else {
        stem
    };
    let tokens: Vec<String> = filename_token_split_re()
        .split(stem)
        .map(str::trim)
        .filter(|t| !t.is_empty())
        .map(|t| t.to_string())
        .collect();
    let project_id = tokens
        .first()
        .map(|t| normalize_project_token(t))
        .filter(|t| !t.is_empty())
        .unwrap_or_else(|| "UNKNOWN".to_string());
    let boq_idx = tokens.iter().position(|t| is_boq_token(t));
    let substation_lot = if let Some(boq_i) = boq_idx {
        if boq_i > 1 {
            tokens[1..boq_i]
                .iter()
                .filter(|t| !is_skip_token(t))
                .cloned()
                .collect::<Vec<_>>()
                .join("-")
        } else {
            String::new()
        }
    } else {
        tokens
            .iter()
            .skip(1)
            .take_while(|t| !is_skip_token(t))
            .cloned()
            .collect::<Vec<_>>()
            .join("-")
    };
    BoqFilenameMeta {
        project_id,
        substation_lot,
    }
}

fn filename_token_split_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"[\s_\-]+").unwrap())
}

fn is_boq_token(token: &str) -> bool {
    let lower = token.to_lowercase();
    lower == "boq" || lower.contains("boq")
}

fn is_skip_token(token: &str) -> bool {
    let lower = token.to_lowercase();
    lower.contains("usd")
        || lower.contains("tzs")
        || lower.contains("eur")
        || lower.contains("price")
        || is_boq_token(token)
}

fn normalize_project_token(token: &str) -> String {
    if let Some(id) = scanner::project_id_from_token_text(token) {
        return id;
    }
    token.to_uppercase()
}

fn failure_response(
    code: ErrorCode,
    message: String,
    workspace: &Path,
    discovered_files: Vec<BoqFormatDiscoveredWorkbook>,
    log_path: &str,
) -> BoqFormatWorkflowResponse {
    BoqFormatWorkflowResponse {
        ok: false,
        report: Some(BoqFormatWorkflowReport {
            processed_at: Utc::now().to_rfc3339(),
            workspace_root: workspace.display().to_string(),
            success_count: 0,
            skipped_count: 0,
            failed_count: 0,
            discovered_files,
            files: Vec::new(),
            output_paths: Vec::new(),
            boq_format_process_log_path: log_path.to_string(),
        }),
        error_code: Some(code),
        error_message: Some(message),
    }
}

fn invalid_args(message: String) -> BoqFormatWorkflowResponse {
    BoqFormatWorkflowResponse {
        ok: false,
        report: None,
        error_code: Some(ErrorCode::InvalidArgs),
        error_message: Some(message),
    }
}

fn internal_err(message: String) -> BoqFormatWorkflowResponse {
    BoqFormatWorkflowResponse {
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
    fn compare_item_natural_order() {
        use std::cmp::Ordering;
        assert_eq!(
            align::compare_boq_item_number("1.9", "1.10"),
            Ordering::Less
        );
        assert_eq!(
            align::compare_boq_item_number("2.2", "2.20"),
            Ordering::Less
        );
    }

    #[test]
    fn parse_boq_filename_meta_splits_lot() {
        let meta = parse_boq_filename_meta("SSLOT1-IRI-BOQ");
        assert_eq!(meta.project_id, "SSLOT1");
        assert_eq!(meta.substation_lot, "IRI");
    }

    #[test]
    fn canonical_boq_csv_path_matches_xlsx_stem() {
        let source = Path::new("/ws/SSLOT1-IRI-BOQ_original.xlsx");
        assert_eq!(
            canonical_boq_csv_output_path(source),
            Path::new("/ws/SSLOT1-IRI-BOQ.csv")
        );
    }

    #[test]
    fn schedule_label_from_sheet_name_uses_schedule_number() {
        assert_eq!(
            schedule_label_from_sheet_name("Schedule2-USD"),
            "Schedule2"
        );
        assert_eq!(
            schedule_label_from_sheet_name("Schedule12-TZS"),
            "Schedule12"
        );
    }

    #[test]
    fn boq_original_stem_to_output_strips_suffix() {
        assert_eq!(
            boq_original_stem_to_output_stem("SSLOT1-IRI-BOQ_original"),
            "SSLOT1-IRI-BOQ"
        );
        assert_eq!(
            boq_original_stem_to_output_stem("SSLOT1-BOQ_original"),
            "SSLOT1-BOQ"
        );
    }

    #[test]
    fn canonical_output_drops_original_suffix_only() {
        let source = Path::new("/ws/SSLOT1-IRI-BOQ_original.xlsx");
        let out = canonical_boq_output_path(source);
        assert_eq!(out, Path::new("/ws/SSLOT1-IRI-BOQ.xlsx"));
    }

    #[test]
    fn step1_does_not_treat_unrelated_boq_file_as_done_for_lot_original() {
        use crate::engine::scanner::scan_workspace;
        use crate::ledger::{ProcessLedger, BOQ_FORMAT_LEDGER_PERIOD};

        let dir = std::env::temp_dir().join(format!(
            "epc_work1_wrong_output_{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();

        let source = dir.join("SSLOT1-IRI-BOQ_original.xlsx");
        let wrong_output = dir.join("SSLOT1-BOQ.xlsx");
        std::fs::write(&source, b"iri-source").unwrap();
        std::fs::write(&wrong_output, b"wrong-output").unwrap();

        let md5 = scanner::file_md5(&source).unwrap();
        let mut ledger = ProcessLedger::default();
        ledger.record_success(
            source.file_name().and_then(|n| n.to_str()).unwrap(),
            &md5,
            BOQ_FORMAT_LEDGER_PERIOD,
        );

        let scan = scan_workspace(&dir).unwrap();
        let discovered = build_discovered_boq_files(&dir, &scan, &ledger);
        let row = discovered
            .iter()
            .find(|d| d.file_name == "SSLOT1-IRI-BOQ_original.xlsx")
            .expect("IRI original row");
        assert_eq!(
            row.queue,
            BoqFormatFileQueue::PendingProcess,
            "wrong SSLOT1-BOQ.xlsx must not satisfy IRI original: {:?}",
            row.role_reason
        );
    }

    #[test]
    fn step1_requeues_when_ledger_success_but_output_deleted() {
        use crate::engine::scanner::scan_workspace;
        use crate::ledger::{ProcessLedger, BOQ_FORMAT_LEDGER_PERIOD};

        let dir = std::env::temp_dir().join(format!(
            "epc_work1_output_missing_{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();

        let source = dir.join("SSLOT1-IRI-BOQ_original.xlsx");
        let output = dir.join("SSLOT1-IRI-BOQ.xlsx");
        std::fs::write(&source, b"source-v1").unwrap();
        std::fs::write(&output, b"output-v1").unwrap();

        let md5 = scanner::file_md5(&source).unwrap();
        let mut ledger = ProcessLedger::default();
        ledger.record_success(
            source.file_name().and_then(|n| n.to_str()).unwrap(),
            &md5,
            BOQ_FORMAT_LEDGER_PERIOD,
        );
        std::fs::remove_file(&output).unwrap();

        let scan = scan_workspace(&dir).unwrap();
        let discovered = build_discovered_boq_files(&dir, &scan, &ledger);
        let row = discovered
            .iter()
            .find(|d| d.file_name == "SSLOT1-IRI-BOQ_original.xlsx")
            .expect("source row");
        assert_eq!(row.queue, BoqFormatFileQueue::PendingProcess);
        assert!(row.role_reason.contains("已不存在"));
    }

    #[test]
    fn step1_already_processed_requires_output_on_disk() {
        use crate::engine::scanner::scan_workspace;
        use crate::ledger::{ProcessLedger, BOQ_FORMAT_LEDGER_PERIOD};

        let dir = std::env::temp_dir().join(format!(
            "epc_work1_output_ok_{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();

        let source = dir.join("SSLOT1-IRI-BOQ_original.xlsx");
        let output = dir.join("SSLOT1-IRI-BOQ.xlsx");
        std::fs::write(&source, b"source-v1").unwrap();
        std::fs::write(&output, b"output-v1").unwrap();

        let md5 = scanner::file_md5(&source).unwrap();
        let mut ledger = ProcessLedger::default();
        ledger.record_success(
            source.file_name().and_then(|n| n.to_str()).unwrap(),
            &md5,
            BOQ_FORMAT_LEDGER_PERIOD,
        );

        let scan = scan_workspace(&dir).unwrap();
        let discovered = build_discovered_boq_files(&dir, &scan, &ledger);
        let row = discovered
            .iter()
            .find(|d| d.file_name == "SSLOT1-IRI-BOQ_original.xlsx")
            .expect("source row");
        assert_eq!(row.queue, BoqFormatFileQueue::AlreadyProcessed);
        assert!(row.role_reason.contains("SSLOT1-IRI-BOQ.xlsx"));
    }

    #[test]
    fn step1_discovers_original_sources_when_work4_classifies_them_ignored() {
        use crate::engine::scanner::{self, scan_workspace};
        use crate::ledger::{ProcessLedger, BOQ_FORMAT_LEDGER_PERIOD};

        let dir = std::env::temp_dir().join(format!(
            "epc_work1_ignored_original_{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();

        let sources = [
            dir.join("SSLOT1-IRI-BOQ_original.xlsx"),
            dir.join("SSLOT4-BOQ_original.xlsx"),
        ];
        for source in &sources {
            std::fs::write(source, b"source").unwrap();
        }
        let outputs = [
            dir.join("SSLOT1-IRI-BOQ.xlsx"),
            dir.join("SSLOT4-BOQ.xlsx"),
        ];
        for output in &outputs {
            std::fs::write(output, b"out").unwrap();
        }

        let mut ledger = ProcessLedger::default();
        for source in &sources {
            let md5 = scanner::file_md5(source).unwrap();
            ledger.record_success(
                source.file_name().and_then(|n| n.to_str()).unwrap(),
                &md5,
                BOQ_FORMAT_LEDGER_PERIOD,
            );
        }

        let scan = scan_workspace(&dir).unwrap();
        for source in &sources {
            let name = source.file_name().and_then(|n| n.to_str()).unwrap();
            let entry = scan.entries.iter().find(|e| e.file_name == name).expect(name);
            assert_eq!(
                scanner::detect_workbook_role(Path::new(&entry.file_path)).0,
                crate::types::WorkbookFileRole::Ignored,
                "{name} should be Ignored for work 4"
            );
        }

        let discovered = build_discovered_boq_files(&dir, &scan, &ledger);
        assert_eq!(discovered.len(), 2);
        assert!(
            discovered
                .iter()
                .all(|d| d.queue == BoqFormatFileQueue::AlreadyProcessed),
            "all sources already processed: {:?}",
            discovered
        );
    }
}
