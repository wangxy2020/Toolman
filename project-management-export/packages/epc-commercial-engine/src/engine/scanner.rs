use std::collections::HashMap;
use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use anyhow::{Context, Result};
use regex::Regex;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use walkdir::WalkDir;

use crate::engine::align;
use crate::ledger::ProcessLedger;
use crate::types::{DiscoveredFileQueue, DiscoveredWorkbook, WorkbookFileRole};

/// 深度优先收集所有 xlsx（跳过临时文件 ~$）
pub fn collect_xlsx_files(root: &Path) -> Result<Vec<PathBuf>> {
    let mut files = Vec::new();
    for entry in WalkDir::new(root).follow_links(false) {
        let entry = entry?;
        if !entry.file_type().is_file() {
            continue;
        }
        let path = entry.path();
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or_default();
        if name.starts_with("~$") {
            continue;
        }
        if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
            if ext.eq_ignore_ascii_case("xlsx") {
                files.push(path.to_path_buf());
            }
        }
    }
    files.sort();
    Ok(files)
}

pub fn file_md5(path: &Path) -> Result<String> {
    let mut file = File::open(path).with_context(|| format!("打开文件 {}", path.display()))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 8192];
    loop {
        let n = file.read(&mut buffer)?;
        if n == 0 {
            break;
        }
        hasher.update(&buffer[..n]);
    }
    Ok(hex::encode(hasher.finalize()))
}

/// 从 IPC 文件名提取期数，如 IPC4、ipc_04、IPC007（保留数字原文，含前导零）
pub fn extract_ipc_period(path: &Path) -> Option<String> {
    let name = path.file_stem()?.to_str()?;
    extract_ipc_period_from_name(name)
}

/// 从任意名称字符串提取 IPC 期数（不经 `Path::file_stem`，
/// 文件夹名含 '.' 时也能识别，如 "7.SCH 1-2025004(IPC7)-USD-…" → IPC7）
pub fn extract_ipc_period_from_name(name: &str) -> Option<String> {
    let caps = ipc_period_re().captures(name)?;
    let digits = caps.get(1)?.as_str();
    Some(format!("IPC{digits}"))
}

/// 穿透工作区子文件夹，对每个 xlsx 判定角色
pub fn scan_workspace(workspace_root: &Path) -> Result<WorkspaceScan> {
    let files = collect_xlsx_files(workspace_root)?;
    let entries = files
        .iter()
        .map(|path| classify_workbook(path, workspace_root))
        .collect();
    Ok(WorkspaceScan {
        workspace_root: workspace_root.to_path_buf(),
        entries,
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClassifiedWorkbook {
    pub file_name: String,
    pub file_path: String,
    pub relative_path: String,
    pub folder_path: String,
    pub role: WorkbookFileRole,
    pub role_reason: String,
}

#[derive(Debug, Clone)]
pub struct WorkspaceScan {
    pub workspace_root: PathBuf,
    pub entries: Vec<ClassifiedWorkbook>,
}

impl WorkspaceScan {
    pub fn pick_master_contract(&self) -> Option<PathBuf> {
        self.entries
            .iter()
            .filter(|e| e.role == WorkbookFileRole::MasterContract)
            .max_by_key(|e| score_master_candidate(Path::new(&e.file_path)))
            .map(|e| PathBuf::from(&e.file_path))
    }

    /// 在与 IPC 文件同项目目录（向上最多 5 层）中查找合同母表，避免多 LOT 工作区误选其他标段 BOQ。
    pub fn resolve_master_for_ipc(
        &self,
        ipc_path: &Path,
        explicit: Option<&str>,
    ) -> Option<PathBuf> {
        if let Some(path) = explicit {
            let p = Path::new(path);
            if p.is_file() {
                return Some(p.to_path_buf());
            }
        }

        let ipc_canon = ipc_path
            .canonicalize()
            .unwrap_or_else(|_| ipc_path.to_path_buf());

        let mut dir = ipc_canon.parent();
        for _ in 0..5 {
            let Some(d) = dir else {
                break;
            };
            let mut local_masters: Vec<(PathBuf, i32)> = self
                .entries
                .iter()
                .filter(|e| e.role == WorkbookFileRole::MasterContract)
                .filter_map(|e| {
                    let path = PathBuf::from(&e.file_path);
                    let canon = path.canonicalize().unwrap_or(path);
                    if canon.parent() == Some(d) {
                        let score = score_master_candidate(&canon);
                        Some((canon, score))
                    } else {
                        None
                    }
                })
                .collect();
            if !local_masters.is_empty() {
                local_masters.sort_by_key(|(_, score)| *score);
                return local_masters.pop().map(|(path, _)| path);
            }
            dir = d.parent();
        }

        self.pick_master_contract()
    }

    /// 从工作区已识别文件中推断主导 IPC 期数（如母表文件名中的 IPC007）
    pub fn infer_workspace_period(&self) -> Option<String> {
        let paths: Vec<PathBuf> = self
            .entries
            .iter()
            .map(|e| PathBuf::from(&e.file_path))
            .collect();
        infer_ipc_period_from_files(&paths)
    }

    /// 步骤 1：结合执行记录生成识别清单，并返回本回合待处理的 IPC 路径
    pub fn build_discovered_and_pending_ipc(
        &self,
        ledger: &ProcessLedger,
        workflow_period: Option<&str>,
    ) -> Result<(Vec<DiscoveredWorkbook>, Vec<PathBuf>)> {
        let mut discovered = Vec::new();
        let mut pending_ipc = Vec::new();
        let workspace_period = self.infer_workspace_period();
        let workflow_period = workflow_period
            .map(|p| p.trim().to_string())
            .filter(|p| !p.is_empty());

        for entry in &self.entries {
            let path = PathBuf::from(&entry.file_path);
            let project_name = extract_project_name(&path, &self.workspace_root);
            let file_period = extract_ipc_period(&path);
            let period_code = file_period
                .clone()
                .or(workflow_period.clone())
                .or(workspace_period.clone());

            let md5 = file_md5(&path).ok();
            let ledger_entry_exact = md5
                .as_deref()
                .and_then(|hash| ledger.should_skip(&entry.file_name, hash));
            let ledger_entry_any = ledger_entry_exact
                .or_else(|| ledger.find_by_file_name(&entry.file_name));

            let ledger_success = ledger_entry_exact
                .map(|e| e.status == crate::ledger::LedgerStatus::Success)
                .unwrap_or(false);
            let ledger_processed_at = ledger_entry_any.map(|e| e.processed_at.clone());

            let aligned_missing = entry.role == WorkbookFileRole::IpcProgress
                && ledger_success
                && ipc_needs_aligned_rebuild(self, &path, ledger);

            let effective_ledger_success = ledger_success && !aligned_missing;
            let mut role_reason = entry.role_reason.clone();
            if aligned_missing {
                role_reason = format_aligned_missing_ipc_reason(self, &path, ledger);
            }

            let queue = assign_discovered_queue(
                entry.role,
                effective_ledger_success,
                project_name.as_deref(),
                file_period.as_deref(),
            );

            // 步骤 2+：须含 IPC 期号；未 SUCCESS，或账本 SUCCESS 但 aligned 母表已删除
            if entry.role == WorkbookFileRole::IpcProgress
                && file_period.is_some()
                && (!ledger_success || aligned_missing)
            {
                pending_ipc.push(path);
            }

            discovered.push(DiscoveredWorkbook {
                file_name: entry.file_name.clone(),
                file_path: entry.file_path.clone(),
                relative_path: entry.relative_path.clone(),
                folder_path: entry.folder_path.clone(),
                role: entry.role,
                role_reason,
                project_name,
                period_code,
                queue,
                in_ledger: ledger_success,
                ledger_processed_at,
            });
        }

        append_missing_aligned_discovered_rows(self, ledger, &mut discovered);

        sort_discovered_files(&mut discovered);
        pending_ipc.sort();
        pending_ipc.dedup();
        Ok((discovered, pending_ipc))
    }
}

fn assign_discovered_queue(
    role: WorkbookFileRole,
    in_ledger: bool,
    project_name: Option<&str>,
    period_code: Option<&str>,
) -> DiscoveredFileQueue {
    if role == WorkbookFileRole::MasterContract {
        return DiscoveredFileQueue::MasterContract;
    }
    if in_ledger {
        return DiscoveredFileQueue::AlreadyProcessed;
    }
    if role == WorkbookFileRole::IpcProgress {
        let has_project = project_name.map(|s| !s.is_empty()).unwrap_or(false);
        let has_period = period_code.map(|s| !s.is_empty()).unwrap_or(false);
        if has_project && has_period {
            return DiscoveredFileQueue::PendingProcess;
        }
        return DiscoveredFileQueue::NotRequired;
    }
    DiscoveredFileQueue::NotRequired
}

fn queue_sort_key(queue: DiscoveredFileQueue) -> u8 {
    match queue {
        DiscoveredFileQueue::MasterContract => 0,
        DiscoveredFileQueue::PendingProcess => 1,
        DiscoveredFileQueue::NotRequired => 2,
        DiscoveredFileQueue::AlreadyProcessed => 3,
    }
}

fn sort_discovered_files(files: &mut [DiscoveredWorkbook]) {
    files.sort_by(|a, b| {
        queue_sort_key(a.queue)
            .cmp(&queue_sort_key(b.queue))
            .then_with(|| a.folder_path.cmp(&b.folder_path))
            .then_with(|| a.file_name.cmp(&b.file_name))
    });
}

fn ipc_needs_aligned_rebuild(
    scan: &WorkspaceScan,
    ipc_path: &Path,
    ledger: &ProcessLedger,
) -> bool {
    let Some(master) = scan.resolve_master_for_ipc(ipc_path, None) else {
        return false;
    };
    if align::aligned_master_available(&master) {
        return false;
    }
    let file_name = ipc_path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or_default();
    let Ok(md5) = file_md5(ipc_path) else {
        return false;
    };
    ledger.is_marked_success(file_name, &md5)
}

fn format_aligned_missing_ipc_reason(
    scan: &WorkspaceScan,
    ipc_path: &Path,
    ledger: &ProcessLedger,
) -> String {
    let Some(master) = scan.resolve_master_for_ipc(ipc_path, None) else {
        return "ipc_process_log 已 SUCCESS，但合并母表文件已删除，需重新执行步骤 2–4".to_string();
    };
    let aligned = align::canonical_aligned_master_path(&master);
    let aligned_name = aligned
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("aligned.xlsx");
    let contract_name = master
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("合同母表");
    let at = ipc_path
        .file_name()
        .and_then(|n| n.to_str())
        .and_then(|n| ledger.find_by_file_name(n))
        .map(|e| e.processed_at.as_str())
        .unwrap_or("—");
    format!(
        "ipc_process_log 已 SUCCESS（{at}），但合并母表「{aligned_name}」已不存在（合同母表「{contract_name}」），将重新生成 aligned 并合并"
    )
}

fn append_missing_aligned_discovered_rows(
    scan: &WorkspaceScan,
    ledger: &ProcessLedger,
    discovered: &mut Vec<DiscoveredWorkbook>,
) {
    use std::collections::HashMap;

    let mut by_master: HashMap<PathBuf, (PathBuf, u32)> = HashMap::new();
    for entry in &scan.entries {
        if entry.role != WorkbookFileRole::IpcProgress {
            continue;
        }
        let ipc_path = PathBuf::from(&entry.file_path);
        let Some(master) = scan.resolve_master_for_ipc(&ipc_path, None) else {
            continue;
        };
        if align::aligned_master_available(&master) {
            continue;
        }
        let Ok(md5) = file_md5(&ipc_path) else {
            continue;
        };
        if !ledger.is_marked_success(&entry.file_name, &md5) {
            continue;
        }
        by_master
            .entry(master.clone())
            .and_modify(|(_, count)| *count += 1)
            .or_insert_with(|| (align::canonical_aligned_master_path(&master), 1));
    }

    for (master, (aligned_path, success_count)) in by_master {
        let aligned_name = aligned_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("aligned.xlsx")
            .to_string();
        let contract_name = master
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("合同母表")
            .to_string();
        let folder_path = aligned_path
            .parent()
            .and_then(|p| p.strip_prefix(&scan.workspace_root).ok())
            .map(|p| {
                let s = p.display().to_string();
                if s.is_empty() {
                    ".".to_string()
                } else {
                    s
                }
            })
            .unwrap_or_else(|| ".".to_string());
        let relative_path = aligned_path
            .strip_prefix(&scan.workspace_root)
            .unwrap_or(&aligned_path)
            .display()
            .to_string();

        discovered.push(DiscoveredWorkbook {
            file_name: aligned_name.clone(),
            file_path: aligned_path.display().to_string(),
            relative_path,
            folder_path,
            role: WorkbookFileRole::Ignored,
            role_reason: format!(
                "合并母表文件缺失（ipc_process_log 中 {success_count} 个 IPC 为 SUCCESS）；重新运行将从「{contract_name}」生成「{aligned_name}」"
            ),
            project_name: extract_project_name(&master, &scan.workspace_root),
            period_code: None,
            queue: DiscoveredFileQueue::PendingProcess,
            in_ledger: false,
            ledger_processed_at: None,
        });
    }
}

/// 从文件名或所在子文件夹推断项目名称（如 TAZASSLOT1-Iringa-BOQ → TAZASSLOT1）
pub fn extract_project_name(path: &Path, workspace_root: &Path) -> Option<String> {
    if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
        if let Some(caps) = project_prefix_re().captures(stem) {
            return caps.get(1).map(|m| m.as_str().to_uppercase());
        }
    }

    path.strip_prefix(workspace_root)
        .ok()
        .and_then(|rel| {
            let first = rel.components().find_map(|c| match c {
                std::path::Component::Normal(s) => s.to_str(),
                _ => None,
            })?;
            if first == "." || first.is_empty() {
                return None;
            }
            let caps = project_prefix_re().captures(first)?;
            caps.get(1).map(|m| m.as_str().to_uppercase())
        })
}

pub fn classify_workbook(path: &Path, workspace_root: &Path) -> ClassifiedWorkbook {
    let file_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown.xlsx")
        .to_string();
    let relative_path = path
        .strip_prefix(workspace_root)
        .unwrap_or(path)
        .display()
        .to_string();
    let folder_path = path
        .parent()
        .and_then(|p| p.strip_prefix(workspace_root).ok())
        .map(|p| {
            let s = p.display().to_string();
            if s.is_empty() {
                ".".to_string()
            } else {
                s
            }
        })
        .unwrap_or_else(|| ".".to_string());

    let (role, role_reason) = detect_workbook_role(path);

    ClassifiedWorkbook {
        file_name,
        file_path: path.display().to_string(),
        relative_path,
        folder_path,
        role,
        role_reason,
    }
}

/// 根据文件名与路径推断：合同母表 / 进度款 IPC / 原始 BOQ / 无需处理
pub fn detect_workbook_role(path: &Path) -> (WorkbookFileRole, String) {
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or_default()
        .to_lowercase();

    if is_ignored_noise(&name) {
        return (
            WorkbookFileRole::Ignored,
            "匹配排除规则（备份/副本/临时/草稿等），不参与对账".to_string(),
        );
    }

    if align::is_aligned_master_path(path) {
        return (
            WorkbookFileRole::Ignored,
            "进度款工程量数据统计合并输出母表（*_aligned.xlsx），不作为合同母表选用".to_string(),
        );
    }

    if is_work1_formatted_boq_output(path) {
        return (
            WorkbookFileRole::MasterContract,
            "工作 1 格式化合同价格表（与 *_original.xlsx 配对，作为合同母表生成 BOQ_aligned）".to_string(),
        );
    }

    if is_work1_boq_original_source_name(&name) {
        return (
            WorkbookFileRole::Ignored,
            "工作 1 原始合同价格表（文件名含 original，如 *_original.xlsx），工作 4 不处理".to_string(),
        );
    }

    if is_master_contract_candidate(&name, path) {
        return (
            WorkbookFileRole::MasterContract,
            master_contract_reason(&name),
        );
    }

    if is_ipc_progress_declaration(&name, path) {
        let period = extract_ipc_period(path).unwrap_or_default();
        return (
            WorkbookFileRole::IpcProgress,
            format!(
                "IPC 工程量清单（含项目编号、SCH/Schedule 与 {period}，可含日期）"
            ),
        );
    }

    if extract_ipc_period(path).is_some() {
        return (
            WorkbookFileRole::Ignored,
            "文件名含 IPC 期号但缺少 SCH/Schedule 分项标识，无需处理".to_string(),
        );
    }

    if is_raw_boq_source(&name) {
        return (
            WorkbookFileRole::BoqSource,
            "分包/文件夹内原始 BOQ（非合同母表，且未含 IPC 期号）".to_string(),
        );
    }

    (
        WorkbookFileRole::Ignored,
        "文件名未含 IPC 期号（如 IPC4、IPC007），无需处理".to_string(),
    )
}

/// 工作 1 格式化结果：与 `*_original.xlsx` 同目录配对（如 `SSLOT1-IRI-BOQ.xlsx` + `SSLOT1-IRI-BOQ_original.xlsx`）
pub fn is_work1_formatted_boq_output(path: &Path) -> bool {
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or_default()
        .to_lowercase();
    if !name.ends_with(".xlsx") && !name.ends_with(".xls") {
        return false;
    }
    if name.ends_with("_original.xlsx") || name.ends_with("_original.xls") {
        return false;
    }
    if align::is_aligned_master_path(path) {
        return false;
    }
    let stem = path.file_stem().and_then(|s| s.to_str()).unwrap_or_default();
    let parent = path.parent().unwrap_or_else(|| Path::new("."));
    parent.join(format!("{stem}_original.xlsx")).is_file()
}

/// 工作 1 原始合同价格表（工作 4 须跳过）：`*_original.xlsx`、`SSLOT4 BOQ_original.xlsx`、`xx-BOQ-original.xlsx` 等
pub fn is_work1_boq_original_source_name(name: &str) -> bool {
    let lower = name.to_lowercase();
    if lower.ends_with("_original.xlsx")
        || lower.ends_with("_original.xls")
        || lower.ends_with("-original.xlsx")
        || lower.ends_with("-original.xls")
    {
        return true;
    }
    let stem = lower
        .strip_suffix(".xlsx")
        .or_else(|| lower.strip_suffix(".xls"));
    let Some(stem) = stem else {
        return false;
    };
    stem.ends_with("_original")
        || stem.ends_with("-original")
        || stem.contains("-original-")
}

fn is_ignored_noise(name: &str) -> bool {
    const KEYWORDS: &[&str] = &[
        "backup",
        "bak",
        "copy",
        "副本",
        "复制",
        "temp",
        "tmp",
        "draft",
        "草稿",
        "old",
        "archive",
        "无用",
        "test",
        "sample",
        "示例",
    ];
    KEYWORDS.iter().any(|k| name.contains(k))
}

/// 合同母表：含 BOQ/价格表等，文件名不含 IPC 期号（工作簿内通常含 Schedule1–4 等多分表）
fn is_master_contract_candidate(name: &str, path: &Path) -> bool {
    if align::is_aligned_master_path(path) {
        return false;
    }
    if is_work1_boq_original_source_name(name) {
        return false;
    }
    if is_ipc_progress_declaration(name, path) {
        return false;
    }
    if extract_ipc_period(path).is_some() {
        return false;
    }
    if name.ends_with("-boq.xlsx") {
        return true;
    }
    name.contains("boq")
        || name.contains("价格表")
        || name.contains("价格")
        || name.contains("pricelist")
        || name.contains("price list")
        || (name.contains("price") && !name.contains("ipc"))
        || name.contains("contract")
        || name.contains("合同")
        || name.contains("母表")
}

fn master_contract_reason(name: &str) -> String {
    if name.ends_with("-boq.xlsx") {
        "合同母表（BOQ/价格汇总，文件名无 IPC 期号，工作簿含 Schedule 多分表）".to_string()
    } else {
        "合同母表（含 BOQ/价格表等字段，无 IPC 期号）".to_string()
    }
}

/// IPC 申报：须含 IPCx，且含 SCH 或 Schedule 分项（常含项目编号、日期）
fn is_ipc_progress_declaration(name: &str, path: &Path) -> bool {
    if extract_ipc_period(path).is_none() {
        return false;
    }
    is_sch_ipc_progress_declaration(name) || has_sch_or_schedule_in_name(name)
}

fn has_sch_or_schedule_in_name(name: &str) -> bool {
    sch_schedule_re().is_match(name) || schedule_token_in_filename_re().is_match(name)
}

fn is_raw_boq_source(name: &str) -> bool {
    (name.contains("boq") || name.contains("工程量"))
        && !name.contains("价格表")
        && !name.contains("price list")
}

/// 在工作区中查找最可能的合同母表 xlsx（优先扫描分类结果）
pub fn find_master_workbook(root: &Path) -> Option<PathBuf> {
    if let Ok(scan) = scan_workspace(root) {
        if let Some(path) = scan.pick_master_contract() {
            return Some(path);
        }
    }
    let files = collect_xlsx_files(root).ok()?;
    files
        .iter()
        .map(|path| (path.clone(), score_master_candidate(path)))
        .max_by_key(|(_, score)| *score)
        .map(|(path, _)| path)
}

pub fn score_master_candidate(path: &Path) -> i32 {
    if is_work1_formatted_boq_output(path) {
        return 9;
    }
    let (role, _) = detect_workbook_role(path);
    match role {
        WorkbookFileRole::MasterContract => 10,
        WorkbookFileRole::IpcProgress => 2,
        WorkbookFileRole::BoqSource => 1,
        WorkbookFileRole::Ignored => 0,
    }
}

/// 从 IPC 文件名推断主导期数
pub fn infer_ipc_period_from_files(files: &[PathBuf]) -> Option<String> {
    let mut counts: HashMap<String, u32> = HashMap::new();
    for path in files {
        if let Some(period) = extract_ipc_period(path) {
            *counts.entry(period).or_default() += 1;
        }
    }
    counts
        .into_iter()
        .max_by_key(|(_, count)| *count)
        .map(|(period, _)| period)
}

/// 兼容旧逻辑：排除母表
pub fn filter_ipc_files(all_files: Vec<PathBuf>, master: &Path) -> Vec<PathBuf> {
    let master_key = master
        .canonicalize()
        .unwrap_or_else(|_| master.to_path_buf());
    all_files
        .into_iter()
        .filter(|p| {
            let canonical = p.canonicalize().unwrap_or_else(|_| p.clone());
            canonical != master_key && p != master
        })
        .collect()
}

/// 期数映射到 Schedule 工作表名（模糊：Schedule4 / SCHEDULE 4）
pub fn schedule_name_from_period(period: &str) -> String {
    if let Some(digit) = ipc_period_number(period) {
        return format!("Schedule{digit}");
    }
    period.to_string()
}

/// 从 IPC 文件名中的 SCH 分项解析母表 Schedule 序号（IPC 期号 ≠ Schedule 号）
pub fn extract_sch_schedule_number(path: &Path) -> Option<u8> {
    let name = path.file_stem()?.to_str()?;
    let caps = sch_number_capture_re().captures(name)?;
    let digit: u8 = caps.get(1)?.as_str().parse().ok()?;
    if (1..=4).contains(&digit) {
        Some(digit)
    } else {
        None
    }
}

/// 写入母表时优先用 SCH 分项，其次才用期数列名
pub fn resolve_schedule_digit_for_ipc(path: &Path, period: &str) -> Option<u8> {
    extract_sch_schedule_number(path).or_else(|| ipc_period_number(period))
}

fn project_id_token_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?i)(tazasslot\d+)").unwrap())
}

fn generic_slot_project_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?i)^((?:tazas)?s?slot)(\d+)$").unwrap())
}

fn lot_folder_project_id_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?i)lot\s*(\d+)").unwrap())
}

pub fn project_id_from_token_text(text: &str) -> Option<String> {
    if let Some(caps) = project_id_token_re().captures(text) {
        return Some(caps.get(1).unwrap().as_str().to_uppercase());
    }
    if let Some(caps) = generic_slot_project_re().captures(text.trim()) {
        let prefix = caps.get(1).unwrap().as_str().to_uppercase();
        let n = caps.get(2).unwrap().as_str();
        return Some(format!("{prefix}{n}"));
    }
    if let Some(caps) = lot_folder_project_id_re().captures(text) {
        let n = caps.get(1).unwrap().as_str();
        return Some(format!("TAZASSLOT{n}"));
    }
    None
}

/// 清洗 CSV 用 project_id：优先路径中的 TAZASSLOTn / LOT n，再退回通用文件名/文件夹推断
pub fn extract_project_id_for_cleaned_csv(workspace_root: &Path, ipc_path: &Path) -> Option<String> {
    let workspace_root = workspace_root
        .canonicalize()
        .unwrap_or_else(|_| workspace_root.to_path_buf());
    let ipc_path = ipc_path
        .canonicalize()
        .unwrap_or_else(|_| ipc_path.to_path_buf());

    if let Ok(rel) = ipc_path.strip_prefix(&workspace_root) {
        for comp in rel.components() {
            if let std::path::Component::Normal(s) = comp {
                if let Some(id) = project_id_from_token_text(s.to_str()?) {
                    return Some(id);
                }
            }
        }
    }
    if let Some(stem) = ipc_path.file_stem().and_then(|s| s.to_str()) {
        if let Some(id) = project_id_from_token_text(stem) {
            return Some(id);
        }
    }
    extract_project_name(&ipc_path, &workspace_root)
}

/// IPC 期数列名 + Schedule 提示（步骤 2 清洗 / CSV 缓存共用）
pub fn ipc_period_and_schedule_hint(ipc_path: &Path, default_period: &str) -> (String, String) {
    let period = extract_ipc_period(ipc_path).unwrap_or_else(|| default_period.to_string());
    let schedule_digit = resolve_schedule_digit_for_ipc(ipc_path, &period);
    let schedule_hint = schedule_digit
        .map(|d| format!("Schedule{d}"))
        .unwrap_or_else(|| schedule_name_from_period(&period));
    (period, schedule_hint)
}

/// 步骤 2 清洗 CSV 文件名（无扩展名）：`{project_id}SCH{分项号}{IPC期号}`，如 `TAZASSLOT4SCH4IPC002`
pub fn ipc_cleaned_csv_stem(workspace_root: &Path, ipc_path: &Path, period: &str) -> Option<String> {
    let project_id = extract_project_id_for_cleaned_csv(workspace_root, ipc_path)?;
    let sch_digit = resolve_schedule_digit_for_ipc(ipc_path, period)?;
    let ipc_code = extract_ipc_period(ipc_path)?;
    if project_id.is_empty() {
        return None;
    }
    Some(format!("{project_id}SCH{sch_digit}{ipc_code}"))
}

pub fn ipc_period_number(period: &str) -> Option<u8> {
    let caps = ipc_period_re().captures(period)?;
    let raw = caps.get(1)?.as_str();
    let trimmed = raw.trim_start_matches('0');
    let core = if trimmed.is_empty() { "0" } else { trimmed };
    let digit: u8 = core.parse().ok()?;
    if (1..=4).contains(&digit) {
        Some(digit)
    } else {
        None
    }
}

fn sch_number_capture_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?i)sch\s*[\s_-]*(\d+)").unwrap())
}

fn ipc_period_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?i)ipc\s*_?\s*(\d+)").unwrap())
}

/// 括号内 IPC 期号，如 (IPC007-Iringa)
fn ipc_parenthetical_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?i)\(\s*ipc\s*0*(\d+)").unwrap())
}

/// SCH 分项 + 括号 IPC 期号 → 进度款申报（非母表）
fn is_sch_ipc_progress_declaration(name: &str) -> bool {
    sch_schedule_re().is_match(name) && ipc_parenthetical_re().is_match(name)
}

fn schedule_token_in_filename_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?i)schedule(?:\s|_|-)*\d+").unwrap())
}

fn sch_schedule_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?i)sch\s*[\s_-]*\d").unwrap())
}

fn project_prefix_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"^([A-Za-z][A-Za-z0-9]*)").unwrap())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn classify_name(file_name: &str) -> WorkbookFileRole {
        let path = Path::new(file_name);
        detect_workbook_role(path).0
    }

    #[test]
    fn classifies_aligned_output_as_ignored_not_master() {
        assert_eq!(
            classify_name("SSLOT1-IRI-BOQ_aligned.xlsx"),
            WorkbookFileRole::Ignored
        );
        assert_eq!(
            classify_name("TAZASSLOT1-Iringa-BOQ.xlsx"),
            WorkbookFileRole::MasterContract
        );
    }

    #[test]
    fn classifies_work1_original_sources_as_ignored_for_work4() {
        for name in [
            "SSLOT1-IRI-BOQ_original.xlsx",
            "SSLOT4 BOQ_original.xlsx",
            "TAZASSLOT1-Iringa-BOQ-original.xlsx",
            "SSLOT1-BOQ_original.xls",
        ] {
            assert_eq!(
                classify_name(name),
                WorkbookFileRole::Ignored,
                "expected Ignored: {name}"
            );
            assert!(
                is_work1_boq_original_source_name(name),
                "is_work1_boq_original_source_name: {name}"
            );
        }
        assert_eq!(
            classify_name("SSLOT1-IRI-BOQ.xlsx"),
            WorkbookFileRole::MasterContract
        );
    }

    #[test]
    fn classifies_work1_formatted_output_when_original_sibling_exists() {
        let dir = std::env::temp_dir().join(format!(
            "epc_work1_pair_{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let original = dir.join("SSLOT1-IRI-BOQ_original.xlsx");
        let formatted = dir.join("SSLOT1-IRI-BOQ.xlsx");
        std::fs::write(&original, b"o").unwrap();
        std::fs::write(&formatted, b"f").unwrap();
        assert!(is_work1_formatted_boq_output(&formatted));
        assert!(!is_work1_formatted_boq_output(&original));
        assert_eq!(detect_workbook_role(&formatted).0, WorkbookFileRole::MasterContract);
    }

    #[test]
    fn classifies_boq_ipc_and_master_from_user_samples() {
        assert_eq!(
            classify_name("TAZASSLOT1-Iringa-BOQ.xlsx"),
            WorkbookFileRole::MasterContract
        );
        assert_eq!(
            classify_name("TAZASSLOT1-IRINGA-IPC.xlsx"),
            WorkbookFileRole::Ignored
        );
        assert_eq!(
            classify_name("TAZASSLOT1-IRI-SCH 1-2025007(IPC007-Iringa).xlsx"),
            WorkbookFileRole::IpcProgress
        );
    }

    #[test]
    fn assigns_pending_when_ledger_failed_not_success() {
        let queue = assign_discovered_queue(
            WorkbookFileRole::IpcProgress,
            false,
            Some("TAZASSLOT1"),
            Some("IPC007"),
        );
        assert_eq!(queue, DiscoveredFileQueue::PendingProcess);
    }

    #[test]
    fn assigns_already_processed_only_when_ledger_success() {
        let queue = assign_discovered_queue(
            WorkbookFileRole::IpcProgress,
            true,
            Some("TAZASSLOT1"),
            Some("IPC007"),
        );
        assert_eq!(queue, DiscoveredFileQueue::AlreadyProcessed);
    }

    #[test]
    fn ipc_by_master_groups_sslot1_ipc_to_sslot1_boq() {
        use std::collections::HashMap;
        use std::path::Path;

        use crate::ledger::ProcessLedger;

        let ws = Path::new("/Users/wangxy/Desktop/test");
        if !ws.is_dir() {
            eprintln!("skip ipc_by_master test: fixture missing");
            return;
        }
        let scan = scan_workspace(ws).expect("scan");
        let ledger = ProcessLedger::load(ws, &std::env::temp_dir());
        let (_, ipc_files) = scan
            .build_discovered_and_pending_ipc(&ledger, None)
            .expect("pending ipc");
        let mut ipc_by_master: HashMap<std::path::PathBuf, Vec<std::path::PathBuf>> =
            HashMap::new();
        for ipc_path in ipc_files {
            let master = scan
                .resolve_master_for_ipc(&ipc_path, None)
                .expect("resolve master");
            let ipc_name = ipc_path
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("?");
            let master_name = master
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("?");
            eprintln!("{ipc_name} -> {master_name}");
            ipc_by_master.entry(master).or_default().push(ipc_path);
        }
        for (master, group) in &ipc_by_master {
            let master_name = master
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("?");
            for ipc in group {
                let ipc_name = ipc.file_name().and_then(|s| s.to_str()).unwrap_or("?");
                if ipc_name.contains("SSLOT1-IRI") || ipc_name.contains("LOT1-IRI") {
                    assert!(
                        master_name.contains("SSLOT1-IRI-BOQ"),
                        "SSLOT1 IPC {ipc_name} mapped to wrong master {master_name}"
                    );
                }
            }
        }
    }

    #[test]
    fn resolve_master_for_sslot1_ipc007_in_multi_lot_workspace() {
        let ws = Path::new("/Users/wangxy/Desktop/test");
        let ipc = ws.join(
            "SSLOT1/SSLOT1-Iringa/SCH1-IPC7/SSLOT1-IRI-SCH1-2025007(IPC007).xlsx",
        );
        if !ipc.is_file() {
            eprintln!("skip resolve_master_for_sslot1_ipc007: fixture missing");
            return;
        }
        let scan = scan_workspace(ws).expect("scan workspace");
        let master = scan
            .resolve_master_for_ipc(&ipc, None)
            .expect("resolve master for IPC007");
        let name = master
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or_default();
        assert!(
            name.contains("SSLOT1-IRI-BOQ"),
            "expected SSLOT1 contract BOQ, got {}",
            master.display()
        );
    }

    #[test]
    fn resolves_work1_formatted_boq_as_master_for_ipc() {
        let dir = std::env::temp_dir().join(format!(
            "epc_work1_master_resolve_{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let original = dir.join("SSLOT1-IRI-BOQ_original.xlsx");
        let formatted = dir.join("SSLOT1-IRI-BOQ.xlsx");
        let ipc = dir.join("TAZASSLOT1-IRI-SCH 1-2025007(IPC007-Iringa).xlsx");
        std::fs::write(&original, b"o").unwrap();
        std::fs::write(&formatted, b"f").unwrap();
        std::fs::write(&ipc, b"ipc").unwrap();

        let scan = scan_workspace(&dir).unwrap();
        let master = scan
            .resolve_master_for_ipc(&ipc, None)
            .expect("work1 formatted BOQ should be contract master");
        assert_eq!(
            master.file_name(),
            formatted.file_name(),
            "expected work1 formatted BOQ as contract master"
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn step1_requeues_ipc_when_ledger_success_but_aligned_deleted() {
        let dir = std::env::temp_dir().join(format!(
            "epc_step1_aligned_missing_{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();

        let master = dir.join("SSLOT1-IRI-BOQ.xlsx");
        let ipc = dir.join("TAZASSLOT1-IRI-SCH 1-2025007(IPC007-Iringa).xlsx");
        std::fs::write(&master, b"pk").unwrap();
        std::fs::write(&ipc, b"ipc").unwrap();

        let md5 = file_md5(&ipc).unwrap();
        let mut ledger = ProcessLedger::default();
        ledger.record_success(
            ipc.file_name().unwrap().to_str().unwrap(),
            &md5,
            "IPC007",
        );

        let scan = scan_workspace(&dir).unwrap();
        let (discovered, pending) = scan
            .build_discovered_and_pending_ipc(&ledger, None)
            .unwrap();

        assert!(pending.iter().any(|p| p == &ipc));
        let ipc_row = discovered
            .iter()
            .find(|d| d.file_name == "TAZASSLOT1-IRI-SCH 1-2025007(IPC007-Iringa).xlsx")
            .expect("ipc row");
        assert_eq!(ipc_row.queue, DiscoveredFileQueue::PendingProcess);
        assert!(ipc_row.role_reason.contains("aligned"));
        assert!(
            discovered
                .iter()
                .any(|d| d.file_name == "SSLOT1-IRI-BOQ_aligned.xlsx"
                    && d.queue == DiscoveredFileQueue::PendingProcess)
        );

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn assigns_pending_when_not_in_ledger_with_project_and_period() {
        let queue = assign_discovered_queue(
            WorkbookFileRole::IpcProgress,
            false,
            Some("TAZASSLOT1"),
            Some("IPC007"),
        );
        assert_eq!(queue, DiscoveredFileQueue::PendingProcess);
    }

    #[test]
    fn assigns_not_required_when_missing_period() {
        let queue = assign_discovered_queue(
            WorkbookFileRole::IpcProgress,
            false,
            Some("TAZASSLOT1"),
            None,
        );
        assert_eq!(queue, DiscoveredFileQueue::NotRequired);
    }

    #[test]
    fn classifies_noise_as_ignored() {
        assert_eq!(
            classify_name("汇总_backup_copy.xlsx"),
            WorkbookFileRole::Ignored
        );
    }

    #[test]
    fn extracts_project_name_from_samples() {
        let root = Path::new("/workspace");
        assert_eq!(
            extract_project_name(Path::new("/workspace/TAZASSLOT1-Iringa-BOQ.xlsx"), root),
            Some("TAZASSLOT1".to_string())
        );
    }

    #[test]
    fn project_id_from_lot_in_filename_when_no_tazasslot_folder() {
        let root = Path::new("/workspace");
        let ipc = Path::new("/workspace/TBEA-TAZASS-LOT 4-TDM-SCH 4-2025002 (IPC002).xlsx");
        assert_eq!(
            extract_project_id_for_cleaned_csv(root, ipc).as_deref(),
            Some("TAZASSLOT4")
        );
        assert_eq!(
            ipc_cleaned_csv_stem(root, ipc, "IPC002").as_deref(),
            Some("TAZASSLOT4SCH4IPC002")
        );
    }

    #[test]
    fn ipc_cleaned_csv_stem_from_sample_filename() {
        let root = Path::new("/workspace");
        let ipc = Path::new(
            "/workspace/TAZASSLOT4/TBEA-TAZASS-LOT 4-TDM-SCH 4-2025002 (IPC002).xlsx",
        );
        assert_eq!(
            ipc_cleaned_csv_stem(root, ipc, "IPC002").as_deref(),
            Some("TAZASSLOT4SCH4IPC002")
        );
    }

    #[test]
    fn extract_sch_schedule_number_from_filename() {
        assert_eq!(
            extract_sch_schedule_number(Path::new(
                "TBEA-TAZASS-LOT 4-TDM-SCH 4-2025002 (IPC002).xlsx"
            )),
            Some(4)
        );
        assert_eq!(
            extract_sch_schedule_number(Path::new(
                "TAZASSLOT1-IRI-SCH 1-2025007(IPC007-Iringa).xlsx"
            )),
            Some(1)
        );
        assert_eq!(resolve_schedule_digit_for_ipc(
            Path::new("TBEA-TAZASS-LOT 4-TDM-SCH 4-2025002 (IPC002).xlsx"),
            "IPC002"
        ), Some(4));
    }

    #[test]
    fn extracts_ipc_period_from_variants() {
        assert_eq!(
            extract_ipc_period(Path::new("TAZASSLOT1-IRINGA-IPC.xlsx")),
            None
        );
        assert_eq!(
            extract_ipc_period(Path::new("foo_IPC4_bar.xlsx")),
            Some("IPC4".to_string())
        );
        assert_eq!(
            extract_ipc_period(Path::new("TAZASSLOT1-IRI-SCH 1-2025007(IPC007-Iringa).xlsx")),
            Some("IPC007".to_string())
        );
    }

    #[test]
    fn ipc_stub_maps_to_not_required_queue() {
        let queue = assign_discovered_queue(
            WorkbookFileRole::Ignored,
            false,
            Some("TAZASSLOT1"),
            None,
        );
        assert_eq!(queue, DiscoveredFileQueue::NotRequired);
    }

    #[test]
    fn ipc_without_period_is_ignored() {
        assert_eq!(
            classify_name("TAZASSLOT1-IRINGA-IPC.xlsx"),
            WorkbookFileRole::Ignored
        );
    }

    #[test]
    fn ipc_with_period_but_no_sch_is_ignored() {
        assert_eq!(
            classify_name("TAZASSLOT1-IPC007-only.xlsx"),
            WorkbookFileRole::Ignored
        );
    }
}
