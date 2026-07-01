//! 步骤 2 清洗结果 CSV：与 IPC xlsx 同目录，仅表头 + 数据行（便于人工核对与后续入库）。

use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use anyhow::{Context, Result};

use super::align::{analyze_ipc_workbook, CleanedIpcRow, IpcSheetAnalysis};
use super::scanner;

pub const CSV_HEADER: &str =
    "item,description,unit,unit_price,contract_total_qty,previous_qty,current_qty,end_total_qty,current_total_price";

/// `{IPC 所在目录}/{project_id}SCH{n}{IPCxxx}.csv`
pub fn cleaned_csv_path(
    workspace_root: &Path,
    ipc_path: &Path,
    period_column: &str,
) -> Result<PathBuf> {
    let stem = scanner::ipc_cleaned_csv_stem(workspace_root, ipc_path, period_column).ok_or_else(|| {
        anyhow::anyhow!(
            "无法生成清洗 CSV 文件名（需 project_id、SCH 分项与 IPC 期号）：{}",
            ipc_path.display()
        )
    })?;
    let parent = ipc_path
        .parent()
        .ok_or_else(|| anyhow::anyhow!("IPC 文件无父目录: {}", ipc_path.display()))?;
    Ok(parent.join(format!("{stem}.csv")))
}

/// 同目录无 CSV 或 IPC 已更新时从 xlsx 清洗并写入纯数据 CSV。
pub fn ensure_cleaned_csv(
    workspace: &Path,
    ipc_path: &Path,
    schedule_hint: &str,
    period_column: &str,
    force_reclean: bool,
) -> Result<PathBuf> {
    let csv_path = cleaned_csv_path(workspace, ipc_path, period_column)?;
    if !force_reclean && csv_path.is_file() && !csv_cache_is_stale(ipc_path, &csv_path) {
        if load_cleaned_csv(&csv_path, schedule_hint, period_column, ipc_path).is_ok() {
            return Ok(csv_path);
        }
    }

    let analysis = analyze_ipc_workbook(ipc_path, schedule_hint, period_column)?;
    save_cleaned_csv(&csv_path, &analysis)
        .with_context(|| format!("写入清洗 CSV {}", csv_path.display()))?;
    Ok(csv_path)
}

/// 工作区内所有 IPC 工程量清单：缺 CSV 则生成（含账本已 SUCCESS、本次不合并的文件）。
pub fn ensure_cleaned_csv_for_all_ipc_progress(
    workspace: &Path,
    discovered: &[crate::types::DiscoveredWorkbook],
    default_period: &str,
) -> Vec<(String, String)> {
    let mut failures = Vec::new();
    for entry in discovered {
        if entry.role != crate::types::WorkbookFileRole::IpcProgress {
            continue;
        }
        let ipc_path = Path::new(&entry.file_path);
        let (period, schedule_hint) =
            scanner::ipc_period_and_schedule_hint(ipc_path, default_period);
        if let Err(e) = ensure_cleaned_csv(workspace, ipc_path, &schedule_hint, &period, false) {
            failures.push((entry.file_name.clone(), e.to_string()));
        }
    }
    failures
}

/// 读取步骤 2 清洗结果（必要时先 `ensure_cleaned_csv`）。
pub fn load_or_analyze_ipc_workbook(
    workspace: &Path,
    ipc_path: &Path,
    _file_md5: &str,
    schedule_hint: &str,
    period_column: &str,
    force_reclean: bool,
) -> Result<IpcSheetAnalysis> {
    let csv_path =
        ensure_cleaned_csv(workspace, ipc_path, schedule_hint, period_column, force_reclean)?;
    load_cleaned_csv(&csv_path, schedule_hint, period_column, ipc_path)
}

/// 写入纯 CSV：首行表头 + 数据行（无 `#` 元数据行）。
pub fn save_cleaned_csv(csv_path: &Path, analysis: &IpcSheetAnalysis) -> Result<()> {
    if let Some(parent) = csv_path.parent() {
        fs::create_dir_all(parent)?;
    }

    let mut lines = vec![CSV_HEADER.to_string()];
    for row in &analysis.rows {
        lines.push(format_cleaned_row_csv(row));
    }

    let mut file = File::create(csv_path)?;
    for line in lines {
        writeln!(file, "{line}")?;
    }
    Ok(())
}

/// 从 CSV 加载；兼容旧版带 `#` 注释头的文件（读取时跳过，下次保存会写成纯表）。
pub fn load_cleaned_csv(
    csv_path: &Path,
    schedule_hint: &str,
    _period_column: &str,
    ipc_path: &Path,
) -> Result<IpcSheetAnalysis> {
    let raw = fs::read_to_string(csv_path)
        .with_context(|| format!("读取清洗 CSV {}", csv_path.display()))?;

    let mut rows: Vec<CleanedIpcRow> = Vec::new();
    let mut passed_header = false;

    for line in raw.lines() {
        let line = normalize_line(line);
        if line.is_empty() {
            continue;
        }
        if line.starts_with('#') {
            continue;
        }
        if !passed_header {
            if is_header_line(&line) {
                passed_header = true;
            }
            continue;
        }
        rows.push(parse_cleaned_row_csv(&line)?);
    }

    if !passed_header {
        anyhow::bail!("清洗 CSV 缺少表头行: {}", csv_path.display());
    }
    if rows.is_empty() {
        anyhow::bail!("清洗 CSV 无数据行: {}", csv_path.display());
    }

    let total_current_amount: f64 = rows.iter().map(|r| r.current_total).sum();
    Ok(IpcSheetAnalysis {
        sheet_name: schedule_hint.to_string(),
        rows,
        total_current_amount,
        currency: infer_currency_from_ipc_path(ipc_path),
        row_validation_error_count: 0,
        boq_value_total: None,
    })
}

/// 仅当 CSV 为旧版带 `#` 注释头时，认为需要重新从 xlsx 清洗。
/// （避免已处理记录因修改时间不同而被额外重洗。）
fn csv_cache_is_stale(_ipc_path: &Path, csv_path: &Path) -> bool {
    csv_starts_with_legacy_comment_header(csv_path).unwrap_or(true)
}

fn csv_starts_with_legacy_comment_header(csv_path: &Path) -> Result<bool> {
    let mut file = File::open(csv_path)?;
    let mut buf = [0u8; 1];
    let n = file.read(&mut buf)?;
    Ok(n > 0 && buf[0] == b'#')
}

fn normalize_line(line: &str) -> String {
    line.trim_start_matches('\u{feff}').trim_end_matches('\r').trim().to_string()
}

/// 旧版 CSV 使用 "previous" 列名，新版改为 "previous_qty"；两者均视为合法表头行。
const CSV_HEADER_LEGACY: &str =
    "item,description,unit,unit_price,contract_total_qty,previous,current_qty,end_total_qty,current_total_price";

fn is_header_line(line: &str) -> bool {
    let n = normalize_line(line);
    n.eq_ignore_ascii_case(CSV_HEADER) || n.eq_ignore_ascii_case(CSV_HEADER_LEGACY)
}

fn infer_currency_from_ipc_path(ipc_path: &Path) -> String {
    let name = ipc_path
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or_default()
        .to_uppercase();
    for code in ["TZS", "USD", "EUR", "CNY", "GBP"] {
        if name.contains(code) {
            return code.to_string();
        }
    }
    let period = scanner::extract_ipc_period(ipc_path).unwrap_or_default();
    if period.to_uppercase().contains("TZS") || name.contains("IRINGA") {
        return "TZS".to_string();
    }
    "USD".to_string()
}

fn format_cleaned_row_csv(row: &CleanedIpcRow) -> String {
    [
        escape_csv_field(&row.item),
        escape_csv_field(&row.description),
        escape_csv_field(&row.unit),
        format!("{:.2}", row.unit_price),
        format!("{:.2}", row.contract_total_qty),
        format!("{:.2}", row.previous_qty),
        format!("{:.2}", row.current_qty),
        format!("{:.2}", row.end_total_qty),
        format!("{:.2}", row.current_total),
    ]
    .join(",")
}

fn parse_cleaned_row_csv(line: &str) -> Result<CleanedIpcRow> {
    let fields = parse_csv_line(line)?;
    if fields.len() < 9 {
        anyhow::bail!("清洗 CSV 行列数不足: {line}");
    }
    Ok(CleanedIpcRow {
        item: fields[0].clone(),
        description: fields[1].clone(),
        unit: fields[2].clone(),
        unit_price: fields[3].parse().unwrap_or(0.0),
        contract_total_qty: fields[4].parse().unwrap_or(0.0),
        previous_qty: fields[5].parse().unwrap_or(0.0),
        current_qty: fields[6].parse().unwrap_or(0.0),
        end_total_qty: fields[7].parse().unwrap_or(0.0),
        current_total: fields[8].parse().unwrap_or(0.0),
    })
}

fn escape_csv_field(value: &str) -> String {
    if value.contains(['"', ',', '\n', '\r']) {
        format!("\"{}\"", value.replace('"', "\"\""))
    } else {
        value.to_string()
    }
}

/// 清洗 CSV 上由大模型追加的 payment 字段列（非标准 BOQ 列）
#[derive(Debug, Default, Clone)]
pub struct CleanedCsvPaymentFields {
    pub effective_date: Option<String>,
    pub period: Option<String>,
    pub due_date: Option<String>,
}

fn normalize_payment_csv_header(name: &str) -> String {
    name.trim()
        .to_lowercase()
        .replace(' ', "_")
}

/// 从清洗 CSV 表头/首行读取 effective_date、period、due_date（若存在列）
pub fn extract_payment_fields_from_cleaned_csv(csv_path: &Path) -> Result<CleanedCsvPaymentFields> {
    let raw = fs::read_to_string(csv_path)
        .with_context(|| format!("读取清洗 CSV {}", csv_path.display()))?;
    let mut header_map: HashMap<String, usize> = HashMap::new();
    let mut passed_header = false;
    let mut out = CleanedCsvPaymentFields::default();

    for line in raw.lines() {
        let line = normalize_line(line);
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        if !passed_header {
            if is_header_line(&line) || line.contains("effective_date") || line.contains("item") {
                let fields = parse_csv_line(&line)?;
                for (i, h) in fields.iter().enumerate() {
                    header_map.insert(normalize_payment_csv_header(h), i);
                }
                passed_header = true;
            }
            continue;
        }
        let fields = parse_csv_line(&line)?;
        let read_col = |key: &str| -> Option<String> {
            let idx = *header_map.get(key)?;
            let v = fields.get(idx)?.trim().to_string();
            if v.is_empty() {
                None
            } else {
                Some(v)
            }
        };
        if out.effective_date.is_none() {
            out.effective_date = read_col("effective_date");
        }
        if out.period.is_none() {
            out.period = read_col("period");
        }
        if out.due_date.is_none() {
            out.due_date = read_col("due_date");
        }
        if out.effective_date.is_some() && out.period.is_some() && out.due_date.is_some() {
            break;
        }
    }
    Ok(out)
}

fn parse_csv_line(line: &str) -> Result<Vec<String>> {
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;
    use std::thread;
    use std::time::Duration;

    fn sample_ipc_path(dir: &Path) -> PathBuf {
        dir.join("TBEA-TAZASS-LOT 4-TDM-SCH 4-2025002 (IPC002).xlsx")
    }

    #[test]
    fn extract_payment_fields_from_csv_with_extra_columns() {
        let dir = env::temp_dir().join(format!("epc-csv-pay-meta-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let csv = dir.join("TAZASSLOT1SCH1IPC007.csv");
        fs::write(
            &csv,
            "item,description,unit,unit_price,contract_total_qty,previous_qty,current_qty,end_total_qty,current_total_price,effective_date,period\n\
7.1,Earth,m3,1,1,0,1,1,1,2026-05-30,50\n",
        )
        .unwrap();
        let fields = extract_payment_fields_from_cleaned_csv(&csv).unwrap();
        assert_eq!(fields.effective_date.as_deref(), Some("2026-05-30"));
        assert_eq!(fields.period.as_deref(), Some("50"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn save_writes_header_only_no_comment_rows() {
        let dir = env::temp_dir().join(format!("epc_csv_pure_{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let csv_path = dir.join("TAZASSLOT4SCH4IPC002.csv");
        let analysis = IpcSheetAnalysis {
            sheet_name: "Schedule4".into(),
            rows: vec![CleanedIpcRow {
                item: "7.1".into(),
                description: "Earthworks".into(),
                unit: "m3".into(),
                unit_price: 100.0,
                contract_total_qty: 1000.0,
                previous_qty: 10.0,
                current_qty: 2.0,
                end_total_qty: 12.0,
                current_total: 200.0,
            }],
            total_current_amount: 200.0,
            currency: "TZS".into(),
            row_validation_error_count: 0,
            boq_value_total: Some(200.0),
        };
        save_cleaned_csv(&csv_path, &analysis).unwrap();
        let raw = fs::read_to_string(&csv_path).unwrap();
        let first = raw.lines().next().unwrap();
        assert!(!first.starts_with('#'));
        assert_eq!(first, CSV_HEADER);
        assert_eq!(raw.lines().count(), 2);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn csv_roundtrip_from_pure_file() {
        let dir = env::temp_dir().join(format!("epc_csv_cache_{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        let ipc_path = sample_ipc_path(&dir);
        fs::create_dir_all(&dir).unwrap();
        let csv_path = dir.join("TAZASSLOT4SCH4IPC002.csv");
        let analysis = IpcSheetAnalysis {
            sheet_name: "Schedule4".into(),
            rows: vec![CleanedIpcRow {
                item: "7.1".into(),
                description: "Earthworks".into(),
                unit: "m3".into(),
                unit_price: 100.0,
                contract_total_qty: 1000.0,
                previous_qty: 10.0,
                current_qty: 2.0,
                end_total_qty: 12.0,
                current_total: 200.0,
            }],
            total_current_amount: 200.0,
            currency: "TZS".into(),
            row_validation_error_count: 0,
            boq_value_total: Some(200.0),
        };
        save_cleaned_csv(&csv_path, &analysis).unwrap();
        let loaded =
            load_cleaned_csv(&csv_path, "Schedule4", "IPC002", &ipc_path).unwrap();
        assert_eq!(loaded.rows.len(), 1);
        assert_eq!(loaded.rows[0].description, "Earthworks");
        assert!((loaded.total_current_amount - 200.0).abs() < 0.01);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn load_skips_legacy_comment_header() {
        let dir = env::temp_dir().join(format!("epc_csv_legacy_{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let ipc_path = sample_ipc_path(&dir);
        let csv_path = dir.join("legacy.csv");
        fs::write(
            &csv_path,
            "# epc_ipc_cleaned_cache v1\n# source_md5=abc\nitem,description,unit,unit_price,contract_total_qty,previous,current_qty,end_total_qty,current_total_price\n7.1,Earthworks,m3,100.000000,1000.000000,10.000000,2.000000,12.000000,200.000000\n",
        )
        .unwrap();
        let loaded = load_cleaned_csv(&csv_path, "Schedule4", "IPC002", &ipc_path).unwrap();
        assert_eq!(loaded.rows.len(), 1);
        assert_eq!(loaded.rows[0].item, "7.1");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn not_stale_without_legacy_comment_header() {
        let dir = env::temp_dir().join(format!("epc_csv_stale_{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let ipc_path = dir.join("ipc.xlsx");
        fs::write(&ipc_path, b"old").unwrap();
        let csv_path = dir.join("TAZASSLOT4SCH4IPC002.csv");
        save_cleaned_csv(
            &csv_path,
            &IpcSheetAnalysis {
                sheet_name: "S".into(),
                rows: vec![CleanedIpcRow {
                    item: "1".into(),
                    current_total: 1.0,
                    ..Default::default()
                }],
                total_current_amount: 1.0,
                currency: "USD".into(),
                row_validation_error_count: 0,
                boq_value_total: None,
            },
        )
        .unwrap();
        thread::sleep(Duration::from_millis(1100));
        fs::write(&ipc_path, b"new content").unwrap();
        assert!(!csv_cache_is_stale(&ipc_path, &csv_path));
        let _ = fs::remove_dir_all(&dir);
    }
}
