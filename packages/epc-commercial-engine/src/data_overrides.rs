use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use chrono::Utc;
use serde::{Deserialize, Serialize};

use crate::ledger::payment_data_root;

pub const PM_REVISIONS_RELATIVE: &str = ".cherry-studio/project-management/revisions.json";
pub const LEGACY_DATA_OVERRIDES_FILE: &str = "data_overrides.json";

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PaymentRowMatch {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub substation_lot: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub schedule: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ipc_no: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaymentDataPatch {
    #[serde(rename = "match")]
    pub match_keys: PaymentRowMatch,
    /// 与 payment 表行主键一致，用于精确锁定单行（非整列）
    #[serde(skip_serializing_if = "Option::is_none")]
    pub row_key: Option<String>,
    pub values: HashMap<String, String>,
    #[serde(default)]
    pub lock: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AlignedCellLock {
    pub relative_path: String,
    pub sheet: String,
    pub row: u32,
    pub col: u32,
    pub value: String,
    #[serde(default = "default_lock_true")]
    pub lock: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub at: Option<String>,
}

fn default_lock_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProgressPlanPatch {
    pub record_key: String,
    pub values: HashMap<String, String>,
    #[serde(default)]
    pub lock: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub note: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CostEpcPaymentDomain {
    #[serde(default)]
    pub patches: Vec<PaymentDataPatch>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CostEpcAlignedDomain {
    #[serde(default, rename = "cellLocks")]
    pub cell_locks: Vec<AlignedCellLock>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProgressPlanDomain {
    #[serde(default)]
    pub patches: Vec<ProgressPlanPatch>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct RevisionDomains {
    #[serde(default)]
    pub cost_epc_payment: CostEpcPaymentDomain,
    #[serde(default)]
    pub cost_epc_aligned: CostEpcAlignedDomain,
    #[serde(default)]
    pub progress_plan: ProgressPlanDomain,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PmRevisionsFile {
    #[serde(default = "default_version")]
    pub version: u32,
    #[serde(default)]
    pub domains: RevisionDomains,
}

fn default_version() -> u32 {
    1
}

impl Default for PmRevisionsFile {
    fn default() -> Self {
        Self {
            version: 1,
            domains: RevisionDomains::default(),
        }
    }
}

/// 兼容工作 5：仅暴露 payment_patches
#[derive(Debug, Clone, Default)]
pub struct DataOverridesFile {
    pub payment_patches: Vec<PaymentDataPatch>,
}

pub fn pm_revisions_path(workspace: &Path) -> PathBuf {
    workspace.join(PM_REVISIONS_RELATIVE)
}

pub fn legacy_overrides_path(workspace: &Path) -> PathBuf {
    payment_data_root(workspace).join(LEGACY_DATA_OVERRIDES_FILE)
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacyOverridesFile {
    #[serde(default)]
    payment_patches: Vec<PaymentDataPatch>,
}

pub fn path_relative_to_workspace(workspace: &Path, file: &Path) -> String {
    let workspace = workspace
        .canonicalize()
        .unwrap_or_else(|_| workspace.to_path_buf());
    let file = file.canonicalize().unwrap_or_else(|_| file.to_path_buf());
    if let Ok(rel) = file.strip_prefix(&workspace) {
        return rel.to_string_lossy().replace('\\', "/");
    }
    file.to_string_lossy().replace('\\', "/")
}

pub fn load_pm_revisions(workspace: &Path) -> PmRevisionsFile {
    let path = pm_revisions_path(workspace);
    if path.exists() {
        let raw = fs::read_to_string(&path).unwrap_or_default();
        if let Ok(mut file) = serde_json::from_str::<PmRevisionsFile>(&raw) {
            if file.version == 0 {
                file.version = 1;
            }
            return file;
        }
    }

    let legacy = legacy_overrides_path(workspace);
    if legacy.exists() {
        let raw = fs::read_to_string(&legacy).unwrap_or_default();
        if let Ok(legacy_file) = serde_json::from_str::<LegacyOverridesFile>(&raw) {
            let mut file = PmRevisionsFile::default();
            file.domains.cost_epc_payment.patches = legacy_file.payment_patches;
            let _ = save_pm_revisions(workspace, &file);
            return file;
        }
    }

    PmRevisionsFile::default()
}

pub fn save_pm_revisions(workspace: &Path, file: &PmRevisionsFile) -> Result<()> {
    let path = pm_revisions_path(workspace);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let body = serde_json::to_string_pretty(file).context("serialize pm revisions")?;
    fs::write(path, body)?;
    Ok(())
}

pub fn load_data_overrides(workspace: &Path) -> DataOverridesFile {
    let rev = load_pm_revisions(workspace);
    DataOverridesFile {
        payment_patches: rev.domains.cost_epc_payment.patches,
    }
}

pub fn payment_patches_slice(revisions: &PmRevisionsFile) -> &[PaymentDataPatch] {
    &revisions.domains.cost_epc_payment.patches
}

pub fn aligned_cell_locks_slice(revisions: &PmRevisionsFile) -> &[AlignedCellLock] {
    &revisions.domains.cost_epc_aligned.cell_locks
}

/// 记录单行 payment 字段修订（不触发全表 apply，避免误覆盖其他行）
pub fn record_payment_row_field_revision(
    workspace: &Path,
    row_key: &str,
    match_keys: PaymentRowMatch,
    field: &str,
    value: &str,
) -> Result<()> {
    let mut file = load_pm_revisions(workspace);
    merge_payment_patch_into(
        &mut file.domains.cost_epc_payment.patches,
        PaymentDataPatch {
            match_keys,
            row_key: Some(row_key.to_string()),
            values: HashMap::from([(field.to_string(), value.to_string())]),
            lock: vec![field.to_string()],
            source: Some("llm".to_string()),
            note: None,
            at: Some(Utc::now().to_rfc3339()),
        },
    );
    save_pm_revisions(workspace, &file)
}

pub fn append_payment_patch(workspace: &Path, mut patch: PaymentDataPatch) -> Result<PmRevisionsFile> {
    if patch.at.is_none() {
        patch.at = Some(Utc::now().to_rfc3339());
    }
    let mut file = load_pm_revisions(workspace);
    merge_payment_patch_into(&mut file.domains.cost_epc_payment.patches, patch);
    save_pm_revisions(workspace, &file)?;
    Ok(file)
}

fn merge_payment_patch_into(patches: &mut Vec<PaymentDataPatch>, patch: PaymentDataPatch) {
    for existing in patches.iter_mut() {
        if payment_patch_same_row(existing, &patch) {
  for (k, v) in &patch.values {
                existing.values.insert(k.clone(), v.clone());
            }
            for field in &patch.lock {
                if !existing.lock.contains(field) {
                    existing.lock.push(field.clone());
                }
            }
            if existing.source.is_none() {
                existing.source = patch.source.clone();
            }
            if existing.note.is_none() {
                existing.note = patch.note.clone();
            }
            return;
        }
    }
    patches.push(patch);
}

pub fn append_aligned_cell_locks(workspace: &Path, locks: Vec<AlignedCellLock>) -> Result<()> {
    if locks.is_empty() {
        return Ok(());
    }
    let mut file = load_pm_revisions(workspace);
    for lock in locks {
        merge_aligned_lock(&mut file.domains.cost_epc_aligned.cell_locks, lock);
    }
    save_pm_revisions(workspace, &file)
}

fn merge_aligned_lock(cell_locks: &mut Vec<AlignedCellLock>, lock: AlignedCellLock) {
    let rel = normalize_rel_path(&lock.relative_path);
    if let Some(existing) = cell_locks.iter_mut().find(|c| {
        normalize_rel_path(&c.relative_path) == rel
            && c.sheet == lock.sheet
            && c.row == lock.row
            && c.col == lock.col
    }) {
        existing.value = lock.value;
        existing.lock = lock.lock;
        existing.source = lock.source.or_else(|| existing.source.clone());
        existing.at = lock.at.or_else(|| existing.at.clone());
    } else {
        cell_locks.push(AlignedCellLock {
            relative_path: rel,
            ..lock
        });
    }
}

fn normalize_rel_path(p: &str) -> String {
    p.replace('\\', "/").trim_start_matches("./").to_lowercase()
}

fn normalize_schedule(s: &str) -> String {
    let digits: String = s.chars().filter(|c| c.is_ascii_digit()).collect();
    if digits.is_empty() {
        s.trim().to_lowercase()
    } else {
        digits
    }
}

fn normalize_ipc(s: &str) -> String {
    let upper = s.trim().to_uppercase();
    if let Some(rest) = upper.strip_prefix("IPC") {
        let digits: String = rest.chars().filter(|c| c.is_ascii_digit()).collect();
        if let Ok(n) = digits.parse::<u32>() {
            return format!("IPC{n}");
        }
    }
    upper
}

fn match_field(row_value: Option<&String>, expected: Option<&String>, normalizer: fn(&str) -> String) -> bool {
    let Some(exp) = expected else {
        return true;
    };
    let exp_trim = exp.trim();
    if exp_trim.is_empty() {
        return true;
    }
    let Some(rv) = row_value else {
        return false;
    };
    normalizer(rv) == normalizer(exp_trim)
}

fn payment_row_matches_keys(a: &PaymentRowMatch, b: &PaymentRowMatch) -> bool {
    payment_row_matches_strict_map(a, b)
}

/// 与 ipc_payment_data.xlsx 行主键格式一致
pub fn payment_row_key_from_values(values: &HashMap<String, String>) -> String {
    format!(
        "{}|{}|{}|{}",
        values.get("project_id").map(|s| s.as_str()).unwrap_or(""),
        values.get("substation_lot").map(|s| s.as_str()).unwrap_or(""),
        values.get("schedule").map(|s| s.as_str()).unwrap_or(""),
        values.get("ipc_no").map(|s| s.as_str()).unwrap_or("")
    )
}

fn payment_patch_same_row(a: &PaymentDataPatch, b: &PaymentDataPatch) -> bool {
    if let (Some(ka), Some(kb)) = (a.row_key.as_ref(), b.row_key.as_ref()) {
        return ka == kb;
    }
    payment_row_matches_strict_map(&a.match_keys, &b.match_keys)
}

fn payment_row_matches_strict_map(a: &PaymentRowMatch, b: &PaymentRowMatch) -> bool {
    strict_match_field(a.project_id.as_ref(), b.project_id.as_ref(), |s| s.trim().to_uppercase())
        && strict_match_field(
            a.substation_lot.as_ref(),
            b.substation_lot.as_ref(),
            |s| s.trim().to_uppercase(),
        )
        && strict_match_field(a.schedule.as_ref(), b.schedule.as_ref(), normalize_schedule)
        && strict_match_field(a.ipc_no.as_ref(), b.ipc_no.as_ref(), normalize_ipc)
}

fn strict_match_field(
    left: Option<&String>,
    right: Option<&String>,
    normalizer: fn(&str) -> String,
) -> bool {
    let Some(l) = left else {
        return true;
    };
    if l.trim().is_empty() {
        return true;
    }
    let Some(r) = right else {
        return false;
    };
    if r.trim().is_empty() {
        return false;
    }
    normalizer(l) == normalizer(r)
}

pub fn payment_row_matches(row_values: &HashMap<String, String>, m: &PaymentRowMatch) -> bool {
    payment_row_matches_strict(row_values, m)
}

/// 仅当 patch 中写明的非空 match 字段均与行一致时命中（空字段不作通配）
pub fn payment_row_matches_strict(row_values: &HashMap<String, String>, m: &PaymentRowMatch) -> bool {
    strict_match_field(
        m.project_id.as_ref(),
        row_values.get("project_id"),
        |s| s.trim().to_uppercase(),
    ) && strict_match_field(
        m.substation_lot.as_ref(),
        row_values.get("substation_lot"),
        |s| s.trim().to_uppercase(),
    ) && strict_match_field(m.schedule.as_ref(), row_values.get("schedule"), normalize_schedule)
        && strict_match_field(m.ipc_no.as_ref(), row_values.get("ipc_no"), normalize_ipc)
}

pub fn patch_applies_to_row(
    patch: &PaymentDataPatch,
    row_key: &str,
    row_values: &HashMap<String, String>,
) -> bool {
    if let Some(k) = patch.row_key.as_ref() {
        return k == row_key;
    }
    payment_row_matches_strict(row_values, &patch.match_keys)
}

pub fn locked_fields_for_row(
    overrides: &DataOverridesFile,
    row_key: &str,
    row_values: &HashMap<String, String>,
) -> HashMap<String, String> {
    let mut out = HashMap::new();
    for patch in &overrides.payment_patches {
        if !patch_applies_to_row(patch, row_key, row_values) {
            continue;
        }
        for field in &patch.lock {
            if let Some(v) = patch.values.get(field) {
                out.insert(field.clone(), v.clone());
            }
        }
        for (k, v) in &patch.values {
            if patch.lock.contains(k) {
                continue;
            }
            if let Some(existing) = row_values.get(k) {
                if !existing.trim().is_empty() {
                    continue;
                }
            }
            out.insert(k.clone(), v.clone());
        }
    }
    out
}

pub fn is_field_locked(
    overrides: &DataOverridesFile,
    row_key: &str,
    row_values: &HashMap<String, String>,
    field: &str,
) -> bool {
    overrides.payment_patches.iter().any(|p| {
        patch_applies_to_row(p, row_key, row_values) && p.lock.iter().any(|f| f == field)
    })
}

pub fn is_aligned_cell_locked(
    locks: &[AlignedCellLock],
    relative_path: &str,
    sheet: &str,
    row: usize,
    col: usize,
) -> bool {
    let rel = normalize_rel_path(relative_path);
    locks.iter().any(|c| {
        c.lock
            && normalize_rel_path(&c.relative_path) == rel
            && c.sheet == sheet
            && c.row as usize == row
            && c.col as usize == col
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn locked_effective_date_survives_engine_upsert_logic() {
        let values = HashMap::from([
            ("project_id".to_string(), "SSLOT1-IRI".to_string()),
            ("schedule".to_string(), "1".to_string()),
            ("ipc_no".to_string(), "IPC7".to_string()),
            ("effective_date".to_string(), "2026-05-30".to_string()),
        ]);
        let overrides = DataOverridesFile {
            payment_patches: vec![PaymentDataPatch {
                match_keys: PaymentRowMatch {
                    project_id: Some("SSLOT1-IRI".to_string()),
                    schedule: Some("1".to_string()),
                    ipc_no: Some("IPC007".to_string()),
                    substation_lot: None,
                },
                row_key: None,
                values: HashMap::from([("effective_date".to_string(), "2026-05-30".to_string())]),
                lock: vec!["effective_date".to_string()],
                source: Some("user".to_string()),
                note: None,
                at: None,
            }],
        };
        let row_key = payment_row_key_from_values(&values);
        assert!(is_field_locked(&overrides, &row_key, &values, "effective_date"));
        assert!(payment_row_matches_strict(&values, &overrides.payment_patches[0].match_keys));
    }

    #[test]
    fn period_lock_on_one_row_does_not_lock_other_rows() {
        let row_a = HashMap::from([
            ("project_id".to_string(), "P1".to_string()),
            ("substation_lot".to_string(), "LOT".to_string()),
            ("schedule".to_string(), "Schedule1".to_string()),
            ("ipc_no".to_string(), "IPC1".to_string()),
            ("period".to_string(), "50".to_string()),
        ]);
        let row_b = HashMap::from([
            ("project_id".to_string(), "P1".to_string()),
            ("substation_lot".to_string(), "LOT".to_string()),
            ("schedule".to_string(), "Schedule1".to_string()),
            ("ipc_no".to_string(), "IPC2".to_string()),
            ("period".to_string(), "90".to_string()),
        ]);
        let overrides = DataOverridesFile {
            payment_patches: vec![PaymentDataPatch {
                match_keys: PaymentRowMatch {
                    project_id: Some("P1".to_string()),
                    substation_lot: Some("LOT".to_string()),
                    schedule: Some("Schedule1".to_string()),
                    ipc_no: Some("IPC1".to_string()),
                },
                row_key: Some("P1|LOT|Schedule1|IPC1".to_string()),
                values: HashMap::from([("period".to_string(), "50".to_string())]),
                lock: vec!["period".to_string()],
                source: Some("llm".to_string()),
                note: None,
                at: None,
            }],
        };
        let key_a = payment_row_key_from_values(&row_a);
        let key_b = payment_row_key_from_values(&row_b);
        assert!(is_field_locked(&overrides, &key_a, &row_a, "period"));
        assert!(!is_field_locked(&overrides, &key_b, &row_b, "period"));
    }

    #[test]
    fn aligned_cell_lock_matches_normalized_path() {
        let locks = vec![AlignedCellLock {
            relative_path: "BOQ_master_aligned.xlsx".to_string(),
            sheet: "Schedule1".to_string(),
            row: 10,
            col: 5,
            value: "100".to_string(),
            lock: true,
            source: Some("llm".to_string()),
            at: None,
        }];
        assert!(is_aligned_cell_locked(
            &locks,
            "./BOQ_master_aligned.xlsx",
            "Schedule1",
            10,
            5
        ));
        assert!(!is_aligned_cell_locked(&locks, "BOQ_master_aligned.xlsx", "Schedule1", 11, 5));
    }
}
