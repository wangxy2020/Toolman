mod align;
mod boq_format;
mod export_audit;
mod ipc_cleaned_cache;
mod payment;
mod pm_sync;
mod scanner;
mod shipping_ci;

use std::path::{Path, PathBuf};

use chrono::Utc;

use crate::ledger::{ledger_path, license_path, ProcessLedger};
use crate::license::{self, LicenseError};
use crate::types::{
    DiscoveredWorkbook, ErrorCode, ExportErrorAuditRequest, ExportErrorAuditResponse, IpcAlignmentReport,
    IpcAlignmentRequest, IpcAlignmentResponse, IpcFileResult, IpcFileStatus, PaymentWorkflowResponse,
    WorkspaceIpcWorkflowRequest, WorkspacePaymentWorkflowRequest,
};

pub use export_audit::export_error_audit;

pub fn run_workspace_payment_workflow(request: &WorkspacePaymentWorkflowRequest) -> PaymentWorkflowResponse {
    payment::run_workspace_payment_workflow(request)
}

pub fn run_workspace_boq_format_workflow(
    request: &crate::types::WorkspaceBoqFormatWorkflowRequest,
) -> crate::types::BoqFormatWorkflowResponse {
    boq_format::run_workspace_boq_format_workflow(request)
}

pub fn run_workspace_shipping_ci_workflow(
    request: &crate::types::WorkspaceShippingCiWorkflowRequest,
) -> crate::types::ShippingCiWorkflowResponse {
    shipping_ci::run_workspace_shipping_ci_workflow(request)
}

pub fn commit_shipping_ci_ledger(
    request: &crate::types::CommitShippingCiLedgerRequest,
) -> crate::types::SimpleOkResponse {
    match shipping_ci::commit_shipping_ci_ledger_successes(request) {
        Ok(()) => crate::types::SimpleOkResponse {
            ok: true,
            error_message: None,
        },
        Err(err) => crate::types::SimpleOkResponse {
            ok: false,
            error_message: Some(err.to_string()),
        },
    }
}

pub fn append_payment_data_patch(
    workspace_root: &str,
    patch: crate::data_overrides::PaymentDataPatch,
) -> anyhow::Result<()> {
    let workspace = PathBuf::from(workspace_root);
    payment::append_payment_data_patch(&workspace, patch)
}

pub fn apply_payment_data_overrides(workspace_root: &str) -> anyhow::Result<()> {
    payment::apply_payment_data_overrides_to_workbook(&PathBuf::from(workspace_root))
}

pub fn propagate_pm_data_after_edit(
    workspace_root: &str,
    edited_file_path: &str,
) -> anyhow::Result<crate::types::PropagatePmDataResponse> {
    let workspace = PathBuf::from(workspace_root);
    let edited = PathBuf::from(edited_file_path);
    match pm_sync::propagate_pm_data_after_edit(&workspace, &edited) {
        Ok(actions) => Ok(crate::types::PropagatePmDataResponse {
            ok: true,
            actions,
            error_message: None,
        }),
        Err(err) => Ok(crate::types::PropagatePmDataResponse {
            ok: false,
            actions: vec![],
            error_message: Some(err.to_string()),
        }),
    }
}

/// 兼容旧 CLI：等价于工作区工作流
pub fn run_ipc_alignment(request: &IpcAlignmentRequest) -> IpcAlignmentResponse {
    run_workspace_ipc_workflow(&WorkspaceIpcWorkflowRequest {
        workspace_root: request.ipc_root_path.clone(),
        period: Some(request.period.clone()),
        master_price_path: Some(request.master_price_path.clone()),
        data_dir: request.data_dir.clone(),
        ignore_revisions: None,
    })
}

/// 工作 4：工作区 IPC 进度款工程量统计（自然语言 / 快捷短语 / epc ipc4 to boq）
pub fn run_workspace_ipc_workflow(request: &WorkspaceIpcWorkflowRequest) -> IpcAlignmentResponse {
    let data_dir = Path::new(&request.data_dir);
    let license_file = license_path(data_dir);

    if let Err(err) = license::verify_license(&license_file) {
        let msg = err.to_string();
        let code = if msg.contains("AUTH_EXPIRED") {
            ErrorCode::AuthExpired
        } else {
            ErrorCode::InternalError
        };
        return IpcAlignmentResponse {
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

    let workflow_period = request
        .period
        .as_ref()
        .map(|p| p.trim().to_string())
        .filter(|p| !p.is_empty());

    let mut ledger = ProcessLedger::load(workspace, data_dir);

    let (discovered_files, ipc_files) = match scan.build_discovered_and_pending_ipc(
        &ledger,
        workflow_period.as_deref(),
    ) {
        Ok(result) => result,
        Err(e) => return internal_err(format!("步骤1穿透匹配失败: {e}")),
    };

    let default_period_for_csv = resolve_default_workflow_period(
        workflow_period.as_deref(),
        &scan,
        &ipc_files,
        &discovered_files,
    );
    let csv_failures = ipc_cleaned_cache::ensure_cleaned_csv_for_all_ipc_progress(
        workspace,
        &discovered_files,
        &default_period_for_csv,
    );
    write_step2_csv_failures_audit(workspace, &csv_failures, &discovered_files);

    let master = resolve_master_path(workspace, request.master_price_path.as_deref(), &scan);
    let Some(master) = master else {
        return failure_response(
            ErrorCode::InvalidArgs,
            "未找到合同母表 xlsx（文件名宜含 BOQ/价格表等且无 IPC 期号），或附加行「母表: 路径」".to_string(),
            workspace,
            discovered_files,
            None,
            workflow_period.as_deref(),
        );
    };

    if ipc_files.is_empty() {
        let mut message = "步骤1未找到待处理 IPC：须文件名含 IPC 期号 + SCH/Schedule，且工作区 ipc_process_log.txt 中无对应 SUCCESS 记录（FAILED 可重试）"
            .to_string();
        if csv_failures.is_empty() {
            message.push_str("；已为识别到的 IPC 工程量清单补全同目录清洗 CSV（若目录中仍无 .csv，请查看 epc_step2_csv_errors.json）");
        } else {
            message.push_str(&format!(
                "；{} 个 IPC 未能生成清洗 CSV，详见工作区根目录 epc_step2_csv_errors.json",
                csv_failures.len()
            ));
        }
        return failure_response(
            ErrorCode::InvalidArgs,
            message,
            workspace,
            discovered_files,
            Some(master.as_path()),
            workflow_period.as_deref(),
        );
    }

    let period = workflow_period
        .or_else(|| scan.infer_workspace_period())
        .or_else(|| scanner::infer_ipc_period_from_files(&ipc_files));

    let Some(period) = period else {
        return failure_response(
            ErrorCode::InvalidArgs,
            "无法推断 IPC 期数：请在 IPC 文件名中包含 IPC4 等标记，或在消息中附加「期数: ipc4」".to_string(),
            workspace,
            discovered_files,
            Some(master.as_path()),
            None,
        );
    };

    // 仅当用户显式指定母表路径时才穿透给 resolve_master_for_ipc；
    // 勿用 pick_master_contract() 的全局默认母表，否则多 LOT 工作区会把 SSLOT1 IPC 误合并到 SSLOT4 BOQ。
    let explicit_master = request
        .master_price_path
        .as_deref()
        .filter(|p| Path::new(p).is_file());

    process_ipc_alignment(
        data_dir,
        workspace,
        explicit_master,
        &scan,
        &ipc_files,
        &period,
        discovered_files,
        &mut ledger,
        request.ignore_revisions.unwrap_or(false),
    )
}

fn resolve_default_workflow_period(
    workflow_period: Option<&str>,
    scan: &scanner::WorkspaceScan,
    ipc_files: &[PathBuf],
    discovered: &[DiscoveredWorkbook],
) -> String {
    workflow_period
        .map(|s| s.to_string())
        .or_else(|| scan.infer_workspace_period())
        .or_else(|| scanner::infer_ipc_period_from_files(ipc_files))
        .or_else(|| discovered.iter().find_map(|d| d.period_code.clone()))
        .unwrap_or_else(|| "IPC4".to_string())
}

fn write_step2_csv_failures_audit(
    workspace: &Path,
    csv_failures: &[(String, String)],
    discovered: &[DiscoveredWorkbook],
) {
    if csv_failures.is_empty() {
        return;
    }
    let rows: Vec<crate::types::AuditErrorRow> = csv_failures
        .iter()
        .map(|(file_name, err_msg)| crate::types::AuditErrorRow {
            file_name: file_name.clone(),
            file_path: discovered
                .iter()
                .find(|d| d.file_name == *file_name)
                .map(|d| d.file_path.clone())
                .unwrap_or_default(),
            sheet_name: None,
            row_hint: None,
            error_message: format!("步骤2清洗CSV未生成: {err_msg}"),
        })
        .collect();
    let path = workspace.join("epc_step2_csv_errors.json");
    let _ = std::fs::write(path, serde_json::to_string_pretty(&rows).unwrap_or_default());
}

fn resolve_master_path(
    workspace: &Path,
    explicit: Option<&str>,
    scan: &scanner::WorkspaceScan,
) -> Option<PathBuf> {
    if let Some(path) = explicit {
        let p = Path::new(path);
        if p.is_file() {
            return Some(p.to_path_buf());
        }
    }
    scan.pick_master_contract()
        .or_else(|| scanner::find_master_workbook(workspace))
}

fn process_ipc_alignment(
    data_dir: &Path,
    workspace: &Path,
    explicit_master: Option<&str>,
    scan: &scanner::WorkspaceScan,
    ipc_files: &[PathBuf],
    default_period: &str,
    discovered_files: Vec<crate::types::DiscoveredWorkbook>,
    ledger: &mut ProcessLedger,
    ignore_revisions: bool,
) -> IpcAlignmentResponse {
    let mut file_results: Vec<IpcFileResult> = Vec::new();

    for discovered in &discovered_files {
        if discovered.role == crate::types::WorkbookFileRole::IpcProgress {
            continue;
        }
        file_results.push(IpcFileResult {
            file_name: discovered.file_name.clone(),
            file_path: discovered.file_path.clone(),
            status: IpcFileStatus::Skipped,
            md5: None,
            error_message: None,
            skipped_reason: Some(format!(
                "[步骤1-穿透识别] {}：{}",
                workbook_role_label(discovered.role),
                discovered.role_reason
            )),
            analysis_ok: None,
            merge_ok: None,
            cleaned_row_count: None,
            cleaned_total_amount: None,
            cleaned_currency: None,
            analysis_row_error_count: None,
            reconciliation_ok: None,
            boq_value_total: None,
            merge_matched_rows: None,
            merge_target_sheet: None,
            merge_period_column: None,
        });
    }
    let mut audit_errors: Vec<crate::types::AuditErrorRow> = Vec::new();

    use std::collections::HashMap;
    let mut ipc_by_master: HashMap<PathBuf, Vec<PathBuf>> = HashMap::new();
    for ipc_path in ipc_files {
        let Some(master) = scan.resolve_master_for_ipc(ipc_path, explicit_master) else {
            let file_name = ipc_path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("unknown.xlsx")
                .to_string();
            let err_msg = "未找到与该 IPC 同目录树下的合同母表".to_string();
            file_results.push(IpcFileResult {
                file_name: file_name.clone(),
                file_path: ipc_path.display().to_string(),
                status: IpcFileStatus::Failed,
                md5: None,
                error_message: Some(err_msg.clone()),
                skipped_reason: None,
                analysis_ok: Some(false),
                merge_ok: None,
                cleaned_row_count: None,
                cleaned_total_amount: None,
                cleaned_currency: None,
                analysis_row_error_count: None,
                reconciliation_ok: None,
                boq_value_total: None,
                merge_matched_rows: None,
                merge_target_sheet: None,
                merge_period_column: None,
            });
            audit_errors.push(crate::types::AuditErrorRow {
                file_name,
                file_path: ipc_path.display().to_string(),
                sheet_name: None,
                row_hint: None,
                error_message: err_msg,
            });
            continue;
        };
        ipc_by_master.entry(master).or_default().push(ipc_path.clone());
    }

    let ignore_rev = ignore_revisions;
    let pm_revisions = if ignore_revisions {
        crate::data_overrides::PmRevisionsFile::default()
    } else {
        crate::data_overrides::load_pm_revisions(workspace)
    };
    let aligned_locks = crate::data_overrides::aligned_cell_locks_slice(&pm_revisions);

    let mut output_masters: Vec<PathBuf> = Vec::new();
    let mut primary_master: Option<PathBuf> = None;

    for (master, group_ipc_files) in ipc_by_master {
        primary_master.get_or_insert_with(|| master.clone());
        let (load_path, output_path) = align::resolve_master_merge_paths(&master);
        let mut master_state = match align::load_master_workbook(&load_path) {
            Ok(state) => state,
            Err(e) => {
                for ipc_path in &group_ipc_files {
                    let file_name = ipc_path
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("unknown.xlsx")
                        .to_string();
                    let err_msg = format!("读取母表失败: {e}");
                    file_results.push(IpcFileResult {
                        file_name,
                        file_path: ipc_path.display().to_string(),
                        status: IpcFileStatus::Failed,
                        md5: None,
                        error_message: Some(err_msg.clone()),
                        skipped_reason: None,
                        analysis_ok: Some(false),
                        merge_ok: None,
                        cleaned_row_count: None,
                        cleaned_total_amount: None,
                        cleaned_currency: None,
                        analysis_row_error_count: None,
                        reconciliation_ok: None,
                        boq_value_total: None,
                        merge_matched_rows: None,
                        merge_target_sheet: None,
                        merge_period_column: None,
                    });
                }
                continue;
            }
        };
        align::refine_master_workbook_item_columns(&mut master_state);

        let output_rel = crate::data_overrides::path_relative_to_workspace(workspace, &output_path);
        let merge_ctx = align::MergeRevisionContext {
            output_master_relative: &output_rel,
            aligned_locks,
            ignore_revisions: ignore_rev,
        };

        let mut last_period = default_period.to_string();

        for ipc_path in &group_ipc_files {
        let file_name = ipc_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown.xlsx")
            .to_string();
        let md5 = match scanner::file_md5(ipc_path) {
            Ok(v) => v,
            Err(e) => {
                file_results.push(IpcFileResult {
                    file_name: file_name.clone(),
                    file_path: ipc_path.display().to_string(),
                    status: IpcFileStatus::Failed,
                    md5: None,
                    error_message: Some(e.to_string()),
                    skipped_reason: None,
                    analysis_ok: None,
                    merge_ok: None,
                    cleaned_row_count: None,
                    cleaned_total_amount: None,
                    cleaned_currency: None,
                    analysis_row_error_count: None,
                    reconciliation_ok: None,
                    boq_value_total: None,
                    merge_matched_rows: None,
                    merge_target_sheet: None,
                    merge_period_column: None,
                });
                continue;
            }
        };

        // 台账 SUCCESS 仅在 aligned 母表里确实存在该期数列且有数据时才跳过；
        // 否则（如用户删除 aligned 后由工作 1 重建）须重新合并，避免"显示成功但列为空"。
        let ledger_skip = ledger.is_marked_success(&file_name, &md5)
            && scan
                .resolve_master_for_ipc(ipc_path, explicit_master)
                .is_some_and(|master| align::aligned_master_available(&master))
            && {
                let (period, schedule_hint) =
                    scanner::ipc_period_and_schedule_hint(ipc_path, default_period);
                let schedule_digit =
                    scanner::resolve_schedule_digit_for_ipc(ipc_path, &period);
                align::master_state_has_period_data(
                    &master_state,
                    &schedule_hint,
                    schedule_digit,
                    &period,
                )
            };
        if ledger_skip {
            let entry = ledger.should_skip(&file_name, &md5).expect("success entry");
            file_results.push(IpcFileResult {
                file_name: file_name.clone(),
                file_path: ipc_path.display().to_string(),
                status: IpcFileStatus::Skipped,
                md5: Some(md5),
                error_message: None,
                skipped_reason: Some(format!(
                    "ipc_process_log.txt 已记录 SUCCESS @ {}",
                    entry.processed_at
                )),
                analysis_ok: None,
                merge_ok: None,
                cleaned_row_count: None,
                cleaned_total_amount: None,
                cleaned_currency: None,
                analysis_row_error_count: None,
                reconciliation_ok: None,
                boq_value_total: None,
                merge_matched_rows: None,
                merge_target_sheet: None,
                merge_period_column: None,
            });
            continue;
        }

        let (inferred_period, schedule_hint) =
            scanner::ipc_period_and_schedule_hint(ipc_path, default_period);
        last_period = inferred_period.clone();
        let schedule_digit =
            scanner::resolve_schedule_digit_for_ipc(ipc_path, &inferred_period);

        match ipc_cleaned_cache::load_or_analyze_ipc_workbook(
            workspace,
            ipc_path,
            &md5,
            &schedule_hint,
            &inferred_period,
            true,
        ) {
            Ok(analysis) => {
                let cleaned_count = analysis.rows.len() as u32;
                let cleaned_total = analysis.total_current_amount;
                let cleaned_currency = analysis.currency.clone();
                let analysis_row_error_count = analysis.row_validation_error_count;
                let boq_value_total = analysis.boq_value_total;
                let reconciliation_ok = align::ipc_reconciliation_ok(&analysis);

                if reconciliation_ok == Some(false) {
                    let err_msg = format!(
                        "明细本期金额合计 {cleaned_total:.2} 与表格 BOQ Value 总金额 {:.2} 不一致",
                        boq_value_total.unwrap_or(0.0)
                    );
                    ledger.record_failed(&file_name, &md5, &err_msg);
                    audit_errors.push(crate::types::AuditErrorRow {
                        file_name: file_name.clone(),
                        file_path: ipc_path.display().to_string(),
                        sheet_name: Some(analysis.sheet_name.clone()),
                        row_hint: None,
                        error_message: err_msg.clone(),
                    });
                    file_results.push(IpcFileResult {
                        file_name,
                        file_path: ipc_path.display().to_string(),
                        status: IpcFileStatus::Failed,
                        md5: Some(md5),
                        error_message: Some(err_msg),
                        skipped_reason: None,
                        analysis_ok: Some(true),
                        merge_ok: Some(false),
                        cleaned_row_count: Some(cleaned_count),
                        cleaned_total_amount: Some(cleaned_total),
                        cleaned_currency: Some(cleaned_currency),
                        analysis_row_error_count: Some(analysis_row_error_count),
                        reconciliation_ok: Some(false),
                        boq_value_total,
                        merge_matched_rows: None,
                        merge_target_sheet: None,
                        merge_period_column: None,
                    });
                    continue;
                }

                match align::apply_ipc_analysis_to_master(
                    &mut master_state,
                    &analysis,
                    &schedule_hint,
                    &inferred_period,
                    schedule_digit,
                    Some(&merge_ctx),
                ) {
                    Ok(merge) => {
                        ledger.record_success(&file_name, &md5, &inferred_period);
                        file_results.push(IpcFileResult {
                            file_name,
                            file_path: ipc_path.display().to_string(),
                            status: IpcFileStatus::Success,
                            md5: Some(md5),
                            error_message: None,
                            skipped_reason: None,
                            analysis_ok: Some(true),
                            merge_ok: Some(true),
                            cleaned_row_count: Some(cleaned_count),
                            cleaned_total_amount: Some(cleaned_total),
                            cleaned_currency: Some(cleaned_currency.clone()),
                            analysis_row_error_count: Some(analysis_row_error_count),
                            reconciliation_ok,
                            boq_value_total,
                            merge_matched_rows: Some(merge.matched_rows),
                            merge_target_sheet: Some(merge.target_sheet),
                            merge_period_column: Some(merge.period_column),
                        });
                    }
                    Err(e) => {
                        let err_msg = e.to_string();
                        ledger.record_failed(&file_name, &md5, &err_msg);
                        audit_errors.push(crate::types::AuditErrorRow {
                            file_name: file_name.clone(),
                            file_path: ipc_path.display().to_string(),
                            sheet_name: Some(analysis.sheet_name.clone()),
                            row_hint: None,
                            error_message: err_msg.clone(),
                        });
                        file_results.push(IpcFileResult {
                            file_name,
                            file_path: ipc_path.display().to_string(),
                            status: IpcFileStatus::Failed,
                            md5: Some(md5),
                            error_message: Some(err_msg),
                            skipped_reason: None,
                            analysis_ok: Some(true),
                            merge_ok: Some(false),
                            cleaned_row_count: Some(cleaned_count),
                            cleaned_total_amount: Some(cleaned_total),
                            cleaned_currency: Some(cleaned_currency),
                            analysis_row_error_count: Some(analysis_row_error_count),
                            reconciliation_ok,
                            boq_value_total,
                            merge_matched_rows: None,
                            merge_target_sheet: None,
                            merge_period_column: None,
                        });
                    }
                }
            }
            Err(e) => {
                let err_msg = e.to_string();
                ledger.record_failed(&file_name, &md5, &err_msg);
                audit_errors.push(crate::types::AuditErrorRow {
                    file_name: file_name.clone(),
                    file_path: ipc_path.display().to_string(),
                    sheet_name: Some(schedule_hint.clone()),
                    row_hint: None,
                    error_message: err_msg.clone(),
                });
                file_results.push(IpcFileResult {
                    file_name,
                    file_path: ipc_path.display().to_string(),
                    status: IpcFileStatus::Failed,
                    md5: Some(md5),
                    error_message: Some(err_msg),
                    skipped_reason: None,
                analysis_ok: Some(false),
                merge_ok: None,
                cleaned_row_count: None,
                cleaned_total_amount: None,
                cleaned_currency: None,
                analysis_row_error_count: None,
                reconciliation_ok: None,
                boq_value_total: None,
                merge_matched_rows: None,
                merge_target_sheet: None,
                merge_period_column: None,
            });
            }
        }
        }

        // 清理历史失败合并残留的空期数列（仅含空值/0/合计公式的 IPC 列）
        align::remove_empty_period_columns(&mut master_state);
        align::refine_master_workbook_item_columns(&mut master_state);
        match align::write_master_workbook(&master_state, &master, &output_path) {
            Ok(p) => output_masters.push(p),
            Err(e) => {
                return internal_err(format!(
                    "写回母表 {} 失败: {e}",
                    output_path.display()
                ));
            }
        }
    }

    let output_master = output_masters.first().cloned();

    if let Err(e) = ledger.save(workspace) {
        return internal_err(format!("保存执行记录失败: {e}"));
    }

    if !audit_errors.is_empty() {
        let _ = std::fs::write(
            data_dir.join(format!("ipc_audit_errors_{default_period}.json")),
            serde_json::to_string_pretty(&audit_errors).unwrap_or_default(),
        );
    }

    let success_count = file_results
        .iter()
        .filter(|f| f.status == IpcFileStatus::Success)
        .count() as u32;
    let skipped_count = file_results
        .iter()
        .filter(|f| f.status == IpcFileStatus::Skipped)
        .count() as u32;
    let failed_count = file_results
        .iter()
        .filter(|f| f.status == IpcFileStatus::Failed)
        .count() as u32;

    IpcAlignmentResponse {
        ok: true,
        report: Some(IpcAlignmentReport {
            processed_at: Utc::now().to_rfc3339(),
            ipc_root_path: workspace.display().to_string(),
            master_price_path: primary_master
                .as_ref()
                .map(|p| p.display().to_string())
                .unwrap_or_default(),
            period: default_period.to_string(),
            success_count,
            skipped_count,
            failed_count,
            discovered_files,
            files: file_results,
            output_master_path: output_master
                .as_ref()
                .map(|p| p.display().to_string()),
            output_master_paths: output_masters.iter().map(|p| p.display().to_string()).collect(),
        }),
        error_code: None,
        error_message: None,
    }
}

fn workbook_role_label(role: crate::types::WorkbookFileRole) -> &'static str {
    match role {
        crate::types::WorkbookFileRole::MasterContract => "合同母表",
        crate::types::WorkbookFileRole::IpcProgress => "进度款 IPC",
        crate::types::WorkbookFileRole::BoqSource => "原始 BOQ",
        crate::types::WorkbookFileRole::Ignored => "无需处理",
    }
}

fn make_step1_report(
    workspace: &Path,
    master_price_path: Option<&Path>,
    period: &str,
    discovered_files: Vec<DiscoveredWorkbook>,
) -> IpcAlignmentReport {
    IpcAlignmentReport {
        processed_at: Utc::now().to_rfc3339(),
        ipc_root_path: workspace.display().to_string(),
        master_price_path: master_price_path
            .map(|p| p.display().to_string())
            .unwrap_or_default(),
        period: period.to_string(),
        success_count: 0,
        skipped_count: 0,
        failed_count: 0,
        discovered_files,
        files: Vec::new(),
        output_master_path: None,
        output_master_paths: Vec::new(),
    }
}

fn failure_response(
    code: ErrorCode,
    message: String,
    workspace: &Path,
    discovered_files: Vec<DiscoveredWorkbook>,
    master: Option<&Path>,
    period: Option<&str>,
) -> IpcAlignmentResponse {
    IpcAlignmentResponse {
        ok: false,
        report: Some(make_step1_report(
            workspace,
            master,
            period.unwrap_or("—"),
            discovered_files,
        )),
        error_code: Some(code),
        error_message: Some(message),
    }
}

fn invalid_args(message: String) -> IpcAlignmentResponse {
    IpcAlignmentResponse {
        ok: false,
        report: None,
        error_code: Some(ErrorCode::InvalidArgs),
        error_message: Some(message),
    }
}

fn internal_err(message: String) -> IpcAlignmentResponse {
    IpcAlignmentResponse {
        ok: false,
        report: None,
        error_code: Some(ErrorCode::InternalError),
        error_message: Some(message),
    }
}

pub fn map_license_error(err: LicenseError) -> IpcAlignmentResponse {
    IpcAlignmentResponse {
        ok: false,
        report: None,
        error_code: Some(ErrorCode::AuthExpired),
        error_message: Some(err.to_string()),
    }
}

#[cfg(test)]
mod ipc_workflow_tests {
    use std::path::PathBuf;

    use crate::types::{IpcFileStatus, WorkspaceIpcWorkflowRequest};

    use super::run_workspace_ipc_workflow;

    #[test]
    fn desktop_test_root_full_ipc_workflow_merges_sslot1() {
        use crate::ledger::ProcessLedger;

        std::env::set_var("EPC_COMMERCIAL_DEV_SKIP_LICENSE", "1");
        let ws = PathBuf::from("/Users/wangxy/Desktop/test");
        if !ws.is_dir() {
            eprintln!("skip desktop_test_root_full_ipc_workflow: fixture missing");
            return;
        }
        let data_dir = std::env::temp_dir().join(format!("epc_wf_test_{}", std::process::id()));
        let _ = std::fs::create_dir_all(&data_dir);

        let fixture_ipc: [&str; 3] = [
            "SSLOT1-IRI-SCH1-2025007(IPC007).xlsx",
            "SS-LOT1-IRI-SCH4-2025002(IPC004)(TZS).xlsx",
            "SS-LOT1-IRI-SCH4-2026001(IPC8)-TZS.xlsx",
        ];
        let mut ledger = ProcessLedger::load(&ws, &data_dir);
        ledger.entries.retain(|_, entry| {
            !fixture_ipc.iter().any(|name| entry.file_name == *name)
        });
        let _ = ledger.save(&ws);

        let resp = run_workspace_ipc_workflow(&WorkspaceIpcWorkflowRequest {
            workspace_root: ws.display().to_string(),
            period: None,
            master_price_path: None,
            data_dir: data_dir.display().to_string(),
            ignore_revisions: Some(true),
        });
        assert!(resp.ok, "workflow failed: {:?}", resp.error_message);
        let report = resp.report.expect("report");
        for name in fixture_ipc {
            let row = report
                .files
                .iter()
                .find(|f| f.file_name == name)
                .unwrap_or_else(|| panic!("missing {name} in results"));
            assert_eq!(
                row.status,
                IpcFileStatus::Success,
                "{name} merge failed: {:?}",
                row.error_message
            );
            assert_eq!(row.merge_ok, Some(true), "{name}");
        }
    }
}
