use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use chrono::Utc;
use serde::{Deserialize, Serialize};

pub const LEDGER_FILE_NAME: &str = "ipc_process_log.txt";
pub const PAYMENT_LEDGER_FILE_NAME: &str = "ipc_payment_log.txt";
pub const BOQ_FORMAT_LEDGER_FILE_NAME: &str = "boq_format_process_log.txt";
pub const SHIPPING_CI_LEDGER_FILE_NAME: &str = "shipping_ci_process_log.txt";

/// 工作 2 账本「期数」列固定值
pub const SHIPPING_CI_LEDGER_PERIOD: &str = "SHIPPING_CI";
pub const PAYMENT_DATA_DIR_NAME: &str = "IPC_Payment_data";

/// 工作 1 账本「期数」列固定值（无 IPC 期号）
pub const BOQ_FORMAT_LEDGER_PERIOD: &str = "FORMAT";

const LEDGER_HEADER: &str = "# IPC 工程量清单处理记录（制表符分隔；以 # 开头的行为注释）";
const LEDGER_COLUMNS: &str = "# 列: 状态 | 文件名 | MD5 | 期数 | 处理时间(UTC) | 错误信息";
const PAYMENT_LEDGER_HEADER: &str =
    "# IPC 进度款支付处理记录（制表符分隔；以 # 开头的行为注释）";
const PAYMENT_LEDGER_COLUMNS: &str =
    "# 列: 状态 | 文件名(含Sheet) | MD5 | 期数 | 处理时间(UTC) | 错误信息";
const BOQ_FORMAT_LEDGER_HEADER: &str =
    "# 合同价格表格式化处理记录（制表符分隔；以 # 开头的行为注释）";
const BOQ_FORMAT_LEDGER_COLUMNS: &str =
    "# 列: 状态 | 文件名 | MD5 | 期数 | 处理时间(UTC) | 错误信息";
const SHIPPING_CI_LEDGER_HEADER: &str =
    "# 海运商业发票转进度款处理记录（制表符分隔；以 # 开头的行为注释）";
const SHIPPING_CI_LEDGER_COLUMNS: &str =
    "# 列: 状态 | 文件名 | MD5 | 期数 | 处理时间(UTC) | 错误信息";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "UPPERCASE")]
pub enum LedgerStatus {
    Success,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LedgerEntry {
    pub file_name: String,
    pub md5: String,
    pub status: LedgerStatus,
    pub period: Option<String>,
    pub processed_at: String,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ProcessLedger {
    pub version: u32,
    pub entries: HashMap<String, LedgerEntry>,
}

impl ProcessLedger {
    pub fn load(workspace: &Path, legacy_data_dir: &Path) -> Self {
        let path = ledger_path(workspace);
        if path.exists() {
            return Self::load_from_text(&path);
        }

        for legacy in legacy_ledger_json_paths(workspace, legacy_data_dir) {
            if !legacy.exists() {
                continue;
            }
            let ledger = Self::load_from_json(&legacy);
            if !ledger.entries.is_empty() {
                let _ = ledger.save_text(&path);
            }
            return ledger;
        }

        Self {
            version: 1,
            entries: HashMap::new(),
        }
    }

    pub fn save(&self, workspace: &Path) -> anyhow::Result<()> {
        self.save_text(&ledger_path(workspace))
    }

    /// 工作 5：从 `{工作区}/ipc_payment_log.txt` 加载（旧版位于 `IPC_Payment_data/` 下时会自动迁移）
    pub fn load_payment(workspace: &Path, _legacy_data_dir: &Path) -> Self {
        let path = payment_ledger_path(workspace);
        if path.exists() {
            return Self::load_from_text(&path);
        }
        let legacy = legacy_payment_ledger_path(workspace);
        if legacy.exists() {
            let ledger = Self::load_from_text(&legacy);
            if !ledger.entries.is_empty() {
                let _ = ledger.save_payment(workspace);
            }
            return ledger;
        }
        Self {
            version: 1,
            entries: HashMap::new(),
        }
    }

    pub fn save_payment(&self, workspace: &Path) -> anyhow::Result<()> {
        self.save_text_with_headers(
            &payment_ledger_path(workspace),
            PAYMENT_LEDGER_HEADER,
            PAYMENT_LEDGER_COLUMNS,
        )
    }

    /// 工作 1：从 `{工作区}/boq_format_process_log.txt` 加载
    pub fn load_boq_format(workspace: &Path, _legacy_data_dir: &Path) -> Self {
        let path = boq_format_ledger_path(workspace);
        if path.exists() {
            return Self::load_from_text(&path);
        }
        Self {
            version: 1,
            entries: HashMap::new(),
        }
    }

    pub fn save_boq_format(&self, workspace: &Path) -> anyhow::Result<()> {
        self.save_text_with_headers(
            &boq_format_ledger_path(workspace),
            BOQ_FORMAT_LEDGER_HEADER,
            BOQ_FORMAT_LEDGER_COLUMNS,
        )
    }

    pub fn record_success_boq_format(&mut self, file_name: &str, md5: &str) {
        self.record_success(file_name, md5, BOQ_FORMAT_LEDGER_PERIOD);
    }

    /// 工作 2：从 `{工作区}/shipping_ci_process_log.txt` 加载（不存在则写入空头文件）
    pub fn load_shipping_ci(workspace: &Path, _legacy_data_dir: &Path) -> Self {
        let path = shipping_ci_ledger_path(workspace);
        if path.exists() {
            return Self::load_from_text(&path);
        }
        let ledger = Self {
            version: 1,
            entries: HashMap::new(),
        };
        let _ = ledger.save_shipping_ci(workspace);
        ledger
    }

    pub fn save_shipping_ci(&self, workspace: &Path) -> anyhow::Result<()> {
        self.save_text_with_headers(
            &shipping_ci_ledger_path(workspace),
            SHIPPING_CI_LEDGER_HEADER,
            SHIPPING_CI_LEDGER_COLUMNS,
        )
    }

    pub fn record_success_shipping_ci(&mut self, file_name: &str, md5: &str) {
        self.record_success(file_name, md5, SHIPPING_CI_LEDGER_PERIOD);
    }

    pub fn save_text(&self, path: &Path) -> anyhow::Result<()> {
        self.save_text_with_headers(path, LEDGER_HEADER, LEDGER_COLUMNS)
    }

    pub fn save_text_with_headers(
        &self,
        path: &Path,
        header: &str,
        columns: &str,
    ) -> anyhow::Result<()> {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)?;
        }
        let mut lines = vec![header.to_string(), columns.to_string(), String::new()];
        let mut entries: Vec<_> = self.entries.values().collect();
        entries.sort_by(|a, b| {
            a.processed_at
                .cmp(&b.processed_at)
                .then_with(|| a.file_name.cmp(&b.file_name))
        });
        for entry in entries {
            lines.push(entry.to_text_line());
        }
        fs::write(path, lines.join("\n"))?;
        Ok(())
    }

    fn load_from_text(path: &Path) -> Self {
        let raw = fs::read_to_string(path).unwrap_or_default();
        let mut ledger = Self {
            version: 1,
            entries: HashMap::new(),
        };
        for line in raw.lines() {
            if let Some(entry) = LedgerEntry::from_text_line(line) {
                let key = Self::entry_key(&entry.file_name, &entry.md5);
                ledger.entries.insert(key, entry);
            }
        }
        ledger
    }

    fn load_from_json(path: &Path) -> Self {
        let raw = fs::read_to_string(path).unwrap_or_default();
        serde_json::from_str(&raw).unwrap_or_default()
    }

    /// 账本键：文件名 + MD5，避免同名不同内容重复处理
    pub fn entry_key(file_name: &str, md5: &str) -> String {
        format!("{file_name}::{md5}")
    }

    pub fn should_skip(&self, file_name: &str, md5: &str) -> Option<&LedgerEntry> {
        let key = Self::entry_key(file_name, md5);
        self.entries.get(&key)
    }

    /// 仅 SUCCESS 视为已完成，FAILED 记录可再次进入待处理队列
    pub fn is_marked_success(&self, file_name: &str, md5: &str) -> bool {
        self.should_skip(file_name, md5)
            .is_some_and(|e| e.status == LedgerStatus::Success)
    }

    /// 按文件名查找最近一条执行记录（用于步骤 1 穿透匹配展示）
    pub fn find_by_file_name(&self, file_name: &str) -> Option<&LedgerEntry> {
        self.entries
            .values()
            .filter(|e| e.file_name == file_name)
            .max_by_key(|e| e.processed_at.as_str())
    }

    pub fn record_success(&mut self, file_name: &str, md5: &str, period: &str) {
        let key = Self::entry_key(file_name, md5);
        self.entries.insert(
            key,
            LedgerEntry {
                file_name: file_name.to_string(),
                md5: md5.to_string(),
                status: LedgerStatus::Success,
                period: Some(period.to_string()),
                processed_at: Utc::now().to_rfc3339(),
                error_message: None,
            },
        );
    }

    pub fn record_failed(&mut self, file_name: &str, md5: &str, error: &str) {
        let key = Self::entry_key(file_name, md5);
        self.entries.insert(
            key,
            LedgerEntry {
                file_name: file_name.to_string(),
                md5: md5.to_string(),
                status: LedgerStatus::Failed,
                period: None,
                processed_at: Utc::now().to_rfc3339(),
                error_message: Some(error.to_string()),
            },
        );
    }
}

impl LedgerEntry {
    fn escape_field(value: &str) -> String {
        value.replace('\t', " ").replace('\n', " ").replace('\r', "")
    }

    pub fn to_text_line(&self) -> String {
        let status = match self.status {
            LedgerStatus::Success => "SUCCESS",
            LedgerStatus::Failed => "FAILED",
        };
        format!(
            "{}\t{}\t{}\t{}\t{}\t{}",
            status,
            Self::escape_field(&self.file_name),
            Self::escape_field(&self.md5),
            Self::escape_field(self.period.as_deref().unwrap_or("")),
            Self::escape_field(&self.processed_at),
            Self::escape_field(self.error_message.as_deref().unwrap_or(""))
        )
    }

    pub fn from_text_line(line: &str) -> Option<Self> {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            return None;
        }
        let parts: Vec<&str> = line.split('\t').collect();
        if parts.len() < 5 {
            return None;
        }
        let status = match parts[0] {
            "SUCCESS" => LedgerStatus::Success,
            "FAILED" => LedgerStatus::Failed,
            _ => return None,
        };
        let period = parts[3].trim();
        Some(LedgerEntry {
            file_name: parts[1].to_string(),
            md5: parts[2].to_string(),
            status,
            period: if period.is_empty() {
                None
            } else {
                Some(period.to_string())
            },
            processed_at: parts[4].to_string(),
            error_message: parts.get(5).map(|s| s.to_string()).filter(|s| !s.is_empty()),
        })
    }
}

/// 执行记录保存在工作区根目录，便于查看与手工清理
pub fn ledger_path(workspace: &Path) -> PathBuf {
    workspace.join(LEDGER_FILE_NAME)
}

/// 工作 5 执行记录：`{工作区}/ipc_payment_log.txt`（与 ipc_process_log、boq_format_process_log 同级）
pub fn payment_ledger_path(workspace: &Path) -> PathBuf {
    workspace.join(PAYMENT_LEDGER_FILE_NAME)
}

/// 旧版工作 5 账本路径（v1.8.2 之前）
pub fn legacy_payment_ledger_path(workspace: &Path) -> PathBuf {
    workspace
        .join(PAYMENT_DATA_DIR_NAME)
        .join(PAYMENT_LEDGER_FILE_NAME)
}

pub fn payment_data_root(workspace: &Path) -> PathBuf {
    workspace.join(PAYMENT_DATA_DIR_NAME)
}

/// 工作 1 执行记录：`{工作区}/boq_format_process_log.txt`
pub fn boq_format_ledger_path(workspace: &Path) -> PathBuf {
    workspace.join(BOQ_FORMAT_LEDGER_FILE_NAME)
}

/// 工作 2 执行记录：`{工作区}/shipping_ci_process_log.txt`
pub fn shipping_ci_ledger_path(workspace: &Path) -> PathBuf {
    workspace.join(SHIPPING_CI_LEDGER_FILE_NAME)
}

fn legacy_ledger_json_paths(workspace: &Path, legacy_data_dir: &Path) -> Vec<PathBuf> {
    vec![
        workspace.join("ipc_process_log.json"),
        legacy_data_dir.join("ipc_process_log.json"),
    ]
}

pub fn license_path(data_dir: &Path) -> std::path::PathBuf {
    data_dir.join("license.key")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_dir() -> PathBuf {
        let n = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("epc-ledger-test-{n}"))
    }

    #[test]
    fn text_roundtrip_and_success_only_mark() {
        let dir = temp_dir();
        fs::create_dir_all(&dir).unwrap();
        let mut ledger = ProcessLedger::default();
        ledger.record_failed("a.xlsx", "md5fail", "err");
        ledger.record_success("b.xlsx", "md5ok", "IPC4");
        ledger.save_text(&ledger_path(&dir)).unwrap();

        let loaded = ProcessLedger::load(&dir, &dir);
        assert!(!loaded.is_marked_success("a.xlsx", "md5fail"));
        assert!(loaded.is_marked_success("b.xlsx", "md5ok"));

        let raw = fs::read_to_string(ledger_path(&dir)).unwrap();
        assert!(raw.contains("SUCCESS"));
        assert!(raw.contains("FAILED"));
        assert!(raw.starts_with('#'));

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn boq_format_ledger_saved_at_workspace_root() {
        let dir = temp_dir();
        fs::create_dir_all(&dir).unwrap();
        let mut ledger = ProcessLedger::default();
        ledger.record_failed("a.xlsx", "md5a", "err");
        ledger.record_success_boq_format("b.xlsx", "md5b");
        ledger.save_boq_format(&dir).unwrap();

        let path = boq_format_ledger_path(&dir);
        assert!(path.is_file());
        let raw = fs::read_to_string(&path).unwrap();
        assert!(raw.contains("合同价格表格式化"));
        assert!(raw.contains("FORMAT"));

        let loaded = ProcessLedger::load_boq_format(&dir, &dir);
        assert!(!loaded.is_marked_success("a.xlsx", "md5a"));
        assert!(loaded.is_marked_success("b.xlsx", "md5b"));

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn payment_ledger_saved_at_workspace_root() {
        let dir = temp_dir();
        fs::create_dir_all(&dir).unwrap();
        let mut ledger = ProcessLedger::default();
        ledger.record_success("SSLOT1-IRI-BOQ_aligned.xlsx|Schedule1", "md5a", "IPC4");
        ledger.save_payment(&dir).unwrap();

        let path = payment_ledger_path(&dir);
        assert!(path.is_file());
        assert!(!path.to_string_lossy().contains("IPC_Payment_data"));
        let raw = fs::read_to_string(&path).unwrap();
        assert!(raw.contains("进度款支付"));
        assert!(raw.contains("Schedule1"));

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn payment_ledger_migrates_from_legacy_ipc_payment_data_dir() {
        let dir = temp_dir();
        let legacy_dir = dir.join(PAYMENT_DATA_DIR_NAME);
        fs::create_dir_all(&legacy_dir).unwrap();
        let mut ledger = ProcessLedger::default();
        ledger.record_success("aligned.xlsx|Schedule1", "md5legacy", "IPC4");
        ledger
            .save_text_with_headers(
                &legacy_payment_ledger_path(&dir),
                PAYMENT_LEDGER_HEADER,
                PAYMENT_LEDGER_COLUMNS,
            )
            .unwrap();

        let loaded = ProcessLedger::load_payment(&dir, &dir);
        assert!(loaded.is_marked_success("aligned.xlsx|Schedule1", "md5legacy"));
        assert!(payment_ledger_path(&dir).is_file());

        let _ = fs::remove_dir_all(dir);
    }

    #[test]
    fn shipping_ci_ledger_initialized_on_first_load() {
        let dir = temp_dir();
        fs::create_dir_all(&dir).unwrap();
        let path = shipping_ci_ledger_path(&dir);
        assert!(!path.exists());

        let loaded = ProcessLedger::load_shipping_ci(&dir, &dir);
        assert!(path.is_file());
        assert_eq!(loaded.entries.len(), 0);
        let raw = fs::read_to_string(&path).unwrap();
        assert!(raw.contains("海运商业发票"));

        let _ = fs::remove_dir_all(dir);
    }
}
