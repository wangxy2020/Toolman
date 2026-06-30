//! 大模型/用户编辑项目管理数据表后，向下游同步衍生字段与关联表（CSV → aligned → payment）。

use std::path::{Path, PathBuf};

use anyhow::{Context, Result};

use crate::data_overrides::{
    self, load_pm_revisions, path_relative_to_workspace, DataOverridesFile,
};

use super::align::{
    self, load_master_workbook, write_master_workbook, MergeRevisionContext, MasterWorkbookState,
};
use super::ipc_cleaned_cache;
use super::payment;
use super::scanner;

const DEFAULT_PERIOD: &str = "IPCX";

/// 编辑 CSV / xlsx 后触发：合并 CSV、刷新 aligned 合计、重算 payment / project 衍生列。
pub fn propagate_pm_data_after_edit(workspace: &Path, edited_file: &Path) -> Result<Vec<String>> {
    let edited = edited_file
        .canonicalize()
        .unwrap_or_else(|_| edited_file.to_path_buf());
    let overrides = data_overrides::load_data_overrides(workspace);
    let mut actions: Vec<String> = Vec::new();

    if is_payment_summary_csv(&edited, workspace) {
        let count =
            payment::sync_payment_workbook_from_payment_csv(workspace, &edited, &overrides)?;
        actions.push(format!("synced_payment_xlsx_from_csv:{count}"));
        return Ok(actions);
    }

    if is_ipc_cleaned_csv(&edited) {
        let (ipc_path, period, _schedule_hint) =
            resolve_ipc_path_for_cleaned_csv(workspace, &edited).ok_or_else(|| {
                anyhow::anyhow!(
                    "无法在同目录匹配 IPC xlsx：{}",
                    edited.display()
                )
            })?;

        let aligned = sync_from_cleaned_csv(workspace, &edited, &overrides)
            .with_context(|| format!("CSV 合并至 aligned 失败: {}", edited.display()))?;
        actions.push(format!("merged_csv_to:{}", aligned.display()));

        payment::force_sync_payment_from_aligned_workbook(
            workspace,
            &aligned,
            &period,
            &overrides,
        )
        .with_context(|| "同步 payment / project 汇总表失败")?;
        actions.push("synced_payment_from_aligned".to_string());

        let csv_payment_fields =
            ipc_cleaned_cache::extract_payment_fields_from_cleaned_csv(&edited)?;
        if payment::sync_payment_row_after_ipc_csv_edit(
            workspace,
            &ipc_path,
            &csv_payment_fields,
            &overrides,
        )? {
            actions.push("synced_payment_effective_date_from_csv".to_string());
        }
        return Ok(actions);
    }

    if is_payment_xlsx(&edited, workspace) {
        let count = payment::recalculate_payment_workbook_derivatives(workspace, &overrides)?;
        actions.push(format!("recalculated_payment_rows:{count}"));
        return Ok(actions);
    }

    if is_project_ipc_xlsx(&edited, workspace) {
        let count = payment::recalculate_project_workbook_derivatives(workspace, &overrides)?;
        actions.push(format!("recalculated_project_rows:{count}"));
        return Ok(actions);
    }

    if align::is_aligned_master_path(&edited) {
        refresh_aligned_workbook_derivatives(workspace, &edited)?;
        actions.push(format!("refreshed_aligned:{}", edited.display()));
        payment::force_sync_payment_from_aligned_workbook(
            workspace,
            &edited,
            DEFAULT_PERIOD,
            &overrides,
        )?;
        actions.push("synced_payment_from_aligned".to_string());
        return Ok(actions);
    }

    Ok(actions)
}

fn sync_from_cleaned_csv(
    workspace: &Path,
    csv_path: &Path,
    overrides: &DataOverridesFile,
) -> Result<PathBuf> {
    let (ipc_path, period, schedule_hint) =
        resolve_ipc_path_for_cleaned_csv(workspace, csv_path).ok_or_else(|| {
            anyhow::anyhow!(
                "无法在同目录匹配 IPC xlsx：{}",
                csv_path.display()
            )
        })?;

    let schedule_digit = scanner::resolve_schedule_digit_for_ipc(&ipc_path, &period);
    let analysis = ipc_cleaned_cache::load_cleaned_csv(
        csv_path,
        &schedule_hint,
        &period,
        &ipc_path,
    )?;

    let scan = scanner::scan_workspace(workspace)?;
    let master = scan
        .resolve_master_for_ipc(&ipc_path, None)
        .ok_or_else(|| anyhow::anyhow!("未找到与 IPC 对应的合同母表: {}", ipc_path.display()))?;

    let (load_path, output_path) = align::resolve_master_merge_paths(&master);
    let mut master_state = load_master_workbook(&load_path)?;
    align::refine_master_workbook_item_columns(&mut master_state);

    let pm_revisions = load_pm_revisions(workspace);
    let aligned_locks = data_overrides::aligned_cell_locks_slice(&pm_revisions);
    let output_rel = path_relative_to_workspace(workspace, &output_path);
    let revision_ctx = MergeRevisionContext {
        output_master_relative: &output_rel,
        aligned_locks,
        ignore_revisions: false,
    };

    align::apply_ipc_analysis_to_master(
        &mut master_state,
        &analysis,
        &schedule_hint,
        &period,
        schedule_digit,
        Some(&revision_ctx),
    )?;

    refresh_master_state_derivatives(workspace, &mut master_state, &output_path)?;
    align::refine_master_workbook_item_columns(&mut master_state);
    write_master_workbook(&master_state, &master, &output_path)?;
    let _ = overrides;
    Ok(output_path)
}

fn refresh_aligned_workbook_derivatives(workspace: &Path, aligned_path: &Path) -> Result<()> {
    let mut master_state = load_master_workbook(aligned_path)?;
    align::refine_master_workbook_item_columns(&mut master_state);
    refresh_master_state_derivatives(workspace, &mut master_state, aligned_path)?;
    align::refine_master_workbook_item_columns(&mut master_state);
    write_master_workbook(&master_state, aligned_path, aligned_path)?;
    Ok(())
}

fn refresh_master_state_derivatives(
    workspace: &Path,
    master_state: &mut MasterWorkbookState,
    output_path: &Path,
) -> Result<()> {
    let pm_revisions = load_pm_revisions(workspace);
    let aligned_locks = data_overrides::aligned_cell_locks_slice(&pm_revisions);
    let output_rel = path_relative_to_workspace(workspace, output_path);
    align::refresh_master_workbook_derivatives(
        master_state,
        Some((&output_rel, aligned_locks)),
    );
    Ok(())
}

fn resolve_ipc_path_for_cleaned_csv(
    workspace: &Path,
    csv_path: &Path,
) -> Option<(PathBuf, String, String)> {
    let parent = csv_path.parent()?;
    let stem = csv_path.file_stem()?.to_str()?;
    let entries = std::fs::read_dir(parent).ok()?;
    for entry in entries.filter_map(Result::ok) {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("xlsx") {
            continue;
        }
        if align::is_aligned_master_path(&path) {
            continue;
        }
        let (period, schedule_hint) =
            scanner::ipc_period_and_schedule_hint(&path, DEFAULT_PERIOD);
        let Some(expected_stem) = scanner::ipc_cleaned_csv_stem(workspace, &path, &period) else {
            continue;
        };
        if expected_stem.eq_ignore_ascii_case(stem) {
            return Some((path, period, schedule_hint));
        }
    }
    None
}

pub fn is_ipc_cleaned_csv(path: &Path) -> bool {
    let name = path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or_default()
        .to_lowercase();
    if !name.ends_with(".csv") {
        return false;
    }
    let path_lower = path.to_string_lossy().to_lowercase();
    if path_lower.contains("ipc_payment_data") {
        return false;
    }
    name.contains("sch") && name.contains("ipc")
}

fn is_payment_summary_csv(path: &Path, workspace: &Path) -> bool {
    let rel = path_relative_to_workspace(workspace, path).to_lowercase();
    rel.ends_with("ipc_payment_data/ipc_payment_data.csv")
        || rel.ends_with("ipc_payment_data.csv") && rel.contains("ipc_payment_data/")
}

fn is_payment_xlsx(path: &Path, workspace: &Path) -> bool {
    let rel = path_relative_to_workspace(workspace, path).to_lowercase();
    rel.ends_with("ipc_payment_data/ipc_payment_data.xlsx")
        || rel.ends_with("ipc_payment_data.xlsx")
}

fn is_project_ipc_xlsx(path: &Path, workspace: &Path) -> bool {
    let rel = path_relative_to_workspace(workspace, path).to_lowercase();
    rel.ends_with("ipc_payment_data/project_ipc_data.xlsx") || rel.ends_with("project_ipc_data.xlsx")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_payment_summary_csv() {
        assert!(is_payment_summary_csv(
            Path::new("/ws/IPC_Payment_data/ipc_payment_data.csv"),
            Path::new("/ws"),
        ));
        assert!(!is_payment_summary_csv(
            Path::new("/ws/folder/TAZASSLOT4SCH4IPC002.csv"),
            Path::new("/ws"),
        ));
    }

    #[test]
    fn detects_ipc_cleaned_csv_by_name() {
        assert!(is_ipc_cleaned_csv(Path::new(
            "/ws/folder/TAZASSLOT4SCH4IPC002.csv"
        )));
        assert!(!is_ipc_cleaned_csv(Path::new(
            "/ws/IPC_Payment_data/ipc_payment_data.csv"
        )));
    }
}
