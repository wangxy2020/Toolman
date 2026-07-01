use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use anyhow::{anyhow, Context, Result};
use calamine::{open_workbook_auto, Data, DataType, Reader, Sheets};
use regex::Regex;
use rust_xlsxwriter::{Color, Format, FormatAlign, FormatBorder, Workbook, Worksheet};

/// 母表内存态：按 Schedule 工作表维护行与动态期数列
pub struct MasterWorkbookState {
    pub sheets: HashMap<String, MasterSheetState>,
}

pub struct MasterSheetState {
    pub sheet_name: String,
    pub headers: Vec<String>,
    pub rows: Vec<MasterRow>,
    /// 期数列名 -> 列索引
    pub period_columns: HashMap<String, usize>,
    /// Item 列索引（合计行常在 Item 列写 TOTAL SCHEDULE x）
    pub item_col: usize,
    /// Description 列索引（用于合计行写“合计金额”）
    pub description_col: Option<usize>,
    /// Total Price 列索引（合同总价列，用于合计行求和）
    pub total_price_col: Option<usize>,
}

#[derive(Clone)]
pub struct MasterRow {
    pub cells: Vec<String>,
    pub composite_key: String,
}

/// 复合主键：Item + Unit Price（去空格，单价保留 2 位小数）
pub fn build_composite_key(item: &str, unit_price: f64) -> String {
    let item_norm = normalize_item_key(item);
    format!("{item_norm}|{:.2}", unit_price)
}

/// 仅按 Item 编号匹配（IPC 写入母表期数列金额时使用）
pub fn normalize_item_key(item: &str) -> String {
    format_boq_item_number(item)
        .replace(' ', "")
        .to_uppercase()
}

/// Item 列读写与跨工作流匹配的 canonical 展示值（工作 1 BOQ → 工作 4/5 IPC 等）
pub fn canonical_boq_item_for_match(raw: &str) -> String {
    format_boq_item_number(raw)
}

fn boq_item_key_strip_trailing_zero(item: &str) -> String {
    let cleaned = format_boq_item_number(item);
    if let Ok(n) = cleaned.replace(' ', "").parse::<f64>() {
        if n.is_finite() {
            return format_boq_item_from_float(n);
        }
    }
    normalize_item_key(&cleaned)
}

fn normalize_item_segment(part: &str) -> String {
    let part = part.trim();
    if part.is_empty() {
        return String::new();
    }
    let digit_len = part
        .chars()
        .take_while(|c| c.is_ascii_digit())
        .count();
    if digit_len == 0 {
        return part.to_uppercase();
    }
    let (digits, suffix) = part.split_at(digit_len);
    let suffix = suffix.to_uppercase();
    if let Ok(n) = digits.parse::<f64>() {
        if n.fract().abs() < f64::EPSILON {
            return format!("{}{}", n as i64, suffix);
        }
        return format!("{n}{suffix}");
    }
    format!("{digits}{suffix}")
}

/// 各段去前导零（30.17.01 ↔ 30.17.1），用于 BOQ/IPC Item 模糊匹配
pub(crate) fn segment_normalized_item_key(item: &str) -> String {
    format_boq_item_number(item)
        .split('.')
        .map(normalize_item_segment)
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join(".")
        .replace(' ', "")
        .to_uppercase()
}

fn boq_item_lookup_keys(item: &str) -> Vec<String> {
    let mut keys = vec![
        normalize_item_key(item),
        boq_item_key_strip_trailing_zero(item),
        segment_normalized_item_key(item),
    ];
    keys.sort();
    keys.dedup();
    keys
}

/// 步骤 4 写入母表结果摘要
#[derive(Debug, Clone)]
pub struct IpcMergeSummary {
    pub target_sheet: String,
    pub period_column: String,
    pub matched_rows: u32,
    pub unmatched_rows: u32,
    pub unmatched_items: Vec<String>,
    pub written_total: f64,
}

fn clean_cell_text(cell: &str) -> String {
    cell.replace('\u{FEFF}', "")
        .replace('\u{00a0}', " ")
        .replace('\u{3000}', " ")
        .chars()
        .filter(|c| {
            !matches!(c, '\u{200B}' | '\u{200C}' | '\u{200D}' | '\u{FEFF}')
                && (!c.is_control() || *c == '\t')
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .trim()
        .to_string()
}

fn normalize_fullwidth_digits(s: &str) -> String {
    s.chars()
        .map(|c| {
            if ('\u{FF10}'..='\u{FF19}').contains(&c) {
                char::from_u32((c as u32 - 0xFF10) + u32::from(b'0')).unwrap_or(c)
            } else {
                c
            }
        })
        .collect()
}

fn normalize_header(cell: &str) -> String {
    clean_cell_text(cell)
        .to_lowercase()
        .chars()
        .filter(|c| c.is_alphanumeric())
        .collect()
}

/// 工程量清单行号列：Item / Item No / No / no item / NO. 等
const ITEM_HEADER_ALIASES: &[&str] = &["item", "no", "noitem", "itemno"];

const MAX_HEADER_SCAN_ROWS: usize = 20;
/// IPC 表前常有封面/说明，表头可能远在 20 行之后
const MAX_IPC_HEADER_SCAN_ROWS: usize = 120;
const MAX_IPC_SHEET_SCORE_ROWS: usize = 120;

fn find_column(headers: &[String], candidates: &[&str]) -> Option<usize> {
    headers.iter().position(|h| {
        let n = normalize_header(h);
        candidates.iter().any(|c| n == *c)
    })
}

fn is_explicit_item_header(normalized: &str) -> bool {
    normalized == "item"
        || normalized.starts_with("itemno")
        || (normalized.starts_with("item") && normalized.ends_with("no") && normalized.len() <= 12)
}

fn is_serial_no_header(normalized: &str) -> bool {
    normalized == "no" || normalized == "noitem"
}

fn is_item_header(normalized: &str) -> bool {
    is_explicit_item_header(normalized) || is_serial_no_header(normalized)
}

pub(crate) fn find_item_column(headers: &[String]) -> Option<usize> {
    let mut serial_no_col = None;
    for (idx, h) in headers.iter().enumerate() {
        let n = normalize_header(h);
        if is_explicit_item_header(&n) {
            return Some(idx);
        }
        if is_serial_no_header(&n) {
            serial_no_col.get_or_insert(idx);
        }
    }
    serial_no_col
}

fn ipc_item_code_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"^\s*\d+(\.\d+)*[a-zA-Z]?\s*$").unwrap())
}

fn is_ipc_summary_label(normalized: &str) -> bool {
    normalized.contains("boqvalue")
        || normalized.contains("grandtotal")
        || normalized == "total"
        || normalized.contains("subtotal")
        || normalized.contains("settlementproportion")
        || normalized.contains("periodend")
}

fn row_contains_boq_value_label(row: &[String]) -> bool {
    row.iter()
        .map(|c| normalize_header(c))
        .any(|n| n.contains("boqvalue"))
}

fn looks_like_ipc_item_code(item: &str) -> bool {
    let t = item.trim();
    if t.is_empty() {
        return false;
    }
    let n = normalize_header(t);
    if is_ipc_summary_label(&n) {
        return false;
    }
    // 排除纯数字行号（如 48）；有效 Item 通常为 7.1、30.17.2 等带点编号
    if !t.contains('.') {
        return false;
    }
    ipc_item_code_re().is_match(t)
}

fn is_ipc_summary_row(row: &[String], item: &str) -> bool {
    if row_contains_boq_value_label(row) {
        return true;
    }
    is_ipc_summary_label(&normalize_header(item))
}

fn amounts_approx_equal(a: f64, b: f64) -> bool {
    let diff = (a - b).abs();
    if diff <= 0.05 {
        return true;
    }
    let scale = a.abs().max(b.abs());
    scale > 0.0 && diff / scale < 1e-4
}

fn is_unit_price_header(normalized: &str) -> bool {
    normalized.contains("unitprice")
        || normalized.contains("uniteprice")
        || normalized == "unitrate"
        || normalized == "rate"
        || (normalized.contains("unit") && normalized.contains("rate"))
}

fn is_current_qty_header(normalized: &str) -> bool {
    if normalized.contains("previous") {
        return false;
    }
    if normalized == "current" {
        return true;
    }
    if normalized.contains("current") && !normalized.contains("total") && normalized.len() <= 25 {
        return true;
    }
    if normalized == "quantity" || normalized == "qty" {
        return true;
    }
    if normalized.ends_with("quantity")
        && !normalized.contains("contract")
        && !normalized.contains("est")
        && !normalized.contains("total")
    {
        return true;
    }
    false
}

fn is_current_amount_header(normalized: &str, period: &str) -> bool {
    if normalized.contains("currenttotal") || normalized.contains("currentamount") {
        return true;
    }
    if normalized.contains("periodamount") || normalized.contains("thisperiodamount") {
        return true;
    }
    if normalized.contains("certified") && normalized.contains("amount") {
        return true;
    }
    if normalized.contains("totalprice") || normalized.contains("totalamount") {
        return true;
    }
    // Commercial Invoice 等：Total Price (TZS)、Line Total
    if normalized.contains("total")
        && normalized.contains("price")
        && !normalized.contains("unit")
        && !normalized.contains("contract")
    {
        return true;
    }
    if normalized.contains("line") && normalized.contains("total") {
        return true;
    }
    if normalized == "amount" || normalized == "value" {
        return true;
    }
    if normalized.contains("amount")
        && (normalized.contains("current") || normalized.contains("certified") || normalized.contains("ipc"))
    {
        return true;
    }
    for alias in ipc_period_header_aliases(period) {
        if normalized == alias {
            return true;
        }
    }
    false
}

fn find_unit_price_column(headers: &[String]) -> Option<usize> {
    headers
        .iter()
        .position(|h| is_unit_price_header(&normalize_header(h)))
}

fn is_boq_total_price_header(normalized: &str) -> bool {
    if normalized.contains("unit") {
        return false;
    }
    if normalized.starts_with("ipc") || normalized.contains("currenttotal") || normalized.contains("currentamount") {
        return false;
    }
    (normalized.contains("total") && normalized.contains("price"))
        || (normalized.contains("total") && normalized.contains("amount"))
        || (normalized.contains("contract") && normalized.contains("amount"))
        || normalized.contains("boqvalue")
        || normalized.contains("grandtotal")
}

fn find_boq_total_price_column(headers: &[String]) -> Option<usize> {
    boq_total_price_column_candidates(headers, None).into_iter().next()
}

/// 合同 BOQ 表常用列索引（工作 1 格式化）
#[derive(Debug, Clone, Copy)]
pub struct BoqColumnLayout {
    pub item_col: usize,
    pub description_col: Option<usize>,
    pub unit_col: Option<usize>,
    pub qty_col: Option<usize>,
    pub unit_price_col: usize,
    pub total_price_col: Option<usize>,
}

pub fn detect_boq_column_layout(headers: &[String], item_col: usize) -> BoqColumnLayout {
    BoqColumnLayout {
        item_col,
        description_col: find_boq_description_column(headers),
        unit_col: find_unit_column(headers),
        qty_col: find_contract_total_qty_column(headers),
        unit_price_col: find_unit_price_column(headers).unwrap_or(0),
        total_price_col: find_boq_total_price_column(headers),
    }
}

pub fn row_is_boq_schedule_total(
    row: &[String],
    description_col: Option<usize>,
    item_col: usize,
) -> bool {
    row_looks_like_schedule_total_enhanced(row, description_col, Some(item_col))
}

pub fn row_is_boq_subtotal_row(
    row: &[String],
    description_col: Option<usize>,
    item_col: usize,
) -> bool {
    let is_sub = |text: &str| {
        let n = normalize_header(text);
        n.contains("subtotal") && !n.contains("totalschedule")
    };
    if let Some(cell) = row.get(item_col) {
        if is_sub(cell) {
            return true;
        }
    }
    if let Some(col) = description_col {
        if let Some(cell) = row.get(col) {
            if is_sub(cell) {
                return true;
            }
        }
    }
    false
}

/// 无单位且无单价的数据行（说明行），非 TOTAL SCHEDULE 合计行
pub fn row_is_boq_note_row(row: &[String], layout: &BoqColumnLayout, item_col: usize) -> bool {
    if row_is_boq_schedule_total(row, layout.description_col, item_col) {
        return false;
    }
    let unit_empty = layout
        .unit_col
        .and_then(|c| row.get(c))
        .map(|s| s.trim().is_empty())
        .unwrap_or(true);
    let price_empty = row
        .get(layout.unit_price_col)
        .map(|s| s.trim().is_empty() || parse_f64(s).unwrap_or(0.0).abs() <= f64::EPSILON)
        .unwrap_or(true);
    unit_empty && price_empty
}

pub fn amounts_close(a: f64, b: f64) -> bool {
    amounts_approx_equal(a, b)
}

pub fn parse_boq_number(text: &str) -> Option<f64> {
    parse_cell_number(text)
}

/// 序号列统一为字符串展示（保留用户编号语义，避免 1.10 被读成 1.1）
pub fn format_boq_item_number(raw: &str) -> String {
    let s = normalize_fullwidth_digits(&clean_cell_text(raw));
    if s.contains('.') {
        s.split('.')
            .map(str::trim)
            .filter(|p| !p.is_empty())
            .collect::<Vec<_>>()
            .join(".")
    } else {
        s
    }
}

/// 自然排序：1.9 在 1.10 之前，2.2 在 2.20 之前
pub fn compare_boq_item_number(a: &str, b: &str) -> std::cmp::Ordering {
    use std::cmp::Ordering;
    let sa = format_boq_item_number(a);
    let sb = format_boq_item_number(b);
    let pa: Vec<&str> = sa.split('.').map(str::trim).filter(|p| !p.is_empty()).collect();
    let pb: Vec<&str> = sb.split('.').map(str::trim).filter(|p| !p.is_empty()).collect();
    let max_len = pa.len().max(pb.len());
    for i in 0..max_len {
        let da = pa.get(i).copied().unwrap_or("");
        let db = pb.get(i).copied().unwrap_or("");
        let na = da.chars().take_while(|c| c.is_ascii_digit()).collect::<String>();
        let nb = db.chars().take_while(|c| c.is_ascii_digit()).collect::<String>();
        let sa_suffix = da.strip_prefix(&na).unwrap_or(da);
        let sb_suffix = db.strip_prefix(&nb).unwrap_or(db);
        if !na.is_empty() && !nb.is_empty() {
            if let (Ok(ua), Ok(ub)) = (na.parse::<u64>(), nb.parse::<u64>()) {
                match ua.cmp(&ub) {
                    Ordering::Equal => {}
                    other => return other,
                }
            }
        }
        match (sa_suffix, sb_suffix) {
            ("", "") => {}
            ("", _) => return Ordering::Less,
            (_, "") => return Ordering::Greater,
            (a, b) => match a.cmp(b) {
                Ordering::Equal => {}
                other => return other,
            },
        }
    }
    sa.cmp(&sb)
}

#[derive(Debug, Clone, Copy, Default)]
pub struct BoqNormalizeOptions {
    /// 为 true 时保持读取顺序（章节/无 Item 行不挪到表顶）
    pub preserve_row_order: bool,
}

/// 清洗并排序合同 BOQ 明细行，保留 TOTAL SCHEDULE 合计行在末尾
pub fn normalize_contract_boq_sheet(sheet: &mut MasterSheetState) -> BoqSheetNormalizeStats {
    normalize_contract_boq_sheet_with_options(sheet, BoqNormalizeOptions::default())
}

/// 工作 1 格式化：保持行序，仅剔除无效行并规范化 Item 文本
pub fn normalize_contract_boq_sheet_for_format(sheet: &mut MasterSheetState) -> BoqSheetNormalizeStats {
    normalize_contract_boq_sheet_with_options(
        sheet,
        BoqNormalizeOptions {
            preserve_row_order: true,
        },
    )
}

fn build_refined_boq_item_displays(rows: &[MasterRow], item_col: usize) -> Vec<String> {
    let raw_displays: Vec<String> = rows
        .iter()
        .map(|r| {
            let raw = r.cells.get(item_col).cloned().unwrap_or_default();
            let t = raw.trim();
            if t.is_empty() {
                String::new()
            } else {
                format_boq_item_number(&raw)
            }
        })
        .collect();

    raw_displays
        .iter()
        .enumerate()
        .map(|(idx, display)| {
            if display.is_empty() {
                return String::new();
            }
            let prev = raw_displays[..idx]
                .iter()
                .rev()
                .find(|s| !s.is_empty())
                .map(|s| s.as_str());
            let next = raw_displays[idx + 1..]
                .iter()
                .find(|s| !s.is_empty())
                .map(|s| s.as_str());
            refine_boq_item_display_in_sequence(display, prev, next)
        })
        .collect()
}

/// 清洗 Item 列不可见字符并同步 composite_key（加载 aligned 母表或 IPC 合并前调用）
pub fn sanitize_sheet_item_cells(sheet: &mut MasterSheetState) {
    let item_col = sheet.item_col;
    let layout = detect_boq_column_layout(&sheet.headers, item_col);
    for row in &mut sheet.rows {
        let Some(cell) = row.cells.get_mut(item_col) else {
            continue;
        };
        let cleaned = format_boq_item_number(cell);
        if cleaned.is_empty() {
            continue;
        }
        *cell = cleaned.clone();
        let unit_price = row
            .cells
            .get(layout.unit_price_col)
            .and_then(|v| parse_cell_number(v))
            .unwrap_or(0.0);
        row.composite_key = build_composite_key(&cleaned, unit_price);
    }
}

pub fn sanitize_master_workbook_item_cells(master: &mut MasterWorkbookState) {
    for sheet in master.sheets.values_mut() {
        sanitize_sheet_item_cells(sheet);
    }
}

/// 工作 4：按工作 1 同款规则精炼 Item 序号列（不删行、不排序、不去重），并同步 composite_key。
pub fn refine_contract_boq_item_column(sheet: &mut MasterSheetState) {
    sanitize_sheet_item_cells(sheet);
    let item_col = sheet.item_col;
    let layout = detect_boq_column_layout(&sheet.headers, item_col);
    let refined_items = build_refined_boq_item_displays(&sheet.rows, item_col);
    for (idx, row) in sheet.rows.iter_mut().enumerate() {
        let Some(refined) = refined_items.get(idx).filter(|s| !s.is_empty()) else {
            continue;
        };
        if let Some(cell) = row.cells.get_mut(item_col) {
            *cell = refined.clone();
        }
        let unit_price = row
            .cells
            .get(layout.unit_price_col)
            .and_then(|v| parse_cell_number(v))
            .unwrap_or(0.0);
        row.composite_key = build_composite_key(refined, unit_price);
    }
}

pub fn refine_master_workbook_item_columns(master: &mut MasterWorkbookState) {
    for sheet in master.sheets.values_mut() {
        refine_contract_boq_item_column(sheet);
    }
}

pub fn normalize_contract_boq_sheet_with_options(
    sheet: &mut MasterSheetState,
    options: BoqNormalizeOptions,
) -> BoqSheetNormalizeStats {
    let layout = detect_boq_column_layout(&sheet.headers, sheet.item_col);
    let item_col = sheet.item_col;
    let desc_col = sheet.description_col;
    let last_priced_detail = last_boq_priced_detail_row_index(&sheet.rows, &layout);
    let refined_items = build_refined_boq_item_displays(&sheet.rows, item_col);
    let mut kept: Vec<MasterRow> = Vec::new();
    let mut seen_items: std::collections::HashSet<String> = std::collections::HashSet::new();
    let mut dropped_empty_item = 0u32;
    let mut dropped_note = 0u32;
    let mut dropped_subtotal = 0u32;
    let mut dropped_duplicate = 0u32;
    let mut total_rows: Vec<MasterRow> = Vec::new();

    for (row_index, mut row) in sheet.rows.drain(..).enumerate() {
        if row_is_boq_schedule_total(&row.cells, desc_col, item_col) {
            total_rows.push(row);
            continue;
        }
        if !boq_row_should_keep(
            &row.cells,
            &layout,
            item_col,
            desc_col,
            row_index,
            last_priced_detail,
        ) {
            if row_is_boq_subtotal_row(&row.cells, desc_col, item_col) {
                dropped_subtotal += 1;
            } else if !boq_description_is_meaningful(boq_row_description(&row.cells, desc_col)) {
                dropped_empty_item += 1;
            } else {
                dropped_note += 1;
            }
            continue;
        }

        let item_raw = row.cells.get(item_col).cloned().unwrap_or_default();
        let item_trim = item_raw.trim();

        let item_key = if item_trim.is_empty() {
            let desc = desc_col
                .and_then(|c| row.cells.get(c))
                .map(|s| s.trim())
                .unwrap_or("");
            format!("desc:{row_index}:{}", normalize_item_key(desc))
        } else {
            let item_display = refined_items
                .get(row_index)
                .cloned()
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| format_boq_item_number(&item_raw));
            if let Some(cell) = row.cells.get_mut(item_col) {
                *cell = item_display.clone();
            }
            let desc_sig = desc_col
                .and_then(|c| row.cells.get(c))
                .map(|s| normalize_item_key(s.trim()))
                .unwrap_or_default();
            let price = row
                .cells
                .get(layout.unit_price_col)
                .and_then(|v| parse_cell_number(v))
                .unwrap_or(0.0);
            format!(
                "{}|{}|{:.4}",
                normalize_item_key(&item_display),
                desc_sig,
                price
            )
        };

        if !seen_items.insert(item_key) {
            dropped_duplicate += 1;
            continue;
        }
        kept.push(row);
    }

    if !options.preserve_row_order {
        kept.sort_by(|a, b| {
            let ia = a.cells.get(item_col).map(|s| s.trim()).unwrap_or("");
            let ib = b.cells.get(item_col).map(|s| s.trim()).unwrap_or("");
            match (ia.is_empty(), ib.is_empty()) {
                (true, true) => {
                    let da = desc_col
                        .and_then(|c| a.cells.get(c))
                        .map(|s| s.trim())
                        .unwrap_or("");
                    let db = desc_col
                        .and_then(|c| b.cells.get(c))
                        .map(|s| s.trim())
                        .unwrap_or("");
                    da.cmp(db)
                }
                (true, false) => std::cmp::Ordering::Less,
                (false, true) => std::cmp::Ordering::Greater,
                (false, false) => compare_boq_item_number(ia, ib),
            }
        });
    }

    for total in total_rows {
        kept.push(total);
    }

    sheet.rows = kept;
    BoqSheetNormalizeStats {
        dropped_empty_item,
        dropped_note,
        dropped_subtotal,
        dropped_duplicate,
        output_row_count: sheet.rows.len() as u32,
    }
}

#[derive(Debug, Clone, Default)]
pub struct BoqSheetNormalizeStats {
    pub dropped_empty_item: u32,
    pub dropped_note: u32,
    pub dropped_subtotal: u32,
    pub dropped_duplicate: u32,
    pub output_row_count: u32,
}

fn boq_total_price_column_candidates(headers: &[String], preferred: Option<usize>) -> Vec<usize> {
    let mut out = Vec::new();
    let mut seen = std::collections::HashSet::new();
    let mut push = |col: usize| {
        if seen.insert(col) {
            out.push(col);
        }
    };
    if let Some(col) = preferred {
        push(col);
    }
    for (idx, header) in headers.iter().enumerate() {
        if is_boq_total_price_header(&normalize_header(header)) {
            push(idx);
        }
    }
    out
}

fn find_boq_description_column(headers: &[String]) -> Option<usize> {
    headers
        .iter()
        .position(|h| is_description_header(&normalize_header(h)))
}

fn is_description_header(normalized: &str) -> bool {
    normalized.contains("description")
        || normalized.contains("workdesc")
        || normalized == "desc"
}

fn is_unit_of_measure_header(normalized: &str) -> bool {
    if normalized.contains("price") || normalized.contains("rate") {
        return false;
    }
    normalized == "unit"
        || normalized == "uom"
        || normalized.contains("unitofmeasure")
        || (normalized.contains("unit") && normalized.contains("measure"))
}

fn is_contract_total_qty_header(normalized: &str) -> bool {
    (normalized.contains("contract") && (normalized.contains("qty") || normalized.contains("quantity")))
        || normalized.contains("contracttotalqty")
        || normalized.contains("contractquantity")
        || (normalized.contains("boq") && (normalized.contains("qty") || normalized.contains("quantity")))
        || normalized.contains("estqty")
        || normalized.contains("estimatedqty")
        || normalized == "totalqty"
}

fn is_previous_qty_header(normalized: &str) -> bool {
    normalized.contains("previous")
        && !normalized.contains("amount")
        && !normalized.contains("price")
        && !normalized.contains("totalprice")
}

fn is_end_total_qty_header(normalized: &str) -> bool {
    (normalized.contains("end") && (normalized.contains("qty") || normalized.contains("quantity")))
        || normalized.contains("cumul")
        || normalized.contains("todate")
        || normalized.contains("endtotal")
}

pub(crate) fn find_description_column(headers: &[String]) -> Option<usize> {
    headers
        .iter()
        .position(|h| is_description_header(&normalize_header(h)))
}

fn find_unit_column(headers: &[String]) -> Option<usize> {
    headers
        .iter()
        .position(|h| is_unit_of_measure_header(&normalize_header(h)))
}

fn find_contract_total_qty_column(headers: &[String]) -> Option<usize> {
    headers
        .iter()
        .position(|h| is_contract_total_qty_header(&normalize_header(h)))
}

fn find_previous_qty_column(headers: &[String]) -> Option<usize> {
    headers
        .iter()
        .position(|h| is_previous_qty_header(&normalize_header(h)))
}

fn find_end_total_qty_column(headers: &[String]) -> Option<usize> {
    headers
        .iter()
        .position(|h| is_end_total_qty_header(&normalize_header(h)))
}

fn ipc_row_f64(row: &[String], col: Option<usize>) -> f64 {
    col.and_then(|c| parse_f64(&row.get(c).cloned().unwrap_or_default()))
        .unwrap_or(0.0)
}

fn ipc_row_str(row: &[String], col: Option<usize>) -> String {
    col.and_then(|c| row.get(c).cloned()).unwrap_or_default()
}

/// 将多行表头按列合并（合并单元格时仅首格有字，下行可能为空或仅有 [USD] 等）
fn merge_header_rows(rows: &[&[String]]) -> Vec<String> {
    let col_count = rows.iter().map(|r| r.len()).max().unwrap_or(0);
    (0..col_count)
        .map(|c| {
            rows.iter()
                .filter_map(|r| r.get(c))
                .map(|s| s.trim())
                .filter(|s| !s.is_empty())
                .collect::<Vec<_>>()
                .join(" ")
        })
        .collect()
}

/// 首行常为 SCHEDULE 标题（合并单元格，仅一格有长文本）
/// 表头下一行仅含 [USD]、[TZS] 等货币标注
fn row_looks_like_currency_subheader(row: &[String]) -> bool {
    let non_empty: Vec<&str> = row.iter().map(|s| s.trim()).filter(|s| !s.is_empty()).collect();
    if non_empty.is_empty() {
        return false;
    }
    non_empty
        .iter()
        .all(|s| s.starts_with('[') && s.ends_with(']') && s.len() <= 8)
}

fn row_is_blank(row: &[String]) -> bool {
    row.iter().all(|s| clean_cell_text(s).is_empty())
}

/// 含 SCHEDULE 长标题的单行（合并单元格）；空行不算标题，以便与下一行表头合并
fn row_looks_like_title(row: &[String]) -> bool {
    if row_is_blank(row) {
        return false;
    }
    let non_empty: Vec<String> = row
        .iter()
        .map(|s| clean_cell_text(s))
        .filter(|s| !s.is_empty())
        .collect();
    if non_empty.len() == 1 {
        let first = non_empty[0].to_lowercase();
        return first.contains("schedule") || first.len() > 36;
    }
    if non_empty.len() <= 2 {
        let first = non_empty[0].to_lowercase();
        if first.contains("schedule") && first.len() > 24 {
            return true;
        }
    }
    false
}

fn headers_have_boq_key_columns(headers: &[String]) -> bool {
    find_item_column(headers).is_some() && find_unit_price_column(headers).is_some()
}

fn headers_have_ipc_key_columns(headers: &[String], period: &str) -> bool {
    find_item_column(headers).is_some()
        && find_current_column(headers).is_some()
        && find_current_total_column(headers, period).is_some()
}

fn score_merged_header(headers: &[String], period: &str) -> i32 {
    let mut score = 0;
    if find_item_column(headers).is_some() {
        score += 40;
    }
    if find_unit_price_column(headers).is_some() {
        score += 40;
    }
    if find_current_column(headers).is_some() {
        score += 35;
    }
    if find_current_total_column(headers, period).is_some() {
        score += 35;
    }
    score
}

/// 定位表头（支持标题行、双行/多行表头；IPC 常见 Item 在第 7 行、Current 在第 8 行子表头下）
fn locate_merged_header_inner(
    rows: &[Vec<String>],
    period: &str,
    require_ipc_columns: bool,
) -> Option<(Vec<String>, usize)> {
    let scan_cap = if require_ipc_columns {
        MAX_IPC_HEADER_SCAN_ROWS
    } else {
        MAX_HEADER_SCAN_ROWS
    };
    let n = rows.len().min(scan_cap);
    if n == 0 {
        return None;
    }

    const MAX_HEADER_SPAN: usize = 4;
    // IPC：Item + Quantity/Current + 本期金额列即可（单价列可选，如 IPC002）
    let min_score = if require_ipc_columns { 110 } else { 80 };

    let mut best: Option<(Vec<String>, usize, i32)> = None;

    for start in 0..n {
        if row_looks_like_title(&rows[start]) {
            continue;
        }
        for span in 1..=MAX_HEADER_SPAN {
            let end = start + span;
            if end > n {
                break;
            }
            let slice: Vec<&[String]> = rows[start..end].iter().map(|r| r.as_slice()).collect();
            let mut merged = merge_header_rows(&slice);
            if require_ipc_columns {
                if !headers_have_ipc_key_columns(&merged, period) {
                    continue;
                }
            } else if !headers_have_boq_key_columns(&merged) {
                continue;
            }
            let score = score_merged_header(&merged, period);
            if score < min_score {
                continue;
            }
            let mut data_start = end;
            while data_start < n && row_looks_like_currency_subheader(&rows[data_start]) {
                merged = merge_header_rows(&[&merged, rows[data_start].as_slice()]);
                data_start += 1;
            }
            if best
                .as_ref()
                .map(|(_, _, best_score)| score > *best_score)
                .unwrap_or(true)
            {
                best = Some((merged, data_start, score));
            }
        }
    }

    best.map(|(headers, data_start, _)| (headers, data_start))
}

/// 定位 BOQ 表头（Item + Unit Price 即可，允许单行表头）
pub fn locate_merged_header(rows: &[Vec<String>]) -> Option<(Vec<String>, usize)> {
    locate_merged_header_inner(rows, "", false)
}

fn headers_have_shipping_ci_columns(headers: &[String]) -> bool {
    find_item_column(headers).is_some()
}

/// 海运商业发票表头：Item / Item No / No 等序号列即可（无 Unit Price 要求）
pub(crate) fn locate_shipping_ci_merged_header(
    rows: &[Vec<String>],
) -> Option<(Vec<String>, usize)> {
    let n = rows.len().min(MAX_IPC_HEADER_SCAN_ROWS);
    if n == 0 {
        return None;
    }
    for end in 0..n {
        let headers = rows[end].clone();
        if headers_have_shipping_ci_columns(&headers) {
            return Some((headers, end + 1));
        }
    }
    for i in 0..n.saturating_sub(1) {
        if row_looks_like_title(&rows[i]) {
            continue;
        }
        let merged = merge_header_rows(&[&rows[i], &rows[i + 1]]);
        if headers_have_shipping_ci_columns(&merged) {
            let mut data_start = i + 2;
            while data_start < n && row_looks_like_currency_subheader(&rows[data_start]) {
                data_start += 1;
            }
            return Some((merged, data_start));
        }
    }
    None
}

/// 定位 IPC 表头（须合并多行，使 Item 行与 Completion Progress → Current 子表头在同一逻辑表头中）
pub fn locate_ipc_merged_header(
    rows: &[Vec<String>],
    period: &str,
) -> Option<(Vec<String>, usize)> {
    locate_merged_header_inner(rows, period, true)
}

struct BoqTableLayout {
    headers: Vec<String>,
    data_start_row: usize,
    item_col: usize,
    unit_price_col: usize,
}

fn locate_boq_table(rows: &[Vec<String>]) -> Option<BoqTableLayout> {
    let (headers, data_start_row) = locate_merged_header(rows)?;
    let item_col = find_item_column(&headers)?;
    let unit_price_col = find_unit_price_column(&headers)?;
    Some(BoqTableLayout {
        headers,
        data_start_row,
        item_col,
        unit_price_col,
    })
}

pub(crate) fn find_current_column(headers: &[String]) -> Option<usize> {
    headers
        .iter()
        .position(|h| is_current_qty_header(&normalize_header(h)))
}

fn extract_currency_from_header_cell(h: &str) -> Option<String> {
    let upper = h.to_uppercase();
    for code in ["TZS", "USD", "EUR", "CNY", "GBP"] {
        if upper.contains(code) {
            return Some(code.to_string());
        }
    }
    if let (Some(start), Some(end)) = (h.find('['), h.rfind(']')) {
        if end > start + 1 {
            let code = h[start + 1..end].trim();
            if (2..=6).contains(&code.len()) && code.chars().all(|c| c.is_ascii_alphabetic()) {
                return Some(code.to_uppercase());
            }
        }
    }
    None
}

fn find_ipc_currency(headers: &[String], ipc_path: &Path) -> String {
    // Unit Price / Total Price 子表头 [TZS] 优先于其它列（避免 IPC 列名误匹配）
    for h in headers {
        let n = normalize_header(h);
        if is_unit_price_header(&n) || is_boq_total_price_header(&n) {
            if let Some(code) = extract_currency_from_header_cell(h) {
                return code;
            }
        }
    }
    for h in headers {
        if let Some(code) = extract_currency_from_header_cell(h) {
            return code;
        }
    }
    if let Some(name) = ipc_path.file_name().and_then(|s| s.to_str()) {
        if let Some(code) = currency_token_in_text(name) {
            return code;
        }
    }
    "USD".to_string()
}

fn ipc_period_header_aliases(period: &str) -> Vec<String> {
    let Some(caps) = ipc_period_re().captures(period) else {
        return Vec::new();
    };
    let Some(num) = caps.get(1).map(|m| m.as_str()) else {
        return Vec::new();
    };
    let trimmed = num.trim_start_matches('0');
    let core = if trimmed.is_empty() { "0" } else { trimmed };
    vec![
        format!("ipc{core}"),
        format!("ipc{num}"),
        format!("ipc{num:0>3}"),
    ]
}

fn find_current_total_column(headers: &[String], period: &str) -> Option<usize> {
    headers
        .iter()
        .position(|h| is_current_amount_header(&normalize_header(h), period))
}

fn ipc_period_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?i)ipc\s*_?\s*0*(\d+)").unwrap())
}

fn sheet_name_matches_ipc_period(sheet_name: &str, period: &str) -> bool {
    let sheet = normalize_header(sheet_name);
    for alias in ipc_period_header_aliases(period) {
        if sheet == alias || sheet.contains(&alias) {
            return true;
        }
    }
    false
}

fn sheet_looks_like_invoice_tab(sheet_name: &str) -> bool {
    let lower = sheet_name.to_lowercase();
    lower.contains("invoice") || sheet_name.contains('票')
}

/// 表头以下带点编号行数量，用于优先选择真正含工程量清单的工作表
fn count_ipc_data_rows(rows: &[Vec<String>], data_start: usize, item_col: usize) -> u32 {
    rows.iter()
        .skip(data_start)
        .take(800)
        .filter(|row| {
            let item = row.get(item_col).cloned().unwrap_or_default();
            looks_like_ipc_item_code(&item)
        })
        .count() as u32
}

fn score_ipc_sheet(
    workbook: &mut Sheets<impl std::io::Read + std::io::Seek>,
    sheet_name: &str,
    period: &str,
) -> i32 {
    let Ok(range) = workbook.worksheet_range(sheet_name) else {
        return i32::MIN / 4;
    };
    let rows: Vec<Vec<String>> = range
        .rows()
        .take(MAX_IPC_SHEET_SCORE_ROWS)
        .map(|row| row.iter().map(cell_to_string).collect())
        .collect();
    let Some((headers, data_start)) = locate_ipc_merged_header(&rows, period) else {
        return i32::MIN / 4;
    };

    let item_col = match find_item_column(&headers) {
        Some(c) => c,
        None => return i32::MIN / 4,
    };
    let data_rows = count_ipc_data_rows(&rows, data_start, item_col);

    let mut score = score_merged_header(&headers, period);
    if sheet_name_matches_ipc_period(sheet_name, period) {
        score += 120;
    }
    if data_rows == 0 {
        score -= 60;
    } else {
        score += (data_rows.min(40) as i32) * 4;
    }
    // 仅当「发票/Invoice」页不像工程量表时才降权（IPC002 等数据在 Commercial Invoice 页）
    if sheet_looks_like_invoice_tab(sheet_name) {
        let has_ipc_table = headers_have_ipc_key_columns(&headers, period) && data_rows > 0;
        if !has_ipc_table {
            score -= 80;
        }
    }
    score
}

pub(crate) fn cell_to_string(data: &Data) -> String {
    match data {
        Data::Empty => String::new(),
        Data::String(s) => clean_cell_text(s),
        Data::Float(f) => format!("{f}"),
        Data::Int(i) => i.to_string(),
        Data::Bool(b) => b.to_string(),
        Data::DateTime(f) => format!("{f}"),
        Data::DateTimeIso(s) => s.clone(),
        Data::DurationIso(s) => s.clone(),
        Data::Error(e) => format!("{e:?}"),
    }
}

/// Item 列：优先保留 Excel 文本；数值型按整数或去尾零小数展示，避免 1.10 被读成 1.1 后再排序错乱
fn cell_to_boq_item_string(data: &Data) -> String {
    match data {
        Data::String(s) => format_boq_item_number(s),
        Data::Int(i) => i.to_string(),
        Data::Float(f) => format_boq_item_from_float(*f),
        other => format_boq_item_number(&cell_to_string(other)),
    }
}

/// 浮点小数部分需要几位十进制才能无损还原（BOQ 点号后为整数序号，非固定两位小数）
fn boq_fractional_digit_count(frac: f64) -> usize {
    if frac.abs() < 1e-12 {
        return 0;
    }
    for d in 1..=6 {
        let scaled = (frac * 10f64.powi(d as i32)).round();
        let back = scaled / 10f64.powi(d as i32);
        if (frac - back).abs() < 1e-9 {
            return d;
        }
    }
    6
}

/// 将 Excel 数值型 Item 转为层级编号字符串：`n.1`…`n.9`、`n.10`…（勿把 `20.1` 写成 `20.10`）
pub fn format_boq_item_from_float(f: f64) -> String {
    if f.is_nan() || f.is_infinite() {
        return String::new();
    }
    if (f - f.round()).abs() < 1e-9 {
        return format!("{}", f.round() as i64);
    }
    let whole = f.trunc() as i64;
    let frac = f - f.trunc();
    let digits = boq_fractional_digit_count(frac);
    if digits == 0 {
        return format!("{whole}");
    }
    let multiplier = 10f64.powi(digits as i32);
    let frac_int = (frac * multiplier).round() as i64;
    format!("{whole}.{frac_int}")
}

/// 解析 `parent.last` 两级编号；仅父级（如 `20`）时 last 视为 0
fn boq_item_parent_and_last_segment(item: &str) -> Option<(String, u64)> {
    let item = format_boq_item_number(item);
    let parts: Vec<&str> = item.split('.').map(str::trim).filter(|p| !p.is_empty()).collect();
    match parts.len() {
        1 => Some((parts[0].to_string(), 0)),
        2 => {
            let last_digits: String = parts[1]
                .chars()
                .take_while(|c| c.is_ascii_digit())
                .collect();
            let seg = last_digits.parse::<u64>().ok()?;
            Some((parts[0].to_string(), seg))
        }
        _ => None,
    }
}

fn boq_item_with_last_segment(parent: &str, seg: u64) -> String {
    format!("{parent}.{seg}")
}

/// 提取各级纯数字段（用于 30.9.2 / 30.10 等多级序号推断）
fn boq_item_digit_segments(item: &str) -> Vec<u64> {
    format_boq_item_number(item)
        .split('.')
        .filter_map(|part| {
            let digits: String = part
                .trim()
                .chars()
                .take_while(|c| c.is_ascii_digit())
                .collect();
            digits.parse().ok()
        })
        .collect()
}

/// 深级 prev（如 30.9.2）+ 浮点截断的浅级 display（30.1 实为 30.10）→ 提升为 30.10
fn try_promote_truncated_after_deep_prev(
    display: &str,
    prev_item: Option<&str>,
    next_item: Option<&str>,
) -> Option<String> {
    use std::cmp::Ordering;

    let display_parts = boq_item_digit_segments(display);
    if display_parts.len() != 2 {
        return None;
    }
    let prev_s = prev_item
        .map(format_boq_item_number)
        .filter(|s| !s.is_empty())?;
    let next_s = next_item
        .map(format_boq_item_number)
        .filter(|s| !s.is_empty())?;

    if compare_boq_item_number(&prev_s, display) != Ordering::Greater {
        return None;
    }
    if compare_boq_item_number(display, &next_s) != Ordering::Less {
        return None;
    }

    let prev_parts = boq_item_digit_segments(&prev_s);
    if prev_parts.len() < 2 || prev_parts[0] != display_parts[0] {
        return None;
    }

    let prev_l2 = prev_parts[1];
    let cur_l2 = display_parts[1];
    // 30.9.x 之后常见 30.10；Excel 浮点把 30.10 读成 30.1
    if prev_l2 < 9 || cur_l2 == 0 || cur_l2 > 9 {
        return None;
    }

    let candidate = boq_item_with_last_segment(&display_parts[0].to_string(), cur_l2 * 10);
    if compare_boq_item_number(&prev_s, &candidate) == Ordering::Less
        && compare_boq_item_number(&candidate, &next_s) == Ordering::Less
    {
        Some(candidate)
    } else {
        None
    }
}

/// 根据上下行推断被 Excel 浮点截断的层级序号（如 `20.19` / `20.2` / `20.21` → `20.20`）
pub fn refine_boq_item_display_in_sequence(
    display: &str,
    prev_item: Option<&str>,
    next_item: Option<&str>,
) -> String {
    use std::cmp::Ordering;

    let display = format_boq_item_number(display);
    if display.is_empty() {
        return String::new();
    }

    if let Some(promoted) = try_promote_truncated_after_deep_prev(&display, prev_item, next_item) {
        return promoted;
    }

    let Some((parent, cur_seg)) = boq_item_parent_and_last_segment(&display) else {
        return display;
    };

    let prev = prev_item
        .map(format_boq_item_number)
        .filter(|s| !s.is_empty());
    let next = next_item
        .map(format_boq_item_number)
        .filter(|s| !s.is_empty());

    let (Some((prev_parent, prev_seg)), Some((next_parent, next_seg))) =
        (prev.as_deref().and_then(boq_item_parent_and_last_segment), next.as_deref().and_then(boq_item_parent_and_last_segment))
    else {
        return display;
    };

    if prev_parent != parent || next_parent != parent {
        return display;
    }

    let prev_s = prev.as_deref().unwrap();
    let next_s = next.as_deref().unwrap();
    if compare_boq_item_number(prev_s, next_s) != Ordering::Less {
        return display;
    }

    // 相邻子项：prev.k 与 next.(k+2) 之间缺 k+1（如 19 与 21 之间应为 20）
    if next_seg != prev_seg.saturating_add(2) {
        return display;
    }
    let expected = prev_seg + 1;

    if cur_seg == expected {
        return boq_item_with_last_segment(&parent, expected);
    }

    let ordering_broken = compare_boq_item_number(prev_s, &display) == Ordering::Greater
        && compare_boq_item_number(&display, next_s) == Ordering::Less;
    if ordering_broken {
        return boq_item_with_last_segment(&parent, expected);
    }

    display
}

fn boq_row_description<'a>(row: &'a [String], description_col: Option<usize>) -> &'a str {
    description_col
        .and_then(|c| row.get(c))
        .map(|s| s.trim())
        .unwrap_or("")
}

/// Description 列有实质文字（章节标题、1.0 分项名、明细说明等）
pub fn boq_description_is_meaningful(desc: &str) -> bool {
    if desc.len() < 2 {
        return false;
    }
    let lower = desc.to_lowercase();
    !(lower.contains("total schedule") || lower.contains("subtotal"))
}

/// 无单位且无单价（与「说明行」判定一致，用于表尾剔除）
pub fn boq_row_lacks_unit_and_price(row: &[String], layout: &BoqColumnLayout) -> bool {
    row_is_boq_note_row(row, layout, layout.item_col)
}

/// 含单位/单价/工程量的明细行
fn row_is_boq_priced_detail_row(row: &[String], layout: &BoqColumnLayout) -> bool {
    if row_is_boq_schedule_total(row, layout.description_col, layout.item_col) {
        return false;
    }
    let unit_filled = layout
        .unit_col
        .and_then(|c| row.get(c))
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);
    let price_filled = row
        .get(layout.unit_price_col)
        .and_then(|s| parse_f64(s))
        .map(|n| n.abs() > f64::EPSILON)
        .unwrap_or(false);
    let qty_filled = layout
        .qty_col
        .and_then(|c| row.get(c))
        .and_then(|s| parse_f64(s))
        .map(|n| n.abs() > f64::EPSILON)
        .unwrap_or(false);
    unit_filled || price_filled || qty_filled
}

fn last_boq_priced_detail_row_index(rows: &[MasterRow], layout: &BoqColumnLayout) -> Option<usize> {
    rows.iter()
        .enumerate()
        .filter(|(_, r)| !row_is_boq_schedule_total(&r.cells, layout.description_col, layout.item_col))
        .filter(|(_, r)| row_is_boq_priced_detail_row(&r.cells, layout))
        .map(|(i, _)| i)
        .last()
}

/// 合同 BOQ 行是否保留：有 Description 的一般保留；表尾（最后一条明细之后）无 Unit 且无 Unit Price 的剔除。
pub fn boq_row_should_keep(
    row: &[String],
    layout: &BoqColumnLayout,
    item_col: usize,
    desc_col: Option<usize>,
    row_index: usize,
    last_priced_detail_idx: Option<usize>,
) -> bool {
    if row_is_boq_schedule_total(row, desc_col, item_col) {
        return true;
    }
    if row_is_boq_subtotal_row(row, desc_col, item_col) {
        return false;
    }
    let desc = boq_row_description(row, desc_col);
    if !boq_description_is_meaningful(desc) {
        return row_is_boq_priced_detail_row(row, layout);
    }
    let in_bottom_tail = last_priced_detail_idx
        .map(|last| row_index > last)
        .unwrap_or(false);
    if in_bottom_tail && boq_row_lacks_unit_and_price(row, layout) {
        return false;
    }
    true
}

/// Item 为空且 Description 有实质文字（章节标题行）
pub fn boq_description_row_should_keep(
    row: &[String],
    description_col: Option<usize>,
    item_col: usize,
) -> bool {
    !row_is_boq_schedule_total(row, description_col, item_col)
        && !row_is_boq_subtotal_row(row, description_col, item_col)
        && boq_description_is_meaningful(boq_row_description(row, description_col))
}

fn boq_qty_is_integer(n: f64) -> bool {
    n.is_finite() && (n - n.round()).abs() < 1e-9
}

fn parse_f64(text: &str) -> Option<f64> {
    parse_cell_number(text)
}

/// 解析单元格数值（去掉千分位逗号及所有空白，兼容 "21, 601, 287. 50"）
fn parse_cell_number(text: &str) -> Option<f64> {
    let t: String = text
        .chars()
        .filter(|c| !c.is_whitespace())
        .collect::<String>()
        .replace(',', "");
    if t.is_empty() {
        return None;
    }
    t.parse().ok()
}

fn pad_row_cells(row: &[String], width: usize) -> Vec<String> {
    let mut cells = row.to_vec();
    while cells.len() < width {
        cells.push(String::new());
    }
    cells
}

/// 单价、合同总价、IPC 期数列使用千分位金额格式
fn column_wants_thousand_separator(header: &str) -> bool {
    let n = normalize_header(header);
    is_unit_price_header(&n) || is_boq_total_price_header(&n) || n.contains("ipc")
}

#[derive(Debug, Clone, Copy, Default)]
pub struct MasterWorkbookLoadOptions {
    /// 工作 1：保留 Item 为空但 Description 为设备/分项名称的行
    pub keep_boq_description_only_rows: bool,
}

pub fn load_master_workbook(path: &Path) -> Result<MasterWorkbookState> {
    load_master_workbook_with_options(path, MasterWorkbookLoadOptions::default())
}

/// 工作 1 合同 BOQ 格式化：加载时保留无 Item 的设备名称行，且 Item 列按文本语义读取
pub fn load_master_workbook_for_boq_format(path: &Path) -> Result<MasterWorkbookState> {
    load_master_workbook_with_options(
        path,
        MasterWorkbookLoadOptions {
            keep_boq_description_only_rows: true,
        },
    )
}

pub fn load_master_workbook_with_options(
    path: &Path,
    options: MasterWorkbookLoadOptions,
) -> Result<MasterWorkbookState> {
    let mut workbook: Sheets<_> = open_workbook_auto(path)
        .with_context(|| format!("无法打开母表 {}", path.display()))?;

    let mut sheets = HashMap::new();
    let sheet_names: Vec<String> = workbook.sheet_names().to_vec();
    let mut unreadable_schedule_sheets: Vec<String> = Vec::new();

    for name in &sheet_names {
        if !is_schedule_sheet(name) {
            continue;
        }
        if let Ok(range) = workbook.worksheet_range(name) {
            let sheet_rows_data: Vec<Vec<Data>> = range
                .rows()
                .map(|row| row.to_vec())
                .collect();
            let sheet_rows: Vec<Vec<String>> = sheet_rows_data
                .iter()
                .map(|row| row.iter().map(cell_to_string).collect())
                .collect();
            let Some(layout) = locate_boq_table(&sheet_rows) else {
                unreadable_schedule_sheets.push(name.clone());
                continue;
            };

            let description_col = find_boq_description_column(&layout.headers);
            let header_width = layout.headers.len();
            let layout_boq = detect_boq_column_layout(&layout.headers, layout.item_col);
            let mut padded_rows: Vec<Vec<String>> = Vec::new();
            for row_data in sheet_rows_data.iter().skip(layout.data_start_row) {
                let row: Vec<String> = row_data
                    .iter()
                    .enumerate()
                    .map(|(col, data)| {
                        if col == layout.item_col {
                            cell_to_boq_item_string(data)
                        } else {
                            cell_to_string(data)
                        }
                    })
                    .collect();
                padded_rows.push(pad_row_cells(&row, header_width));
            }
            let probe_rows: Vec<MasterRow> = padded_rows
                .iter()
                .map(|cells| MasterRow {
                    cells: cells.clone(),
                    composite_key: String::new(),
                })
                .collect();
            let last_priced_detail = last_boq_priced_detail_row_index(&probe_rows, &layout_boq);
            let mut data_rows = Vec::new();
            for (row_index, padded) in padded_rows.into_iter().enumerate() {
                if options.keep_boq_description_only_rows
                    && !boq_row_should_keep(
                        &padded,
                        &layout_boq,
                        layout.item_col,
                        description_col,
                        row_index,
                        last_priced_detail,
                    )
                {
                    continue;
                }
                let item = padded.get(layout.item_col).cloned().unwrap_or_default();
                if !options.keep_boq_description_only_rows
                    && item.trim().is_empty()
                    && !row_looks_like_schedule_total_enhanced(
                        &padded,
                        description_col,
                        Some(layout.item_col),
                    )
                {
                    continue;
                }
                let unit_price_raw = padded.get(layout.unit_price_col).cloned().unwrap_or_default();
                let unit_price = parse_f64(&unit_price_raw).unwrap_or(0.0);
                let composite_key = build_composite_key(&item, unit_price);
                data_rows.push(MasterRow {
                    cells: padded,
                    composite_key,
                });
            }

            let total_price_col = find_boq_total_price_column(&layout.headers);
            sheets.insert(
                name.to_string(),
                MasterSheetState {
                    sheet_name: name.to_string(),
                    headers: layout.headers,
                    rows: data_rows,
                    period_columns: HashMap::new(),
                    item_col: layout.item_col,
                    description_col,
                    total_price_col,
                },
            );
        }
    }

    if sheets.is_empty() {
        let available = sheet_names.join(", ");
        let failed = if unreadable_schedule_sheets.is_empty() {
            "（无 Schedule1–4 工作表名）".to_string()
        } else {
            unreadable_schedule_sheets.join(", ")
        };
        return Err(anyhow!(
            "母表未解析出有效 Schedule 分表（须含 Item/Item No 与 Unit Price 表头，支持标题行/空行/双行表头）。未能读取: [{failed}]。工作簿内全部工作表: [{available}]"
        ));
    }

    let mut master = MasterWorkbookState { sheets };
    sanitize_master_workbook_item_cells(&mut master);
    Ok(master)
}

/// 工作表名是否表示 Schedule1–Schedule4（如 "Schedule1-USD"、"Bill - Schedule 3 - Iringa"）
pub fn is_schedule_sheet(name: &str) -> bool {
    schedule_sheet_number(name).is_some()
}

/// 从工作表名解析 Schedule 序号 1–4
pub fn schedule_sheet_number(name: &str) -> Option<u8> {
    let caps = schedule_sheet_name_re().captures(name)?;
    let digit: u8 = caps.get(1)?.as_str().parse().ok()?;
    if (1..=4).contains(&digit) {
        Some(digit)
    } else {
        None
    }
}

fn schedule_sheet_name_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?i)(?:schedule|sch)(?:\s|_|-)*([1-4])(?:\D|$)").unwrap())
}

fn schedule_digit_from_hint(hint: &str) -> Option<u8> {
    if let Some(d) = schedule_sheet_number(hint) {
        return Some(d);
    }
    let normalized = hint.to_lowercase().replace(' ', "");
    let re = schedule_only_digit_re();
    let caps = re.captures(&normalized)?;
    let digit: u8 = caps.get(1)?.as_str().parse().ok()?;
    if (1..=4).contains(&digit) {
        Some(digit)
    } else {
        None
    }
}

fn schedule_only_digit_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?i)^schedule0*(\d+)$").unwrap())
}

/// 步骤 2 清洗后的单行（与 `epc_ipc_cleaned/*.csv` 列一致）
#[derive(Debug, Clone, Default)]
pub struct CleanedIpcRow {
    pub item: String,
    pub description: String,
    pub unit: String,
    pub unit_price: f64,
    pub contract_total_qty: f64,
    pub previous_qty: f64,
    pub current_qty: f64,
    pub end_total_qty: f64,
    /// IPC 表「本期完成金额」列（CSV 列名 current_total_price）
    pub current_total: f64,
}

#[derive(Debug, Clone)]
pub struct IpcSheetAnalysis {
    pub sheet_name: String,
    pub rows: Vec<CleanedIpcRow>,
    /// 明细行本期完成金额之和（Current Total Price 合计）
    pub total_current_amount: f64,
    /// 从表头 [USD]/[TZS] 或文件名推断的货币代码
    pub currency: String,
    /// 步骤 2：表内单价×数量与本期金额不一致的行数（已跳过）
    pub row_validation_error_count: u32,
    /// 步骤 3：IPC 表 BOQ Value 汇总行金额（若有）
    pub boq_value_total: Option<f64>,
}

/// 步骤 3：明细合计与 BOQ Value 是否一致（无 BOQ Value 行时返回 None）
pub fn ipc_reconciliation_ok(analysis: &IpcSheetAnalysis) -> Option<bool> {
    analysis
        .boq_value_total
        .map(|boq| amounts_approx_equal(analysis.total_current_amount, boq))
}

/// 步骤 2：读取 IPC 表、表内逻辑自检与清洗（Item + Current Total Price）
pub fn analyze_ipc_workbook(
    ipc_path: &Path,
    schedule_hint: &str,
    period_column: &str,
) -> Result<IpcSheetAnalysis> {
    let mut workbook: Sheets<_> = open_workbook_auto(ipc_path)
        .with_context(|| format!("无法打开 IPC 文件 {}", ipc_path.display()))?;

    let sheet_name = resolve_ipc_sheet(&mut workbook, schedule_hint, period_column)?;
    let range = workbook
        .worksheet_range(&sheet_name)
        .with_context(|| format!("读取工作表 {sheet_name} 失败"))?;

    let sheet_rows_data: Vec<Vec<Data>> = range
        .rows()
        .map(|row| row.to_vec())
        .collect();
    let sheet_rows: Vec<Vec<String>> = sheet_rows_data
        .iter()
        .map(|row| row.iter().map(cell_to_string).collect())
        .collect();
    let (headers, data_start_row) = locate_ipc_merged_header(&sheet_rows, period_column)
        .ok_or_else(|| anyhow!(
            "IPC 表 {sheet_name} 无法识别表头：需合并多行表头（Item 常与 Current 不在同一行，如第 7 行 Item、第 8 行 Completion Progress 下的 Current）"
        ))?;

    let currency = find_ipc_currency(&headers, ipc_path);

    let item_col = find_item_column(&headers).ok_or_else(|| anyhow!("IPC 缺少 Item/No 列"))?;
    let description_col = find_description_column(&headers);
    let unit_col = find_unit_column(&headers);
    let unit_price_col = find_unit_price_column(&headers);
    let contract_qty_col = find_contract_total_qty_column(&headers);
    let previous_col = find_previous_qty_column(&headers);
    let current_col = find_current_column(&headers).ok_or_else(|| {
        anyhow!("IPC 缺少本期数量列（Current 或 Quantity，IPC002 等表使用 Quantity）")
    })?;
    let end_qty_col = find_end_total_qty_column(&headers);
    let current_total_col = find_current_total_column(&headers, period_column).ok_or_else(|| {
        anyhow!("IPC 缺少本期完成金额列（Current Total Price / Amount / 期数列如 IPC2）")
    })?;

    let mut cleaned = Vec::new();
    let mut row_errors: Vec<String> = Vec::new();
    let mut boq_value_checks: Vec<(usize, f64)> = Vec::new();

    for (row_idx, row_data) in sheet_rows_data.iter().skip(data_start_row).enumerate() {
        let row = &sheet_rows[data_start_row + row_idx];
        let item = row_data
            .get(item_col)
            .map(cell_to_boq_item_string)
            .unwrap_or_default();
        let excel_row = data_start_row + row_idx + 1;
        let current_total =
            parse_f64(&row.get(current_total_col).cloned().unwrap_or_default()).unwrap_or(0.0);

        if item.trim().is_empty() || is_ipc_summary_row(row, &item) {
            if row_contains_boq_value_label(row) && current_total.abs() > 0.0 {
                boq_value_checks.push((excel_row, current_total));
            }
            continue;
        }

        if !looks_like_ipc_item_code(&item) {
            continue;
        }

        let unit_price = unit_price_col
            .and_then(|col| parse_f64(&row.get(col).cloned().unwrap_or_default()))
            .unwrap_or(0.0);
        let current = parse_f64(&row.get(current_col).cloned().unwrap_or_default()).unwrap_or(0.0);

        let qty_amount_mismatch = unit_price.abs() > 1e-9
            && current.abs() > 1e-9
            && !amounts_approx_equal(current_total, unit_price * current);
        let amount_without_qty = unit_price.abs() <= 1e-9
            && current.abs() <= 1e-9
            && current_total.abs() <= 1e-9;
        if qty_amount_mismatch {
            row_errors.push(format!(
                "第 {excel_row} 行表内校验失败: 本期金额 {current_total} ≠ 单价×本期数量 ({:.2})",
                unit_price * current
            ));
            continue;
        }
        if amount_without_qty {
            continue;
        }

        cleaned.push(CleanedIpcRow {
            item,
            description: ipc_row_str(row, description_col),
            unit: ipc_row_str(row, unit_col),
            unit_price,
            contract_total_qty: ipc_row_f64(row, contract_qty_col),
            previous_qty: ipc_row_f64(row, previous_col),
            current_qty: current,
            end_total_qty: ipc_row_f64(row, end_qty_col),
            current_total,
        });
    }

    let boq_value_total = boq_value_checks.last().map(|(_, total)| *total);

    if cleaned.is_empty() {
        return Err(anyhow!(
            "IPC 表 {sheet_name} 未解析到有效数据行{}",
            if row_errors.is_empty() {
                String::new()
            } else {
                format!("（{} 处表内行级错误）", row_errors.len())
            }
        ));
    }

    let total_current_amount: f64 = cleaned.iter().map(|r| r.current_total).sum();

    Ok(IpcSheetAnalysis {
        sheet_name,
        rows: cleaned,
        total_current_amount,
        currency,
        row_validation_error_count: row_errors.len() as u32,
        boq_value_total,
    })
}

fn period_column_header_aliases(period: &str) -> Vec<String> {
    let mut aliases = vec![period.to_string(), period.to_uppercase()];
    for alias in ipc_period_header_aliases(period) {
        if !aliases.iter().any(|a| a.eq_ignore_ascii_case(&alias)) {
            aliases.push(alias);
        }
    }
    aliases
}

/// 复用母表已有 IPC 期数列，或追加新列
/// 非破坏性查找：期数列已存在则返回其索引，否则 None
fn sheet_has_period_column(sheet: &MasterSheetState, period: &str) -> Option<usize> {
    if let Some(&idx) = sheet.period_columns.get(period) {
        return Some(idx);
    }
    for (idx, header) in sheet.headers.iter().enumerate() {
        let normalized = normalize_header(header);
        for alias in period_column_header_aliases(period) {
            if normalized == normalize_header(&alias) {
                return Some(idx);
            }
        }
    }
    None
}

fn resolve_period_column_index(sheet: &mut MasterSheetState, period: &str) -> usize {
    if let Some(&idx) = sheet.period_columns.get(period) {
        return idx;
    }
    for (idx, header) in sheet.headers.iter().enumerate() {
        let normalized = normalize_header(header);
        for alias in period_column_header_aliases(period) {
            if normalized == normalize_header(&alias) {
                sheet.period_columns.insert(period.to_string(), idx);
                return idx;
            }
        }
    }
    ensure_period_column(sheet, period);
    *sheet
        .period_columns
        .get(period)
        .expect("period column just created")
}

fn build_master_row_indexes(
    rows: &[MasterRow],
    item_col: usize,
) -> (HashMap<String, usize>, HashMap<String, usize>) {
    let mut by_item: HashMap<String, usize> = HashMap::new();
    let mut by_composite: HashMap<String, usize> = HashMap::new();
    for (i, row) in rows.iter().enumerate() {
        by_composite.insert(row.composite_key.clone(), i);
        let item = row.cells.get(item_col).map(|s| s.as_str()).unwrap_or("");
        if item.trim().is_empty() {
            continue;
        }
        for key in boq_item_lookup_keys(item) {
            by_item.entry(key).or_insert(i);
        }
    }
    (by_item, by_composite)
}

fn find_master_row_index(
    ipc_row: &CleanedIpcRow,
    by_item: &HashMap<String, usize>,
    by_composite: &HashMap<String, usize>,
) -> Option<usize> {
    let composite = build_composite_key(&ipc_row.item, ipc_row.unit_price);
    if let Some(&idx) = by_composite.get(&composite) {
        return Some(idx);
    }
    for key in boq_item_lookup_keys(&ipc_row.item) {
        if let Some(&idx) = by_item.get(&key) {
            return Some(idx);
        }
    }
    None
}

fn row_text_looks_like_schedule_total(normalized: &str) -> bool {
    normalized.contains("totalschedule")
        || normalized.contains("grandtotal")
        || normalized.contains("boqvalue")
        || normalized.contains("subtotal")
        || (normalized.contains("schedule") && normalized.contains("total") && !normalized.contains("unit"))
        || normalized == "total"
}

fn row_looks_like_schedule_total(row: &[String]) -> bool {
    let joined = row
        .iter()
        .map(|c| clean_cell_text(c))
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join(" ");
    row_text_looks_like_schedule_total(&normalize_header(&joined))
}

fn row_looks_like_schedule_total_enhanced(
    row: &[String],
    description_col: Option<usize>,
    item_col: Option<usize>,
) -> bool {
    if let Some(col) = item_col {
        if let Some(cell) = row.get(col) {
            let text = clean_cell_text(cell);
            if !text.is_empty() && row_text_looks_like_schedule_total(&normalize_header(&text)) {
                return true;
            }
        }
    }
    if let Some(col) = description_col {
        if let Some(cell) = row.get(col) {
            let text = clean_cell_text(cell);
            if !text.is_empty() && row_text_looks_like_schedule_total(&normalize_header(&text)) {
                return true;
            }
        }
    }
    row_looks_like_schedule_total(row)
}

/// 明细行 Total Price 求和（排除 TOTAL SCHEDULE 合计行，避免与合计行重复计入）
fn sum_total_price_column(
    rows: &[MasterRow],
    total_price_col: usize,
    description_col: Option<usize>,
    item_col: Option<usize>,
) -> f64 {
    rows.iter()
        .filter(|r| {
            r.composite_key != format!("IPC_TOTAL|{total_price_col}")
                && !r.composite_key.starts_with("IPC_TOTAL|")
        })
        .filter(|r| !row_looks_like_schedule_total_enhanced(&r.cells, description_col, item_col))
        .filter_map(|r| r.cells.get(total_price_col))
        .filter_map(|v| parse_f64(v))
        .sum()
}

fn aligned_cell_locked(
    locks_ctx: Option<(&str, &[crate::data_overrides::AlignedCellLock])>,
    sheet_name: &str,
    row: usize,
    col: usize,
) -> bool {
    let Some((rel, locks)) = locks_ctx else {
        return false;
    };
    crate::data_overrides::is_aligned_cell_locked(locks, rel, sheet_name, row, col)
}

/// 重算母表明细行 Total Price 与合计行 IPC / Total Price 列（尊重修订层锁定单元格）
pub fn refresh_master_sheet_derived_cells(
    sheet: &mut MasterSheetState,
    locks_ctx: Option<(&str, &[crate::data_overrides::AlignedCellLock])>,
) {
    let unit_price_col = find_unit_price_column(&sheet.headers);
    let qty_col = find_contract_total_qty_column(&sheet.headers);
    let total_price_col = sheet.total_price_col;
    let ipc_period_cols: Vec<usize> = list_master_ipc_period_columns(&sheet.headers)
        .into_iter()
        .map(|(idx, _)| idx)
        .collect();
    let desc_col = sheet.description_col;
    let item_col = Some(sheet.item_col);

    if let (Some(up_col), Some(qty_col), Some(tp_col)) = (unit_price_col, qty_col, total_price_col)
    {
        for (row_idx, row) in sheet.rows.iter_mut().enumerate() {
            if row_looks_like_schedule_total(&row.cells) {
                continue;
            }
            if aligned_cell_locked(locks_ctx, &sheet.sheet_name, row_idx, tp_col) {
                continue;
            }
            let up_val = row.cells.get(up_col).and_then(|v| parse_f64(v));
            let qty_val = row.cells.get(qty_col).and_then(|v| parse_f64(v));
            if let (Some(up), Some(qty)) = (up_val, qty_val) {
                while row.cells.len() <= tp_col {
                    row.cells.push(String::new());
                }
                row.cells[tp_col] = format!("{:.2}", up * qty);
            }
        }
    }

    let mut last_total_idx: Option<usize> = None;
    for (i, row) in sheet.rows.iter().enumerate() {
        if row_looks_like_schedule_total(&row.cells) {
            last_total_idx = Some(i);
        }
    }
    let Some(last_total_idx) = last_total_idx else {
        return;
    };

    let sum_column = |rows: &[MasterRow], col: usize, skip_idx: usize| -> f64 {
        rows.iter()
            .enumerate()
            .filter(|(i, row)| {
                *i != skip_idx && !row_looks_like_schedule_total(&row.cells)
            })
            .filter_map(|(_, row)| row.cells.get(col))
            .filter_map(|v| parse_f64(v))
            .sum()
    };

    let mut period_sums: Vec<(usize, f64)> = Vec::new();
    for col in ipc_period_cols {
        if aligned_cell_locked(locks_ctx, &sheet.sheet_name, last_total_idx, col) {
            continue;
        }
        period_sums.push((col, sum_column(&sheet.rows, col, last_total_idx)));
    }

    let tp_sum = if let Some(tp_col) = total_price_col {
        if aligned_cell_locked(locks_ctx, &sheet.sheet_name, last_total_idx, tp_col) {
            None
        } else {
            Some((
                tp_col,
                sum_total_price_column(&sheet.rows, tp_col, desc_col, item_col),
            ))
        }
    } else {
        None
    };

    for (col, sum) in period_sums {
        let row = &mut sheet.rows[last_total_idx];
        while row.cells.len() <= col {
            row.cells.push(String::new());
        }
        row.cells[col] = format!("{:.2}", sum);
    }

    if let Some((tp_col, sum)) = tp_sum {
        let row = &mut sheet.rows[last_total_idx];
        while row.cells.len() <= tp_col {
            row.cells.push(String::new());
        }
        row.cells[tp_col] = format!("{:.2}", sum);
    }
}

/// 重算 aligned 母表全部工作表的衍生列
pub fn refresh_master_workbook_derivatives(
    master: &mut MasterWorkbookState,
    locks_ctx: Option<(&str, &[crate::data_overrides::AlignedCellLock])>,
) {
    for sheet in master.sheets.values_mut() {
        refresh_master_sheet_derived_cells(sheet, locks_ctx);
    }
}

/// 在母表最后一处合计行写入本期列总金额（TOTAL SCHEDULE / BOQ Value）；
/// 若无合计行则追加新行：item 列留空，description 列写“合计金额”，Total Price 列写合同总价合计。
fn write_period_column_total(
    sheet: &mut MasterSheetState,
    period_idx: usize,
    total: f64,
    revision_ctx: Option<&MergeRevisionContext<'_>>,
) {
    let total_str = format!("{:.2}", total);
    let mut last_total_idx: Option<usize> = None;
    for (i, row) in sheet.rows.iter().enumerate() {
        if row_looks_like_schedule_total(&row.cells) {
            last_total_idx = Some(i);
        }
    }
    if let Some(idx) = last_total_idx {
        let skip = revision_ctx.is_some_and(|ctx| {
            !ctx.ignore_revisions
                && crate::data_overrides::is_aligned_cell_locked(
                    ctx.aligned_locks,
                    ctx.output_master_relative,
                    &sheet.sheet_name,
                    idx,
                    period_idx,
                )
        });
        if skip {
            return;
        }
        let row = &mut sheet.rows[idx];
        while row.cells.len() <= period_idx {
            row.cells.push(String::new());
        }
        row.cells[period_idx] = total_str;
        return;
    }
    // 无合计行：追加新合计行，description 列用 "TOTAL SCHEDULEx"（x 为 sheet 序号）
    let schedule_label = match schedule_sheet_number(&sheet.sheet_name) {
        Some(n) => format!("TOTAL SCHEDULE{n}"),
        None => "TOTAL SCHEDULE".to_string(),
    };
    let max_col = period_idx.max(sheet.total_price_col.unwrap_or(0));
    let mut cells = vec![String::new(); max_col + 1];
    // item 列（列 0）留空
    if let Some(desc_col) = sheet.description_col {
        if desc_col < cells.len() {
            cells[desc_col] = schedule_label;
        }
    }
    cells[period_idx] = total_str;
    // Total Price 列求和
    if let Some(tp_col) = sheet.total_price_col {
        let tp_sum = sum_total_price_column(
            &sheet.rows,
            tp_col,
            sheet.description_col,
            Some(sheet.item_col),
        );
        if tp_col < cells.len() {
            cells[tp_col] = format!("{:.2}", tp_sum);
        }
    }
    sheet.rows.push(MasterRow {
        cells,
        composite_key: format!("IPC_TOTAL|{period_idx}"),
    });
}

/// 检查期数列数据是否已与 CSV 分析结果一致（用于跳过重复合并）
fn period_column_matches_analysis(
    sheet: &MasterSheetState,
    period_idx: usize,
    analysis: &IpcSheetAnalysis,
) -> bool {
    if analysis.rows.is_empty() {
        return false;
    }
    let (by_item, by_composite) = build_master_row_indexes(&sheet.rows, sheet.item_col);
    let mut matched = 0usize;
    for ipc_row in &analysis.rows {
        let Some(master_row_idx) = find_master_row_index(ipc_row, &by_item, &by_composite) else {
            return false;
        };
        let existing = sheet.rows[master_row_idx]
            .cells
            .get(period_idx)
            .map(|s| s.as_str())
            .unwrap_or("");
        let expected = format!("{:.2}", ipc_row.current_total);
        if existing.trim() != expected.as_str() {
            return false;
        }
        matched += 1;
    }
    matched == analysis.rows.len()
}

/// 工作 4 合并时尊重 aligned 单元格修订层
pub struct MergeRevisionContext<'a> {
    pub output_master_relative: &'a str,
    pub aligned_locks: &'a [crate::data_overrides::AlignedCellLock],
    pub ignore_revisions: bool,
}

/// 步骤 4：按 Item 将本期完成金额写入母表期数列，并更新合计行
pub fn apply_ipc_analysis_to_master(
    master: &mut MasterWorkbookState,
    analysis: &IpcSheetAnalysis,
    schedule_hint: &str,
    period_column: &str,
    schedule_digit: Option<u8>,
    revision_ctx: Option<&MergeRevisionContext<'_>>,
) -> Result<IpcMergeSummary> {
    let master_sheet = pick_master_sheet(master, schedule_hint, schedule_digit)?;
    let target_sheet = master_sheet.sheet_name.clone();

    // 如果期数列已存在且值与 CSV 完全一致，则跳过合并（用户误删 CSV 后重新生成的场景）
    let existing_period_idx = sheet_has_period_column(master_sheet, period_column);
    if let Some(period_idx) = existing_period_idx {
        if period_column_matches_analysis(master_sheet, period_idx, analysis) {
            let written_total: f64 = analysis.rows.iter().map(|r| r.current_total).sum();
            let matched_rows = analysis.rows.len() as u32;
            let period_label = master_sheet
                .headers
                .get(period_idx)
                .cloned()
                .unwrap_or_else(|| period_column.to_string());
            return Ok(IpcMergeSummary {
                target_sheet,
                period_column: period_label,
                matched_rows,
                unmatched_rows: 0,
                unmatched_items: vec![],
                written_total,
            });
        }
    }

    // 先全量匹配再写入：任何一行未匹配即整体失败，且不对母表做任何修改。
    // 否则失败的合并会残留空期数列、甚至把部分匹配行（如另一项目同名 Item）写进错误的母表。
    let (by_item, by_composite) =
        build_master_row_indexes(&master_sheet.rows, master_sheet.item_col);

    let mut row_targets: Vec<(usize, f64)> = Vec::new();
    let mut unmatched_rows = 0u32;
    let mut unmatched_items: Vec<String> = Vec::new();
    for ipc_row in &analysis.rows {
        match find_master_row_index(ipc_row, &by_item, &by_composite) {
            Some(idx) => row_targets.push((idx, ipc_row.current_total)),
            None => {
                unmatched_rows += 1;
                if unmatched_items.len() < 5 {
                    unmatched_items.push(ipc_row.item.clone());
                }
            }
        }
    }
    if unmatched_rows > 0 {
        let sample = unmatched_items.join("、");
        let more = if unmatched_rows as usize > unmatched_items.len() {
            "…"
        } else {
            ""
        };
        return Err(anyhow!(
            "{unmatched_rows} 行 Item 在母表 {target_sheet} 无匹配（{sample}{more}）"
        ));
    }

    let period_idx = resolve_period_column_index(master_sheet, period_column);
    let period_label = master_sheet
        .headers
        .get(period_idx)
        .cloned()
        .unwrap_or_else(|| period_column.to_string());

    let mut matched_rows = 0u32;
    let mut written_total = 0.0f64;
    for (master_row_idx, current_total) in row_targets {
        while master_sheet.rows[master_row_idx].cells.len() <= period_idx {
            master_sheet.rows[master_row_idx].cells.push(String::new());
        }
        let skip_write = revision_ctx.is_some_and(|ctx| {
            !ctx.ignore_revisions
                && crate::data_overrides::is_aligned_cell_locked(
                    ctx.aligned_locks,
                    ctx.output_master_relative,
                    &target_sheet,
                    master_row_idx,
                    period_idx,
                )
        });
        if !skip_write {
            master_sheet.rows[master_row_idx].cells[period_idx] =
                format!("{:.2}", current_total);
            written_total += current_total;
        }
        matched_rows += 1;
    }

    write_period_column_total(master_sheet, period_idx, written_total, revision_ctx);

    Ok(IpcMergeSummary {
        target_sheet,
        period_column: period_label,
        matched_rows,
        unmatched_rows: 0,
        unmatched_items,
        written_total,
    })
}

/// 分析 + 写入母表（供引擎流水线调用）
pub fn merge_ipc_into_master(
    master: &mut MasterWorkbookState,
    ipc_path: &Path,
    schedule_hint: &str,
    period_column: &str,
) -> Result<IpcSheetAnalysis> {
    let analysis = analyze_ipc_workbook(ipc_path, schedule_hint, period_column)?;
    apply_ipc_analysis_to_master(master, &analysis, schedule_hint, period_column, None, None)?;
    Ok(analysis)
}

fn pick_master_sheet_name(
    master: &MasterWorkbookState,
    schedule_hint: &str,
    schedule_digit: Option<u8>,
) -> Option<String> {
    if master.sheets.contains_key(schedule_hint) {
        return Some(schedule_hint.to_string());
    }
    let lower = schedule_hint.to_lowercase().replace(' ', "");
    for key in master.sheets.keys() {
        if key.to_lowercase().replace(' ', "") == lower {
            return Some(key.clone());
        }
    }
    let digit = schedule_digit.or_else(|| schedule_digit_from_hint(schedule_hint));
    if let Some(digit) = digit {
        for key in master.sheets.keys() {
            if schedule_sheet_number(key) == Some(digit) {
                return Some(key.clone());
            }
        }
    }
    master.sheets.keys().next().cloned()
}

fn pick_master_sheet<'a>(
    master: &'a mut MasterWorkbookState,
    schedule_hint: &str,
    schedule_digit: Option<u8>,
) -> Result<&'a mut MasterSheetState> {
    let name = pick_master_sheet_name(master, schedule_hint, schedule_digit)
        .ok_or_else(|| anyhow!("母表无可用 Schedule"))?;
    Ok(master.sheets.get_mut(&name).expect("sheet name just resolved"))
}

/// 已加载母表的目标分表是否存在该期数列且含有效数据。
/// 跳过判定用：aligned 母表被删除重建后期数列丢失时，须重新合并而非凭台账 SUCCESS 跳过。
pub fn master_state_has_period_data(
    master: &MasterWorkbookState,
    schedule_hint: &str,
    schedule_digit: Option<u8>,
    period: &str,
) -> bool {
    let Some(name) = pick_master_sheet_name(master, schedule_hint, schedule_digit) else {
        return false;
    };
    let sheet = &master.sheets[&name];
    let Some(idx) = sheet_has_period_column(sheet, period) else {
        return false;
    };
    period_column_has_data(sheet, idx)
}

fn resolve_ipc_sheet(
    workbook: &mut Sheets<impl std::io::Read + std::io::Seek>,
    schedule_hint: &str,
    period: &str,
) -> Result<String> {
    let names: Vec<String> = workbook.sheet_names().to_vec();
    if names.is_empty() {
        return Err(anyhow!("IPC 工作簿无工作表"));
    }

    let hint_key = schedule_hint.to_lowercase().replace(' ', "");
    if names.iter().any(|n| n == schedule_hint) {
        return Ok(schedule_hint.to_string());
    }
    for name in &names {
        if name.to_lowercase().replace(' ', "") == hint_key {
            return Ok(name.clone());
        }
    }

    let mut best_score = i32::MIN;
    let mut best_name = names[0].clone();
    for name in &names {
        let score = score_ipc_sheet(workbook, name, period);
        if score > best_score {
            best_score = score;
            best_name = name.clone();
        }
    }

    if best_score < 0 {
        return Err(anyhow!(
            "IPC 工作簿中无可用工程量数据表（需 Item、Quantity/Current、本期金额列；已跳过发票页）。工作表: [{}]",
            names.join(", ")
        ));
    }

    Ok(best_name)
}

fn ensure_period_column(sheet: &mut MasterSheetState, period: &str) {
    if sheet.period_columns.contains_key(period) {
        return;
    }
    let idx = sheet.headers.len();
    sheet.headers.push(period.to_string());
    sheet.period_columns.insert(period.to_string(), idx);
    for row in &mut sheet.rows {
        while row.cells.len() <= idx {
            row.cells.push(String::new());
        }
    }
}

/// 期数列是否含有效数据（空值、0、合计公式不算）
fn period_column_has_data(sheet: &MasterSheetState, idx: usize) -> bool {
    sheet.rows.iter().any(|row| {
        let Some(cell) = row.cells.get(idx) else {
            return false;
        };
        let t = cell.trim();
        if t.is_empty() || t.starts_with('=') {
            return false;
        }
        match parse_cell_number(t) {
            Some(v) => v.abs() > f64::EPSILON,
            // 非数字文本保守视为有效数据
            None => true,
        }
    })
}

/// 删除没有任何有效数据的 IPC 期数列（仅含空值、0 或合计公式）。
/// 旧版本失败的合并会在母表残留空期数列，写回前清理以免误导用户。
pub fn remove_empty_period_columns_in_sheet(sheet: &mut MasterSheetState) {
    let mut to_remove: Vec<usize> = list_master_ipc_period_columns(&sheet.headers)
        .into_iter()
        .map(|(idx, _)| idx)
        .filter(|&idx| idx > sheet.item_col)
        .filter(|&idx| !period_column_has_data(sheet, idx))
        .collect();
    if to_remove.is_empty() {
        return;
    }
    to_remove.sort_unstable_by(|a, b| b.cmp(a));
    for idx in to_remove {
        if idx < sheet.headers.len() {
            sheet.headers.remove(idx);
        }
        for row in &mut sheet.rows {
            if idx < row.cells.len() {
                row.cells.remove(idx);
            }
        }
        sheet.period_columns.retain(|_, v| *v != idx);
        for v in sheet.period_columns.values_mut() {
            if *v > idx {
                *v -= 1;
            }
        }
    }
}

/// 对工作簿所有分表清理残留空期数列
pub fn remove_empty_period_columns(master: &mut MasterWorkbookState) {
    for sheet in master.sheets.values_mut() {
        remove_empty_period_columns_in_sheet(sheet);
    }
}

/// 合同母表 stem（去掉 `_aligned` / `_aligned_{期号}` 后缀，避免 `BOQ_aligned` → `BOQ_aligned_aligned`）
pub fn contract_master_stem(path: &Path) -> String {
    let stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("master");
    if let Some(base) = stem.strip_suffix("_aligned") {
        return base.to_string();
    }
    if let Some(idx) = stem.find("_aligned_") {
        return stem[..idx].to_string();
    }
    stem.to_string()
}

/// 路径是否为 aligned 母表（`*_aligned.xlsx` 或历史 `*_aligned_*.xlsx`）
pub fn is_aligned_master_path(path: &Path) -> bool {
    let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else {
        return false;
    };
    let lower = stem.to_ascii_lowercase();
    lower.ends_with("_aligned") || lower.contains("_aligned_")
}

/// 固定 aligned 母表路径：`{合同 stem}_aligned.xlsx`（与当前路径是否已是 aligned 无关）
pub fn canonical_aligned_master_path(contract_master: &Path) -> PathBuf {
    let base = contract_master_stem(contract_master);
    let dir = contract_master
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    dir.join(format!("{base}_aligned.xlsx"))
}

/// 历史命名：`{base}_aligned_{period}.xlsx`，取同目录下修改时间最新的一份
fn find_latest_legacy_aligned_master(contract_master: &Path) -> Option<PathBuf> {
    let dir = contract_master.parent()?;
    let base = contract_master_stem(contract_master);
    let prefix = format!("{base}_aligned_");
    let canonical_name = format!("{base}_aligned.xlsx");

    let mut best: Option<(PathBuf, std::time::SystemTime)> = None;
    for entry in std::fs::read_dir(dir).ok()? {
        let entry = entry.ok()?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let name = path.file_name()?.to_str()?;
        if name == canonical_name {
            continue;
        }
        if !name.starts_with(&prefix) || !name.ends_with(".xlsx") {
            continue;
        }
        let modified = path.metadata().ok()?.modified().ok()?;
        if best
            .as_ref()
            .map(|(_, t)| modified > *t)
            .unwrap_or(true)
        {
            best = Some((path, modified));
        }
    }
    best.map(|(p, _)| p)
}

/// 磁盘上是否存在可继续追加列的 aligned 母表（canonical 或最新 legacy）
pub fn aligned_master_available(contract_master: &Path) -> bool {
    let canonical = canonical_aligned_master_path(contract_master);
    if canonical.is_file() {
        return true;
    }
    find_latest_legacy_aligned_master(contract_master).is_some()
}

/// 本次合并应读取的母表路径，以及写回路径（始终写入 `{合同stem}_aligned.xlsx`）
pub fn resolve_master_merge_paths(contract_master: &Path) -> (PathBuf, PathBuf) {
    let canonical = canonical_aligned_master_path(contract_master);

    let load = if canonical.exists() {
        canonical.clone()
    } else if is_aligned_master_path(contract_master) && contract_master.is_file() {
        contract_master.to_path_buf()
    } else if let Some(legacy) = find_latest_legacy_aligned_master(contract_master) {
        legacy
    } else {
        contract_master.to_path_buf()
    };

    (load, canonical)
}

/// 估算单元格显示宽度（Excel 列宽单位，偏保守）
fn estimate_cell_display_width(text: &str) -> f64 {
    let t = text.trim();
    if t.is_empty() {
        return 0.0;
    }
    let mut units = 0.0f64;
    for ch in t.chars() {
        units += if ch.is_ascii() { 1.0 } else { 2.0 };
    }
    (units * 1.08 + 2.0).min(72.0)
}

/// 按 BOQ 表头类型与列内容计算列宽
fn compute_boq_column_width(header: &str, column_values: &[&str]) -> f64 {
    let n = normalize_header(header);
    let (min_w, max_w) = if is_description_header(&n) {
        (30.0, 62.0)
    } else if is_item_header(&n) {
        (8.0, 14.0)
    } else if is_unit_of_measure_header(&n) {
        (6.0, 10.0)
    } else if is_unit_price_header(&n) || is_boq_total_price_header(&n) {
        (12.0, 18.0)
    } else if is_contract_total_qty_header(&n)
        || is_previous_qty_header(&n)
        || is_end_total_qty_header(&n)
        || is_current_qty_header(&n)
    {
        (10.0, 16.0)
    } else if n.contains("ipc") {
        (11.0, 16.0)
    } else {
        (10.0, 24.0)
    };

    let content_w = column_values
        .iter()
        .map(|s| estimate_cell_display_width(s))
        .fold(0.0f64, f64::max);
    content_w.clamp(min_w, max_w)
}

fn apply_master_sheet_column_layout(
    worksheet: &mut Worksheet,
    sheet_state: &MasterSheetState,
) -> Result<()> {
    let col_count = sheet_state.headers.len();
    for col in 0..col_count {
        let header = sheet_state.headers.get(col).map(|s| s.as_str()).unwrap_or("");
        let mut samples: Vec<&str> = vec![header];
        for row in &sheet_state.rows {
            if let Some(cell) = row.cells.get(col) {
                samples.push(cell.as_str());
            }
        }
        let width = compute_boq_column_width(header, &samples);
        worksheet.set_column_width(col as u16, width)?;
    }
    worksheet.set_freeze_panes(1, 0)?;
    worksheet.set_zoom(90);
    Ok(())
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

fn write_sum_formula_for_column(
    worksheet: &mut Worksheet,
    excel_row: u32,
    col_u16: u16,
    col_index: usize,
    first_data_excel_row: u32,
    excel_row_1based: u32,
    cell_format: &Format,
) -> Result<()> {
    if excel_row_1based <= first_data_excel_row {
        return Ok(());
    }
    let last_data_row = excel_row_1based - 1;
    let col_name = excel_col_name(col_index);
    let formula = format!(
        "=SUM({}{}:{}{})",
        col_name, first_data_excel_row, col_name, last_data_row
    );
    worksheet.write_formula_with_format(excel_row, col_u16, formula.as_str(), cell_format)?;
    Ok(())
}

fn write_formatted_master_sheet(
    worksheet: &mut Worksheet,
    sheet_state: &MasterSheetState,
    header_format: &Format,
    amount_format: &Format,
    qty_format: &Format,
    qty_integer_format: &Format,
    unit_center_format: &Format,
    item_text_format: &Format,
    text_format: &Format,
    desc_format: &Format,
    total_format: &Format,
) -> Result<()> {
    worksheet.set_name(&sheet_state.sheet_name)?;
    worksheet.set_row_height(0, 18)?;

    let desc_col = sheet_state.description_col;
    let unit_col = find_unit_column(&sheet_state.headers);
    let unit_price_col = find_unit_price_column(&sheet_state.headers);
    let qty_col = find_contract_total_qty_column(&sheet_state.headers);
    let total_price_col = sheet_state.total_price_col;
    let ipc_period_cols: Vec<usize> = list_master_ipc_period_columns(&sheet_state.headers)
        .into_iter()
        .map(|(idx, _)| idx)
        .collect();
    let first_data_excel_row: u32 = 2;

    for (col, header) in sheet_state.headers.iter().enumerate() {
        worksheet.write_string_with_format(0, col as u16, header, header_format)?;
    }

    for (row_idx, row) in sheet_state.rows.iter().enumerate() {
        let excel_row = (row_idx + 1) as u32;
        let excel_row_1based = excel_row + 1;
        let is_total = row_looks_like_schedule_total(&row.cells);

        for (col, value) in row.cells.iter().enumerate() {
            let col_u16 = col as u16;
            let header = sheet_state.headers.get(col).map(|s| s.as_str()).unwrap_or("");
            let thousand_sep_col = column_wants_thousand_separator(header);
            let is_item_col = col == sheet_state.item_col;
            let is_qty_col = qty_col == Some(col);
            let is_unit_col = unit_col == Some(col);
            let cell_format = if is_total {
                total_format
            } else if is_item_col {
                item_text_format
            } else if desc_col == Some(col) {
                desc_format
            } else if thousand_sep_col {
                amount_format
            } else if is_qty_col {
                parse_cell_number(value)
                    .filter(|n| boq_qty_is_integer(*n))
                    .map(|_| qty_integer_format)
                    .unwrap_or(qty_format)
            } else if is_unit_col {
                unit_center_format
            } else if parse_cell_number(value).is_some() {
                qty_format
            } else {
                text_format
            };

            if is_total
                && (total_price_col == Some(col) || ipc_period_cols.contains(&col))
                && excel_row_1based > first_data_excel_row
            {
                write_sum_formula_for_column(
                    worksheet,
                    excel_row,
                    col_u16,
                    col,
                    first_data_excel_row,
                    excel_row_1based,
                    cell_format,
                )?;
                continue;
            }

            if !is_total
                && total_price_col == Some(col)
                && unit_price_col.is_some()
                && qty_col.is_some()
            {
                let up = unit_price_col.unwrap();
                let qc = qty_col.unwrap();
                let up_val = row.cells.get(up).and_then(|v| parse_cell_number(v));
                let qty_val = row.cells.get(qc).and_then(|v| parse_cell_number(v));
                if up_val.is_some() && qty_val.is_some() {
                    let formula = format!(
                        "={}{}*{}{}",
                        excel_col_name(up),
                        excel_row_1based,
                        excel_col_name(qc),
                        excel_row_1based
                    );
                    worksheet.write_formula_with_format(excel_row, col_u16, formula.as_str(), cell_format)?;
                    continue;
                }
            }

            if is_item_col {
                let display = format_boq_item_number(value);
                worksheet.write_string_with_format(excel_row, col_u16, &display, cell_format)?;
            } else if value.trim().is_empty() {
                worksheet.write_string_with_format(excel_row, col_u16, value, cell_format)?;
            } else if let Some(num) = parse_cell_number(value) {
                worksheet.write_number_with_format(excel_row, col_u16, num, cell_format)?;
            } else {
                worksheet.write_string_with_format(excel_row, col_u16, value, cell_format)?;
            }
        }
    }

    apply_master_sheet_column_layout(worksheet, sheet_state)
}

pub fn write_master_workbook(
    state: &MasterWorkbookState,
    original_master: &Path,
    output_path: &Path,
) -> Result<PathBuf> {
    // 仅对合同原始母表做一次性备份，aligned 结果文件不写 .bak
    if !is_aligned_master_path(original_master) {
        let backup = original_master.with_extension("xlsx.bak");
        if original_master.exists() && !backup.exists() {
            std::fs::copy(original_master, &backup)?;
        }
    }

    let out_path = output_path.to_path_buf();

    let mut workbook = Workbook::new();
    let header_format = Format::new()
        .set_bold()
        .set_background_color(Color::RGB(0xD9E1F2))
        .set_align(FormatAlign::Center)
        .set_align(FormatAlign::VerticalCenter)
        .set_border(FormatBorder::Thin);
    /// 单价、Total Price、IPC 期数列：千分位 + 两位小数
    let amount_format = Format::new()
        .set_num_format("#,##0.00")
        .set_align(FormatAlign::Right)
        .set_border(FormatBorder::Thin);
    /// 数量类列：小数保留两位，居中
    let qty_format = Format::new()
        .set_num_format("#,##0.00")
        .set_align(FormatAlign::Center)
        .set_align(FormatAlign::VerticalCenter)
        .set_border(FormatBorder::Thin);
    /// Est. Qty 等为整数时不带小数位，居中
    let qty_integer_format = Format::new()
        .set_num_format("#,##0")
        .set_align(FormatAlign::Center)
        .set_align(FormatAlign::VerticalCenter)
        .set_border(FormatBorder::Thin);
    let unit_center_format = Format::new()
        .set_align(FormatAlign::Center)
        .set_align(FormatAlign::VerticalCenter)
        .set_border(FormatBorder::Thin);
    /// Item 列：Excel 文本格式，保留 1.10 等层级编号
    let item_text_format = Format::new()
        .set_num_format("@")
        .set_border(FormatBorder::Thin);
    let text_format = Format::new().set_border(FormatBorder::Thin);
    let desc_format = Format::new()
        .set_text_wrap()
        .set_align(FormatAlign::Top)
        .set_border(FormatBorder::Thin);
    let total_format = Format::new()
        .set_bold()
        .set_num_format("#,##0.00")
        .set_background_color(Color::RGB(0xFFF2CC))
        .set_border(FormatBorder::Thin);

    for sheet_state in state.sheets.values() {
        let worksheet = workbook.add_worksheet();
        write_formatted_master_sheet(
            worksheet,
            sheet_state,
            &header_format,
            &amount_format,
            &qty_format,
            &qty_integer_format,
            &unit_center_format,
            &item_text_format,
            &text_format,
            &desc_format,
            &total_format,
        )?;
    }

    workbook.save(&out_path)?;
    Ok(out_path)
}

/// 母表表头中的 IPC 期数列（如 IPC007、IPC004、IPC8），不含 Current Total 等子列
pub fn list_master_ipc_period_columns(headers: &[String]) -> Vec<(usize, String)> {
    let mut out = Vec::new();
    for (idx, header) in headers.iter().enumerate() {
        if let Some(label) = ipc_period_label_from_header(header) {
            out.push((idx, label));
        }
    }
    out
}

fn ipc_period_label_from_header(header: &str) -> Option<String> {
    let n = normalize_header(header);
    if !n.starts_with("ipc") {
        return None;
    }
    if n.contains("total")
        || n.contains("current")
        || n.contains("price")
        || n.contains("qty")
        || n.contains("quantity")
        || n.contains("contract")
    {
        return None;
    }
    let caps = ipc_period_label_re().captures(header.trim())?;
    Some(format!("IPC{}", caps.get(1)?.as_str()))
}

fn ipc_period_label_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?i)ipc\s*_?\s*(\d+)").unwrap())
}

/// Total Price 列自底向上首个有效金额（合同 BOQ 总价，供 project_ipc_data.boq_amount）
pub fn schedule_total_price_bottom(rows: &[MasterRow], total_price_col: usize) -> Option<f64> {
    for row in rows.iter().rev() {
        let value = row.cells.get(total_price_col)?;
        if let Some(amount) = parse_f64(value) {
            if amount.abs() > f64::EPSILON {
                return Some(amount);
            }
        }
    }
    None
}

fn boq_amount_on_schedule_total_row(
    rows: &[MasterRow],
    col: usize,
    description_col: Option<usize>,
    item_col: Option<usize>,
) -> Option<f64> {
    let mut last: Option<f64> = None;
    for row in rows {
        if !row_looks_like_schedule_total_enhanced(&row.cells, description_col, item_col) {
            continue;
        }
        if let Some(v) = row.cells.get(col).and_then(|c| parse_f64(c)) {
            last = Some(v);
        }
    }
    last.filter(|v| v.abs() > f64::EPSILON)
}

/// 明细行 Unit Price × Est. Qty（aligned 合计行 Total Price 常为 SUM 公式，无缓存时 calamine 读不到）
fn sum_boq_from_unit_times_qty(sheet: &MasterSheetState) -> Option<f64> {
    let unit_col = find_unit_price_column(&sheet.headers)?;
    let qty_col = find_contract_total_qty_column(&sheet.headers)?;
    let desc_col = sheet.description_col;
    let item_col = Some(sheet.item_col);
    let total: f64 = sheet
        .rows
        .iter()
        .filter(|r| !row_looks_like_schedule_total_enhanced(&r.cells, desc_col, item_col))
        .filter_map(|r| {
            let up = parse_f64(r.cells.get(unit_col)?)?;
            let qty = parse_f64(r.cells.get(qty_col)?)?;
            Some(up * qty)
        })
        .sum();
    if total.abs() > f64::EPSILON {
        Some(total)
    } else {
        None
    }
}

/// Schedule 母表合同总价（BOQ Total Price）：优先合计行；无合计行数值时再明细求和或 Unit×Qty
pub fn schedule_boq_amount_for_sheet(sheet: &MasterSheetState) -> Option<f64> {
    let desc_col = sheet.description_col;
    let item_col = Some(sheet.item_col);
    let candidates = boq_total_price_column_candidates(&sheet.headers, sheet.total_price_col);
    let mut from_total_row: Option<f64> = None;
    let mut push_total_row = |value: Option<f64>| {
        if let Some(v) = value {
            if v.abs() > f64::EPSILON {
                from_total_row = Some(from_total_row.map(|b| b.max(v)).unwrap_or(v));
            }
        }
    };

    for col in &candidates {
        push_total_row(boq_amount_on_schedule_total_row(
            &sheet.rows, *col, desc_col, item_col,
        ));
    }
    if from_total_row.is_some() {
        return from_total_row;
    }

    let mut best: Option<f64> = None;
    let mut push = |value: Option<f64>| {
        if let Some(v) = value {
            if v.abs() > f64::EPSILON {
                best = Some(best.map(|b| b.max(v)).unwrap_or(v));
            }
        }
    };
    for col in &candidates {
        let sum = sum_total_price_column(&sheet.rows, *col, desc_col, item_col);
        if sum.abs() > f64::EPSILON {
            push(Some(sum));
        }
    }
    push(sum_boq_from_unit_times_qty(sheet));
    best
}

/// 期数金额候选列：主 IPC 列 →「IPC00x Current Total」子列 → Current Total 别名列
fn ipc_period_amount_column_candidates(
    headers: &[String],
    period_col: usize,
    period_label: &str,
) -> Vec<usize> {
    let mut out = Vec::new();
    let mut seen = std::collections::HashSet::new();
    let mut push = |col: usize| {
        if seen.insert(col) {
            out.push(col);
        }
    };
    push(period_col);
    if let Some(col) = find_ipc_current_total_subcolumn(headers, period_label) {
        push(col);
    }
    if let Some(col) = find_current_total_column(headers, period_label) {
        push(col);
    }
    out
}

/// 表头形如「IPC007 Current Total」「IPC8 Current Total Price」
fn find_ipc_current_total_subcolumn(headers: &[String], period_label: &str) -> Option<usize> {
    let period_num = ipc_period_label_re()
        .captures(period_label.trim())?
        .get(1)?
        .as_str();
    headers.iter().position(|h| {
        let n = normalize_header(h);
        if !n.contains("total") {
            return false;
        }
        ipc_period_label_re()
            .captures(h.trim())
            .and_then(|c| c.get(1))
            .map(|m| m.as_str() == period_num)
            .unwrap_or(false)
    })
}

fn last_total_row_amount(
    rows: &[MasterRow],
    period_col: usize,
    description_col: Option<usize>,
    item_col: Option<usize>,
) -> Option<f64> {
    let mut last: Option<f64> = None;
    for row in rows {
        if row_looks_like_schedule_total_enhanced(&row.cells, description_col, item_col) {
            if let Some(v) = row.cells.get(period_col) {
                last = parse_f64(v);
            }
        }
    }
    last
}

fn sum_ipc_period_detail_amounts(
    rows: &[MasterRow],
    period_col: usize,
    description_col: Option<usize>,
    item_col: Option<usize>,
) -> f64 {
    rows.iter()
        .filter(|r| !row_looks_like_schedule_total_enhanced(&r.cells, description_col, item_col))
        .filter_map(|r| r.cells.get(period_col))
        .filter_map(|v| parse_f64(v))
        .sum()
}

fn schedule_ipc_period_total_at_col(
    rows: &[MasterRow],
    period_col: usize,
    description_col: Option<usize>,
    item_col: Option<usize>,
) -> Option<f64> {
    if let Some(v) = last_total_row_amount(rows, period_col, description_col, item_col) {
        if v.abs() > f64::EPSILON {
            return Some(v);
        }
    }
    let sum = sum_ipc_period_detail_amounts(rows, period_col, description_col, item_col);
    if sum.abs() > f64::EPSILON {
        return Some(sum);
    }
    last_total_row_amount(rows, period_col, description_col, item_col)
}

/// 从 Schedule 母表读取指定期数 IPC 金额（合计行优先，兼容 Current Total 子列）
pub fn schedule_ipc_period_total_for_sheet(
    sheet: &MasterSheetState,
    period_col: usize,
    period_label: &str,
) -> Option<f64> {
    let desc_col = sheet.description_col;
    let item_col = Some(sheet.item_col);
    for col in ipc_period_amount_column_candidates(&sheet.headers, period_col, period_label) {
        if let Some(amount) = schedule_ipc_period_total_at_col(&sheet.rows, col, desc_col, item_col) {
            if amount.abs() > f64::EPSILON {
                return Some(amount);
            }
        }
    }
    None
}

/// Schedule 合计行（TOTAL SCHEDULE / BOQ Value）上指定期数列的金额
pub fn schedule_ipc_period_total(rows: &[MasterRow], period_col: usize) -> Option<f64> {
    schedule_ipc_period_total_at_col(rows, period_col, None, Some(0))
}

/// 从工作表名、文件名、表头识别货币（表头 Unit Price 行的 [USD] 子行不能覆盖分表 TZS）
pub fn currency_for_master_sheet(sheet: &MasterSheetState, workbook_path: &Path) -> String {
    if let Some(code) = currency_token_in_text(&sheet.sheet_name) {
        return code;
    }
    if let Some(name) = workbook_path.file_name().and_then(|s| s.to_str()) {
        if let Some(code) = currency_token_in_text(name) {
            return code;
        }
    }
    find_ipc_currency(&sheet.headers, workbook_path)
}

fn currency_token_in_text(text: &str) -> Option<String> {
    let upper = text.to_uppercase();
    for code in ["TZS", "USD", "EUR", "CNY", "GBP"] {
        if upper.contains(code) {
            return Some(code.to_string());
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn schedule_sheet_name_matches_flexible_labels() {
        for name in [
            "Schedule1",
            "Schedule1-USD",
            "Schedule 1 USD",
            "Schedule1USD",
            "Schedule 1 - USD",
            "Schedule2-TZS",
            "Schedule3_EUR",
            "SCHEDULE 4",
            "Prefix_Schedule2_suffix",
            "Bill - Schedule 3 - Iringa",
            "SCH Schedule1 Summary",
        ] {
            assert!(is_schedule_sheet(name), "expected match: {name}");
        }
        assert_eq!(schedule_sheet_number("Schedule1-USD"), Some(1));
        assert_eq!(schedule_sheet_number("Bill - Schedule 3 - Iringa"), Some(3));
        assert!(!is_schedule_sheet("BOQ"));
        assert!(!is_schedule_sheet("Summary"));
        assert!(!is_schedule_sheet("Schedule5"));
        assert!(!is_schedule_sheet("Scheduled Tasks"));
        assert!(!is_schedule_sheet("Schedule10"));
        assert!(is_schedule_sheet("SCH2-BOQ"));
        assert_eq!(schedule_sheet_number("SCH2-BOQ"), Some(2));
    }

    #[test]
    fn format_boq_item_from_float_uses_hierarchical_segments() {
        assert_eq!(format_boq_item_from_float(20.0), "20");
        assert_eq!(format_boq_item_from_float(20.1), "20.1");
        assert_eq!(format_boq_item_from_float(20.2), "20.2");
        assert_eq!(format_boq_item_from_float(20.9), "20.9");
        assert_eq!(format_boq_item_from_float(20.11), "20.11");
        assert_eq!(format_boq_item_from_float(1.1), "1.1");
    }

    #[test]
    fn refine_boq_item_promotes_truncated_float_segments_from_neighbors() {
        assert_eq!(
            refine_boq_item_display_in_sequence("20.1", Some("20.9"), Some("20.11")),
            "20.10"
        );
        assert_eq!(
            refine_boq_item_display_in_sequence("20.2", Some("20.19"), Some("20.21")),
            "20.20"
        );
        assert_eq!(
            refine_boq_item_display_in_sequence("20.3", Some("20.29"), Some("20.31")),
            "20.30"
        );
        assert_eq!(
            refine_boq_item_display_in_sequence("20.4", Some("20.39"), Some("20.41")),
            "20.40"
        );
        assert_eq!(
            refine_boq_item_display_in_sequence("20.5", Some("20.49"), Some("20.51")),
            "20.50"
        );
        assert_eq!(
            refine_boq_item_display_in_sequence("20.9", Some("20.89"), Some("20.91")),
            "20.90"
        );
        assert_eq!(
            refine_boq_item_display_in_sequence(
                &format_boq_item_from_float(20.3),
                Some("20.29"),
                Some("20.31"),
            ),
            "20.30"
        );
        assert_eq!(
            refine_boq_item_display_in_sequence(
                &format_boq_item_from_float(20.4),
                Some("20.39"),
                Some("20.41"),
            ),
            "20.40"
        );
        assert_eq!(
            refine_boq_item_display_in_sequence("20.1", Some("20"), Some("20.2")),
            "20.1"
        );
        assert_eq!(
            refine_boq_item_display_in_sequence("20.2", Some("20.1"), Some("20.3")),
            "20.2"
        );
        assert_eq!(
            refine_boq_item_display_in_sequence("20.1", Some("20.9"), Some("20.2")),
            "20.1"
        );
    }

    #[test]
    fn refine_promotes_30_1_to_30_10_after_30_9_2() {
        assert_eq!(
            refine_boq_item_display_in_sequence("30.1", Some("30.9.2"), Some("30.11")),
            "30.10"
        );
        assert_eq!(
            refine_boq_item_display_in_sequence(
                &format_boq_item_from_float(30.1),
                Some("30.9.2"),
                Some("30.11"),
            ),
            "30.10"
        );
    }

    #[test]
    fn compare_boq_item_number_orders_n1_through_n10() {
        use std::cmp::Ordering;
        let seq = ["20", "20.1", "20.2", "20.9", "20.10", "20.11"];
        for w in seq.windows(2) {
            assert_eq!(
                compare_boq_item_number(w[0], w[1]),
                Ordering::Less,
                "{} should be before {}",
                w[0],
                w[1]
            );
        }
    }

    #[test]
    fn normalize_for_format_preserves_description_row_position() {
        let mut sheet = MasterSheetState {
            sheet_name: "Schedule1".into(),
            headers: vec![
                "Item".into(),
                "Description".into(),
                "Unit".into(),
                "Est. Qty".into(),
                "Unit Price".into(),
                "Total Price".into(),
            ],
            rows: vec![
                MasterRow {
                    cells: vec![
                        "1.9".into(),
                        "A".into(),
                        "ea.".into(),
                        "1".into(),
                        "1".into(),
                        "1".into(),
                    ],
                    composite_key: "a".into(),
                },
                MasterRow {
                    cells: vec![
                        "".into(),
                        "Section title".into(),
                        "".into(),
                        "".into(),
                        "".into(),
                        "".into(),
                    ],
                    composite_key: "b".into(),
                },
                MasterRow {
                    cells: vec![
                        "1.10".into(),
                        "B".into(),
                        "ea.".into(),
                        "1".into(),
                        "1".into(),
                        "1".into(),
                    ],
                    composite_key: "c".into(),
                },
            ],
            period_columns: HashMap::new(),
            item_col: 0,
            description_col: Some(1),
            total_price_col: Some(5),
        };
        normalize_contract_boq_sheet_for_format(&mut sheet);
        assert_eq!(sheet.rows[0].cells[0], "1.9");
        assert_eq!(sheet.rows[1].cells[1], "Section title");
        assert_eq!(sheet.rows[2].cells[0], "1.10");
    }

    #[test]
    fn normalize_refines_float_20_2_to_20_20_between_20_19_and_20_21() {
        let mut sheet = MasterSheetState {
            sheet_name: "Schedule1".into(),
            headers: vec![
                "Item".into(),
                "Description".into(),
                "Unit".into(),
                "Est. Qty".into(),
                "Unit Price".into(),
                "Total Price".into(),
            ],
            rows: vec![
                MasterRow {
                    cells: vec![
                        "20.19".into(),
                        "nineteen".into(),
                        "ea.".into(),
                        "1".into(),
                        "1".into(),
                        "1".into(),
                    ],
                    composite_key: "a".into(),
                },
                MasterRow {
                    cells: vec![
                        format_boq_item_from_float(20.2),
                        "twenty".into(),
                        "ea.".into(),
                        "1".into(),
                        "2".into(),
                        "2".into(),
                    ],
                    composite_key: "b".into(),
                },
                MasterRow {
                    cells: vec![
                        "20.21".into(),
                        "twenty-one".into(),
                        "ea.".into(),
                        "1".into(),
                        "3".into(),
                        "3".into(),
                    ],
                    composite_key: "c".into(),
                },
            ],
            period_columns: HashMap::new(),
            item_col: 0,
            description_col: Some(1),
            total_price_col: Some(5),
        };
        normalize_contract_boq_sheet_for_format(&mut sheet);
        assert_eq!(sheet.rows[1].cells[0], "20.20");
    }

    #[test]
    fn normalize_refines_float_20_1_to_20_10_between_20_9_and_20_11() {
        let mut sheet = MasterSheetState {
            sheet_name: "Schedule1".into(),
            headers: vec![
                "Item".into(),
                "Description".into(),
                "Unit".into(),
                "Est. Qty".into(),
                "Unit Price".into(),
                "Total Price".into(),
            ],
            rows: vec![
                MasterRow {
                    cells: vec![
                        format_boq_item_from_float(20.9),
                        "nine".into(),
                        "ea.".into(),
                        "1".into(),
                        "1".into(),
                        "1".into(),
                    ],
                    composite_key: "a".into(),
                },
                MasterRow {
                    cells: vec![
                        format_boq_item_from_float(20.1),
                        "ten".into(),
                        "ea.".into(),
                        "1".into(),
                        "2".into(),
                        "2".into(),
                    ],
                    composite_key: "b".into(),
                },
                MasterRow {
                    cells: vec![
                        format_boq_item_from_float(20.11),
                        "eleven".into(),
                        "ea.".into(),
                        "1".into(),
                        "3".into(),
                        "3".into(),
                    ],
                    composite_key: "c".into(),
                },
            ],
            period_columns: HashMap::new(),
            item_col: 0,
            description_col: Some(1),
            total_price_col: Some(5),
        };
        let stats = normalize_contract_boq_sheet_for_format(&mut sheet);
        assert_eq!(stats.dropped_duplicate, 0);
        assert_eq!(sheet.rows.len(), 3);
        assert_eq!(sheet.rows[0].cells[0], "20.9");
        assert_eq!(sheet.rows[1].cells[0], "20.10");
        assert_eq!(sheet.rows[2].cells[0], "20.11");
    }

    #[test]
    fn normalize_keeps_distinct_rows_when_item_float_collides() {
        let mut sheet = MasterSheetState {
            sheet_name: "Schedule1".into(),
            headers: vec![
                "Item".into(),
                "Description".into(),
                "Unit".into(),
                "Est. Qty".into(),
                "Unit Price".into(),
                "Total Price".into(),
            ],
            rows: vec![
                MasterRow {
                    cells: vec![
                        "20.1".into(),
                        "first".into(),
                        "ea.".into(),
                        "1".into(),
                        "1".into(),
                        "1".into(),
                    ],
                    composite_key: "a".into(),
                },
                MasterRow {
                    cells: vec![
                        format_boq_item_from_float(20.1),
                        "tenth".into(),
                        "ea.".into(),
                        "1".into(),
                        "2".into(),
                        "2".into(),
                    ],
                    composite_key: "b".into(),
                },
            ],
            period_columns: HashMap::new(),
            item_col: 0,
            description_col: Some(1),
            total_price_col: Some(5),
        };
        let stats = normalize_contract_boq_sheet_for_format(&mut sheet);
        assert_eq!(stats.dropped_duplicate, 0);
        assert_eq!(sheet.rows.len(), 2);
        assert_eq!(sheet.rows[0].cells[0], "20.1");
        assert_eq!(sheet.rows[1].cells[0], "20.1");
    }

    #[test]
    fn boq_description_row_should_keep_accepts_equipment_title() {
        let row = vec![
            "".into(),
            "GIS Substation Equipment".into(),
            "".into(),
            "".into(),
        ];
        assert!(boq_description_row_should_keep(&row, Some(1), 0));
    }

    #[test]
    fn normalize_contract_boq_sheet_keeps_empty_item_with_description() {
        let mut sheet = MasterSheetState {
            sheet_name: "Schedule1".into(),
            headers: vec![
                "Item".into(),
                "Description".into(),
                "Unit".into(),
                "Est. Qty".into(),
                "Unit Price".into(),
                "Total Price".into(),
            ],
            rows: vec![
                MasterRow {
                    cells: vec![
                        "".into(),
                        "GIS Equipment".into(),
                        "".into(),
                        "".into(),
                        "".into(),
                        "".into(),
                    ],
                    composite_key: "x".into(),
                },
                MasterRow {
                    cells: vec![
                        "1.9".into(),
                        "Item A".into(),
                        "m".into(),
                        "1".into(),
                        "10".into(),
                        "10".into(),
                    ],
                    composite_key: "1.9|10".into(),
                },
                MasterRow {
                    cells: vec![
                        "1.10".into(),
                        "Item B".into(),
                        "m".into(),
                        "2".into(),
                        "10".into(),
                        "20".into(),
                    ],
                    composite_key: "1.10|10".into(),
                },
            ],
            period_columns: HashMap::new(),
            item_col: 0,
            description_col: Some(1),
            total_price_col: Some(5),
        };
        let stats = normalize_contract_boq_sheet(&mut sheet);
        assert_eq!(stats.dropped_empty_item, 0);
        assert_eq!(sheet.rows.len(), 3);
        assert_eq!(sheet.rows[0].cells[0], "");
        assert_eq!(sheet.rows[1].cells[0], "1.9");
        assert_eq!(sheet.rows[2].cells[0], "1.10");
    }

    #[test]
    fn normalize_keeps_section_and_category_rows_without_unit() {
        let mut sheet = MasterSheetState {
            sheet_name: "Schedule1".into(),
            headers: vec![
                "Item".into(),
                "Description".into(),
                "Unit".into(),
                "Est. Qty".into(),
                "Unit Price".into(),
                "Total Price".into(),
            ],
            rows: vec![
                MasterRow {
                    cells: vec![
                        "".into(),
                        "400 kV MAIN ELECTRICAL EQUIPMENTS".into(),
                        "".into(),
                        "".into(),
                        "".into(),
                        "".into(),
                    ],
                    composite_key: "x".into(),
                },
                MasterRow {
                    cells: vec![
                        "1.0".into(),
                        "LIGHTNING ARRESTORS".into(),
                        "".into(),
                        "".into(),
                        "".into(),
                        "".into(),
                    ],
                    composite_key: "y".into(),
                },
                MasterRow {
                    cells: vec![
                        "1.1".into(),
                        "Arrestor type A".into(),
                        "ea.".into(),
                        "9".into(),
                        "100".into(),
                        "900".into(),
                    ],
                    composite_key: "1.1|100".into(),
                },
            ],
            period_columns: HashMap::new(),
            item_col: 0,
            description_col: Some(1),
            total_price_col: Some(5),
        };
        normalize_contract_boq_sheet(&mut sheet);
        assert_eq!(sheet.rows.len(), 3);
        assert_eq!(sheet.rows[0].cells[1], "400 kV MAIN ELECTRICAL EQUIPMENTS");
        assert_eq!(sheet.rows[1].cells[0], "1.0");
        assert_eq!(sheet.rows[1].cells[1], "LIGHTNING ARRESTORS");
    }

    #[test]
    fn normalize_drops_bottom_tail_without_unit_and_price() {
        let mut sheet = MasterSheetState {
            sheet_name: "Schedule1".into(),
            headers: vec![
                "Item".into(),
                "Description".into(),
                "Unit".into(),
                "Est. Qty".into(),
                "Unit Price".into(),
                "Total Price".into(),
            ],
            rows: vec![
                MasterRow {
                    cells: vec![
                        "1.1".into(),
                        "Arrestor".into(),
                        "ea.".into(),
                        "1".into(),
                        "50".into(),
                        "50".into(),
                    ],
                    composite_key: "1.1|50".into(),
                },
                MasterRow {
                    cells: vec![
                        "".into(),
                        "Footnote or empty spacer at sheet bottom".into(),
                        "".into(),
                        "".into(),
                        "".into(),
                        "".into(),
                    ],
                    composite_key: "z".into(),
                },
            ],
            period_columns: HashMap::new(),
            item_col: 0,
            description_col: Some(1),
            total_price_col: Some(5),
        };
        let stats = normalize_contract_boq_sheet(&mut sheet);
        assert_eq!(stats.dropped_note, 1);
        assert_eq!(sheet.rows.len(), 1);
        assert_eq!(sheet.rows[0].cells[0], "1.1");
    }

    #[test]
    fn currency_for_master_sheet_prefers_sheet_name_over_unit_price_subrow() {
        let sheet = MasterSheetState {
            sheet_name: "Schedule 1 - TZS".to_string(),
            headers: vec![
                "Item".into(),
                "Unit Price".into(),
                "IPC007".into(),
            ],
            rows: Vec::new(),
            period_columns: HashMap::new(),
            item_col: 0,
            description_col: None,
            total_price_col: None,
        };
        assert_eq!(
            currency_for_master_sheet(&sheet, Path::new("SSLOT1-BOQ_aligned.xlsx")),
            "TZS"
        );
    }

    #[test]
    fn currency_for_master_sheet_from_schedule2_tzs_sheet_name() {
        let sheet = MasterSheetState {
            sheet_name: "Schedule2-TZS".to_string(),
            headers: vec!["Item".into(), "Unit Price".into(), "Total Price".into()],
            rows: Vec::new(),
            period_columns: HashMap::new(),
            item_col: 0,
            description_col: None,
            total_price_col: None,
        };
        assert_eq!(
            currency_for_master_sheet(&sheet, Path::new("SSLOT1-BOQ_aligned.xlsx")),
            "TZS"
        );
    }

    #[test]
    fn currency_for_master_sheet_from_unit_price_tzs_subheader() {
        let sheet = MasterSheetState {
            sheet_name: "Schedule2".to_string(),
            headers: vec![
                "Item No".into(),
                "Unit Price [TZS]".into(),
                "Total Price [TZS]".into(),
                "IPC004".into(),
            ],
            rows: Vec::new(),
            period_columns: HashMap::new(),
            item_col: 0,
            description_col: None,
            total_price_col: None,
        };
        assert_eq!(
            currency_for_master_sheet(&sheet, Path::new("SSLOT1-BOQ_aligned.xlsx")),
            "TZS"
        );
    }

    #[test]
    fn locate_boq_table_merges_currency_subheader_into_headers() {
        let rows = vec![
            vec!["SCHEDULE 2: Local supplies".into()],
            vec![
                "Item No".into(),
                "Description".into(),
                "Unit".into(),
                "Est. Qty.".into(),
                "Unit Price".into(),
                "Total Price".into(),
            ],
            vec![
                String::new(),
                String::new(),
                String::new(),
                String::new(),
                "[TZS]".into(),
                "[TZS]".into(),
            ],
            vec![
                "2.1".into(),
                "Cable".into(),
                "m".into(),
                "100".into(),
                "50.00".into(),
                "5000.00".into(),
            ],
        ];
        let layout = locate_boq_table(&rows).expect("Schedule2 BOQ with TZS subheader");
        assert_eq!(layout.headers[4], "Unit Price [TZS]");
        assert_eq!(layout.headers[5], "Total Price [TZS]");
        assert_eq!(
            currency_for_master_sheet(
                &MasterSheetState {
                    sheet_name: "Schedule2".to_string(),
                    headers: layout.headers.clone(),
                    rows: Vec::new(),
                    period_columns: HashMap::new(),
                    item_col: 0,
                    description_col: None,
                    total_price_col: None,
                },
                Path::new("SSLOT1-IRI-BOQ_aligned.xlsx"),
            ),
            "TZS"
        );
    }

    #[test]
    fn list_master_ipc_period_columns_includes_ipc8_and_ipc004() {
        let headers = vec![
            "Item".into(),
            "IPC004".into(),
            "IPC8".into(),
            "IPC007 Current Total".into(),
        ];
        let cols = list_master_ipc_period_columns(&headers);
        let labels: Vec<_> = cols.iter().map(|(_, l)| l.as_str()).collect();
        assert_eq!(labels, vec!["IPC004", "IPC8"]);
    }

    #[test]
    fn schedule_ipc_period_total_reads_last_total_schedule_row() {
        let rows = vec![
            MasterRow {
                cells: vec!["1".into(), "100".into(), "200".into()],
                composite_key: "a".into(),
            },
            MasterRow {
                cells: vec!["TOTAL SCHEDULE1".into(), "2768344.30".into(), "999".into()],
                composite_key: "t".into(),
            },
        ];
        assert_eq!(schedule_ipc_period_total(&rows, 1), Some(2768344.30));
        assert_eq!(schedule_ipc_period_total(&rows, 2), Some(999.0));
    }

    #[test]
    fn find_boq_total_price_skips_ipc_current_total_column() {
        let headers = vec![
            "Item".into(),
            "Current Total Price".into(),
            "Total Price".into(),
        ];
        assert_eq!(find_boq_total_price_column(&headers), Some(2));
    }

    #[test]
    fn schedule_boq_amount_for_sheet_prefers_total_schedule_row() {
        let headers = vec!["Item".into(), "Description".into(), "Total Price".into()];
        let rows = vec![
            MasterRow {
                cells: vec!["1".into(), "Line".into(), "100.00".into()],
                composite_key: "a".into(),
            },
            MasterRow {
                cells: vec![
                    String::new(),
                    "TOTAL SCHEDULE1".into(),
                    "21,601,287,851.50".into(),
                ],
                composite_key: "t".into(),
            },
        ];
        let sheet = MasterSheetState {
            sheet_name: "Schedule1-TZS".into(),
            headers,
            rows,
            period_columns: HashMap::new(),
            item_col: 0,
            description_col: Some(1),
            total_price_col: Some(2),
        };
        assert_eq!(
            schedule_boq_amount_for_sheet(&sheet),
            Some(21601287851.50)
        );
    }

    #[test]
    fn schedule_boq_amount_sslot1_when_total_price_cell_is_formula_cache_empty() {
        let headers = vec![
            "Item".into(),
            "Description".into(),
            "Unit".into(),
            "Est. Qty.".into(),
            "Unit Price [USD]".into(),
            "Total Price [USD]".into(),
            "IPC007".into(),
        ];
        let rows = vec![
            MasterRow {
                cells: vec![
                    "30.19.3".into(),
                    "Line".into(),
                    "lot".into(),
                    "1".into(),
                    "688256.00".into(),
                    String::new(),
                    String::new(),
                ],
                composite_key: "a".into(),
            },
            MasterRow {
                cells: vec![
                    "TOTAL SCHEDULE 1".into(),
                    String::new(),
                    String::new(),
                    String::new(),
                    String::new(),
                    String::new(),
                    "2,768,344.30".into(),
                ],
                composite_key: "t".into(),
            },
        ];
        let sheet = MasterSheetState {
            sheet_name: "Schedule1-USD".into(),
            headers: headers.clone(),
            rows,
            period_columns: HashMap::new(),
            item_col: 0,
            description_col: Some(1),
            total_price_col: Some(5),
        };
        assert_eq!(schedule_boq_amount_for_sheet(&sheet), Some(688256.0));
    }

    #[test]
    fn schedule_ipc_period_total_for_sheet_reads_current_total_subcolumn() {
        let headers = vec![
            "Item".into(),
            "Total Price".into(),
            "IPC007".into(),
            "IPC007 Current Total".into(),
        ];
        let rows = vec![MasterRow {
            cells: vec![
                "TOTAL SCHEDULE1".into(),
                "1".into(),
                String::new(),
                "2,768,344.30".into(),
            ],
            composite_key: "t".into(),
        }];
        let sheet = MasterSheetState {
            sheet_name: "Schedule1-USD".into(),
            headers: headers.clone(),
            rows,
            period_columns: HashMap::new(),
            item_col: 0,
            description_col: Some(1),
            total_price_col: Some(2),
        };
        let ipc_cols = list_master_ipc_period_columns(&headers);
        let (col, label) = ipc_cols
            .iter()
            .find(|(_, l)| l == "IPC007")
            .map(|(c, l)| (*c, l.clone()))
            .expect("IPC007 column");
        assert_eq!(
            schedule_ipc_period_total_for_sheet(&sheet, col, &label),
            Some(2768344.30)
        );
    }

    #[test]
    fn schedule_ipc_period_total_detects_schedule_total_in_description_only() {
        let rows = vec![MasterRow {
            cells: vec![
                String::new(),
                "Schedule 4 Total".into(),
                String::new(),
                "470950052.70".into(),
            ],
            composite_key: "t".into(),
        }];
        assert_eq!(
            schedule_ipc_period_total_at_col(&rows, 3, Some(1), Some(0)),
            Some(470950052.70)
        );
    }

    #[test]
    fn schedule_digit_from_hint_matches_period_sheet() {
        assert_eq!(schedule_digit_from_hint("Schedule4"), Some(4));
        assert_eq!(schedule_digit_from_hint("schedule 2"), Some(2));
        assert_eq!(schedule_digit_from_hint("Schedule1-USD"), Some(1));
        assert_eq!(schedule_digit_from_hint("Schedule002"), Some(2));
        assert_eq!(schedule_digit_from_hint("Schedule004"), Some(4));
    }

    #[test]
    fn item_column_aliases_match_no_headers() {
        assert_eq!(find_item_column(&["Item".into(), "Unit Price".into()]), Some(0));
        assert_eq!(find_item_column(&["Item No".into(), "Unit Price".into()]), Some(0));
        assert_eq!(find_item_column(&["No".into(), "Unit Price".into()]), Some(0));
        assert_eq!(find_item_column(&["no".into(), "Unit Price".into()]), Some(0));
        assert_eq!(find_item_column(&["no item".into(), "Unit Price".into()]), Some(0));
        assert_eq!(find_item_column(&["NO.".into(), "Unit Price".into()]), Some(0));
        assert!(find_item_column(&["Description".into()]).is_none());
    }

    #[test]
    fn item_column_prefers_item_over_serial_no() {
        assert_eq!(
            find_item_column(&["No".into(), "Item".into(), "Description".into()]),
            Some(1)
        );
        assert_eq!(
            find_item_column(&["No".into(), "Item No".into(), "Description".into()]),
            Some(1)
        );
    }

    #[test]
    fn find_master_row_index_uses_item_col_not_first_column() {
        let rows = vec![MasterRow {
            cells: vec!["48".into(), "30.17.1".into(), "Desc".into(), "100".into()],
            composite_key: build_composite_key("48", 100.0),
        }];
        let (by_item_wrong, _) = build_master_row_indexes(&rows, 0);
        let (by_item_right, by_composite) = build_master_row_indexes(&rows, 1);
        let ipc_row = CleanedIpcRow {
            item: "30.17.1".into(),
            unit_price: 100.0,
            current_total: 500.0,
            ..Default::default()
        };
        assert!(find_master_row_index(&ipc_row, &by_item_wrong, &by_composite).is_none());
        assert_eq!(
            find_master_row_index(&ipc_row, &by_item_right, &by_composite),
            Some(0)
        );
    }

    #[test]
    fn find_master_row_index_segment_normalizes_item() {
        let rows = vec![MasterRow {
            cells: vec!["30.17.01".into(), "Desc".into(), "100".into()],
            composite_key: build_composite_key("30.17.01", 100.0),
        }];
        let (by_item, by_composite) = build_master_row_indexes(&rows, 0);
        let ipc_row = CleanedIpcRow {
            item: "30.17.1".into(),
            unit_price: 100.0,
            current_total: 500.0,
            ..Default::default()
        };
        assert_eq!(
            find_master_row_index(&ipc_row, &by_item, &by_composite),
            Some(0)
        );
    }

    #[test]
    fn find_master_row_index_text_seven_matches_numeric_seven() {
        let rows = vec![MasterRow {
            cells: vec!["7".into(), "Desc".into(), "100".into()],
            composite_key: build_composite_key("7", 100.0),
        }];
        let (by_item, by_composite) = build_master_row_indexes(&rows, 0);
        let ipc_row = CleanedIpcRow {
            item: "7.0".into(),
            unit_price: 100.0,
            current_total: 50.0,
            ..Default::default()
        };
        assert_eq!(
            find_master_row_index(&ipc_row, &by_item, &by_composite),
            Some(0)
        );
    }

    #[test]
    fn format_boq_item_strips_invisible_chars_and_fullwidth() {
        assert_eq!(format_boq_item_number("30.17.1\u{200b}"), "30.17.1");
        assert_eq!(format_boq_item_number("30.17.1\u{00a0}"), "30.17.1");
        assert_eq!(format_boq_item_number("３０.１７.１"), "30.17.1");
        assert_eq!(format_boq_item_number("30 . 17 . 1"), "30.17.1");
    }

    #[test]
    fn find_master_row_index_matches_item_with_invisible_chars() {
        let rows = vec![MasterRow {
            cells: vec!["30.17.1".into(), "Desc".into(), "100".into()],
            composite_key: build_composite_key("30.17.1", 100.0),
        }];
        let (by_item, by_composite) = build_master_row_indexes(&rows, 0);
        let ipc_row = CleanedIpcRow {
            item: format_boq_item_number("30.17.1\u{200b}\u{00a0}"),
            unit_price: 100.0,
            current_total: 500.0,
            ..Default::default()
        };
        assert_eq!(
            find_master_row_index(&ipc_row, &by_item, &by_composite),
            Some(0)
        );
    }

    #[test]
    fn format_boq_item_from_float_matches_text_item() {
        assert_eq!(format_boq_item_from_float(7.1), "7.1");
        assert_eq!(
            normalize_item_key(&format_boq_item_from_float(7.1)),
            normalize_item_key("7.1")
        );
    }

    #[test]
    fn unit_price_header_with_currency_subrow() {
        let merged = merge_header_rows(&[
            &[
                "Item No".into(),
                "Description".into(),
                "Unit".into(),
                "Est. Qty.".into(),
                "Unit Price".into(),
                "Total Price".into(),
            ],
            &[
                String::new(),
                String::new(),
                String::new(),
                String::new(),
                "[USD]".into(),
                "[USD]".into(),
            ],
        ]);
        assert_eq!(find_item_column(&merged), Some(0));
        assert_eq!(find_unit_price_column(&merged), Some(4));
    }

    #[test]
    fn locate_header_with_schedule_title_row() {
        let rows = vec![
            vec!["SCHEDULE 1: Plant and Mandatory Spare Parts Supplied from Abroad".into()],
            vec![
                "Item No".into(),
                "Description".into(),
                "Unit".into(),
                "Est. Qty.".into(),
                "Unit Price".into(),
                "Total Price".into(),
            ],
            vec![
                String::new(),
                String::new(),
                String::new(),
                String::new(),
                "[USD]".into(),
                "[USD]".into(),
            ],
            vec![
                "1.1".into(),
                "Lightning arrester".into(),
                "ea.".into(),
                "30".into(),
                "7327.00".into(),
                "219810.00".into(),
            ],
        ];
        let layout = locate_boq_table(&rows).expect("should locate BOQ header");
        assert_eq!(layout.data_start_row, 3);
        assert_eq!(layout.item_col, 0);
        assert_eq!(layout.unit_price_col, 4);
    }

    #[test]
    fn locate_header_with_blank_rows_between_title_and_header() {
        let rows = vec![
            vec!["SCHEDULE 1: Plant and Mandatory Spare Parts Supplied from Abroad".into()],
            vec![String::new(); 6],
            vec![String::new(); 6],
            vec![
                "Item No".into(),
                "Description".into(),
                "Unit".into(),
                "Est. Qty.".into(),
                "Unit Price".into(),
                "Total Price".into(),
            ],
            vec![
                String::new(),
                String::new(),
                String::new(),
                String::new(),
                "[USD]".into(),
                "[USD]".into(),
            ],
            vec![
                "1.1".into(),
                "Lightning arrester".into(),
                "ea.".into(),
                "30".into(),
                "7327.00".into(),
                "219810.00".into(),
            ],
        ];
        let layout = locate_boq_table(&rows).expect("blank rows after title");
        assert_eq!(layout.item_col, 0);
        assert_eq!(layout.unit_price_col, 4);
        assert_eq!(layout.data_start_row, 5);
    }

    #[test]
    fn locate_header_item_no_split_across_two_rows() {
        let rows = vec![
            vec!["SCHEDULE 1".into()],
            vec![
                "Item".into(),
                "Description".into(),
                "Unit".into(),
                "Est. Qty.".into(),
                "Unit Price".into(),
                "Total Price".into(),
            ],
            vec![
                "No".into(),
                String::new(),
                String::new(),
                String::new(),
                "[USD]".into(),
                "[USD]".into(),
            ],
            vec!["1.0".into(), "Category".into(), String::new(), String::new(), String::new(), String::new()],
        ];
        let layout = locate_boq_table(&rows).expect("Item + No vertical header");
        assert_eq!(find_item_column(&layout.headers), Some(0));
    }

    #[test]
    fn locate_header_when_unit_price_only_on_second_header_row() {
        let rows = vec![
            vec!["SCHEDULE 1: Plant".into()],
            vec![
                "Item No".into(),
                "Description".into(),
                "Unit".into(),
                "Est. Qty.".into(),
                String::new(),
                String::new(),
            ],
            vec![
                String::new(),
                String::new(),
                String::new(),
                String::new(),
                "Unit Price".into(),
                "Total Price".into(),
            ],
            vec![
                String::new(),
                String::new(),
                String::new(),
                String::new(),
                "[USD]".into(),
                "[USD]".into(),
            ],
            vec!["1.1".into(), "Item A".into(), "ea.".into(), "1".into(), "10".into(), "10".into()],
        ];
        let layout = locate_boq_table(&rows).expect("merged header");
        assert_eq!(layout.data_start_row, 4);
        assert_eq!(find_unit_price_column(&layout.headers), Some(4));
    }

    #[test]
    fn ipc_period_header_aliases_include_ipc7() {
        let aliases = ipc_period_header_aliases("IPC007");
        assert!(aliases.iter().any(|a| a == "ipc7"));
    }

    #[test]
    fn locate_ipc_header_when_current_is_subheader_row() {
        let mut row7 = vec![String::new(); 13];
        row7[0] = "Item".into();
        row7[7] = "Completion Progress".into();
        row7[11] = "Unit Price (USD)".into();
        row7[12] = "Current Total (USD)".into();

        let mut row8 = vec![String::new(); 13];
        row8[7] = "Previous".into();
        row8[8] = "Current".into();
        row8[9] = "Period-End Comp. Total Qty".into();
        row8[10] = "Completed Settlement Proportion".into();

        let rows = vec![
            vec!["IPC7 title".into()],
            row7,
            row8,
            vec!["7.1".into(), "reactor".into(), String::new(), String::new(), String::new(), String::new(), String::new(), String::new(), "1.9".into(), String::new(), String::new(), "1416477".into(), "2691306.3".into()],
        ];

        let single_row_only = locate_merged_header_inner(&rows[1..2], "IPC007", true);
        assert!(single_row_only.is_none(), "单行表头不应满足 IPC（缺 Current 子列）");

        let (headers, data_start) =
            locate_ipc_merged_header(&rows, "IPC007").expect("应合并第 2～3 行表头");
        assert_eq!(data_start, 3);
        assert_eq!(find_item_column(&headers), Some(0));
        assert_eq!(find_current_column(&headers), Some(8));
        assert_eq!(find_unit_price_column(&headers), Some(11));
        assert_eq!(find_current_total_column(&headers, "IPC007"), Some(12));
    }

    #[test]
    fn skips_boq_value_row_without_line_item_validation() {
        let mut row7 = vec![String::new(); 5];
        row7[0] = "Item".into();
        row7[1] = "Description".into();
        row7[2] = "Unit Price".into();
        row7[3] = "Current".into();
        row7[4] = "Current Total".into();

        let rows = vec![
            row7.clone(),
            vec![
                "7.1".into(),
                "line".into(),
                "100".into(),
                "2".into(),
                "200".into(),
            ],
            vec![
                "7.2".into(),
                "line2".into(),
                "50".into(),
                "4".into(),
                "200".into(),
            ],
            vec![
                String::new(),
                "BOQ Value".into(),
                String::new(),
                "0".into(),
                "400".into(),
            ],
        ];

        let analysis = analyze_ipc_workbook_from_rows(&rows, "IPC004").expect("analyze");
        assert_eq!(analysis.rows.len(), 2);
        let sum: f64 = analysis.rows.iter().map(|r| r.current_total).sum();
        assert!((sum - 400.0).abs() < 0.01);
    }

    fn analyze_ipc_workbook_from_rows(rows: &[Vec<String>], period: &str) -> Result<IpcSheetAnalysis> {
        let (headers, data_start_row) = locate_ipc_merged_header(rows, period)
            .ok_or_else(|| anyhow!("no header"))?;
        let item_col = find_item_column(&headers).unwrap();
        let description_col = find_description_column(&headers);
        let unit_col = find_unit_column(&headers);
        let unit_price_col = find_unit_price_column(&headers);
        let contract_qty_col = find_contract_total_qty_column(&headers);
        let previous_col = find_previous_qty_column(&headers);
        let current_col = find_current_column(&headers).unwrap();
        let end_qty_col = find_end_total_qty_column(&headers);
        let current_total_col = find_current_total_column(&headers, period).unwrap();
        let currency = find_ipc_currency(&headers, Path::new("test.xlsx"));

        let mut cleaned = Vec::new();
        let mut row_errors: Vec<String> = Vec::new();
        let mut boq_value_checks: Vec<(usize, f64)> = Vec::new();

        for (row_idx, row) in rows.iter().skip(data_start_row).enumerate() {
            let item = row.get(item_col).cloned().unwrap_or_default();
            let excel_row = data_start_row + row_idx + 1;
            let current_total =
                parse_f64(&row.get(current_total_col).cloned().unwrap_or_default()).unwrap_or(0.0);

            if item.trim().is_empty() || is_ipc_summary_row(row, &item) {
                if row_contains_boq_value_label(row) && current_total.abs() > 0.0 {
                    boq_value_checks.push((excel_row, current_total));
                }
                continue;
            }
            if !looks_like_ipc_item_code(&item) {
                continue;
            }
            let unit_price = unit_price_col
                .and_then(|col| parse_f64(&row.get(col).cloned().unwrap_or_default()))
                .unwrap_or(0.0);
            let current = parse_f64(&row.get(current_col).cloned().unwrap_or_default()).unwrap_or(0.0);
            let qty_amount_mismatch = unit_price.abs() > 1e-9
                && current.abs() > 1e-9
                && !amounts_approx_equal(current_total, unit_price * current);
            if qty_amount_mismatch {
                row_errors.push(format!("row {excel_row} validation failed"));
                continue;
            }
            cleaned.push(CleanedIpcRow {
                item,
                description: ipc_row_str(row, description_col),
                unit: ipc_row_str(row, unit_col),
                unit_price,
                contract_total_qty: ipc_row_f64(row, contract_qty_col),
                previous_qty: ipc_row_f64(row, previous_col),
                current_qty: current,
                end_total_qty: ipc_row_f64(row, end_qty_col),
                current_total,
            });
        }

        let boq_value_total = boq_value_checks.last().map(|(_, total)| *total);
        let total_current_amount: f64 = cleaned.iter().map(|r| r.current_total).sum();
        Ok(IpcSheetAnalysis {
            sheet_name: "test".into(),
            rows: cleaned,
            total_current_amount,
            currency,
            row_validation_error_count: row_errors.len() as u32,
            boq_value_total,
        })
    }

    #[test]
    fn boq_value_mismatch_does_not_fail_step2_analyze() {
        let mut row7 = vec![String::new(); 5];
        row7[0] = "Item".into();
        row7[2] = "Unit Price".into();
        row7[3] = "Current".into();
        row7[4] = "Current Total".into();
        let rows = vec![
            row7,
            vec!["7.1".into(), String::new(), "100".into(), "2".into(), "200".into()],
            vec![
                String::new(),
                "BOQ Value".into(),
                String::new(),
                "0".into(),
                "999".into(),
            ],
        ];
        let analysis = analyze_ipc_workbook_from_rows(&rows, "IPC004").expect("analyze");
        assert_eq!(analysis.rows.len(), 1);
        assert_eq!(ipc_reconciliation_ok(&analysis), Some(false));
    }

    #[test]
    fn locate_ipc002_invoice_sheet_header_total_price_tzs() {
        let rows = vec![
            vec!["Contractor: TBEA".into()],
            vec!["SCHEDULE 4: Installation".into()],
            vec![
                "ITEM".into(),
                "DESCRIPTION".into(),
                String::new(),
                String::new(),
                "UNIT".into(),
                "Quantity".into(),
                "Unit price (TZS)".into(),
                "Total Price (TZS)".into(),
            ],
            vec![
                "19.0.1".into(),
                "Soil investigation".into(),
                String::new(),
                String::new(),
                "lot".into(),
                "1".into(),
                "31396670.18".into(),
                "31396670.18".into(),
            ],
            vec![
                String::new(),
                String::new(),
                String::new(),
                String::new(),
                "BOQ Value".into(),
                String::new(),
                "A".into(),
                "470950052.7".into(),
            ],
        ];
        let (headers, data_start) =
            locate_ipc_merged_header(&rows, "IPC002").expect("invoice layout header");
        assert_eq!(find_item_column(&headers), Some(0));
        assert_eq!(find_current_column(&headers), Some(5));
        assert_eq!(find_current_total_column(&headers, "IPC002"), Some(7));
        assert_eq!(data_start, 3);
        let analysis = analyze_ipc_workbook_from_rows(&rows, "IPC002").expect("analyze invoice rows");
        assert_eq!(analysis.rows.len(), 1);
        assert!(analysis.boq_value_total.is_some());
    }

    #[test]
    fn locate_ipc002_style_header_with_quantity_column() {
        let header = vec![
            "Item".into(),
            "Description".into(),
            "Contract Total Qty".into(),
            "Previous".into(),
            "Quantity".into(),
            "Unit Rate [USD]".into(),
            "Amount".into(),
        ];
        let rows = vec![
            header,
            vec![
                "4.1".into(),
                "work".into(),
                "100".into(),
                "0".into(),
                "2".into(),
                "50".into(),
                "100".into(),
            ],
        ];
        let (headers, data_start) =
            locate_ipc_merged_header(&rows, "IPC002").expect("IPC002 style header");
        assert_eq!(data_start, 1);
        assert_eq!(find_item_column(&headers), Some(0));
        assert_eq!(find_current_column(&headers), Some(4));
        assert_eq!(find_current_total_column(&headers, "IPC002"), Some(6));
        assert_eq!(find_ipc_currency(&headers, Path::new("IPC002.xlsx")), "USD");
    }

    #[test]
    fn thousand_separator_columns_and_comma_parse() {
        assert!(column_wants_thousand_separator("Unit Price"));
        assert!(column_wants_thousand_separator("Total Price"));
        assert!(column_wants_thousand_separator("IPC8"));
        assert!(!column_wants_thousand_separator("Description"));
        assert_eq!(parse_cell_number("2,198,810.00"), Some(2198810.0));
        assert_eq!(parse_cell_number("1234.5"), Some(1234.5));
    }

    #[test]
    fn find_current_total_on_ipc_period_column() {
        let headers = vec![
            "item".into(),
            "unit_price".into(),
            "current".into(),
            "IPC7".into(),
        ];
        assert_eq!(find_current_total_column(&headers, "IPC007"), Some(3));
    }

    #[test]
    fn resolve_merge_paths_prefers_canonical_aligned() {
        let dir = std::env::temp_dir().join(format!("epc_aligned_paths_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let master = dir.join("BOQ_master.xlsx");
        std::fs::write(&master, b"").unwrap();
        let canonical = dir.join("BOQ_master_aligned.xlsx");
        std::fs::write(&canonical, b"").unwrap();
        let (load, out) = resolve_master_merge_paths(&master);
        assert_eq!(load, canonical);
        assert_eq!(out, canonical);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn resolve_merge_paths_uses_latest_legacy_aligned() {
        let dir = std::env::temp_dir().join(format!("epc_legacy_aligned_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let master = dir.join("BOQ_master.xlsx");
        std::fs::write(&master, b"").unwrap();
        let legacy_old = dir.join("BOQ_master_aligned_IPC002.xlsx");
        let legacy_new = dir.join("BOQ_master_aligned_IPC004.xlsx");
        std::fs::write(&legacy_old, b"").unwrap();
        std::thread::sleep(std::time::Duration::from_millis(20));
        std::fs::write(&legacy_new, b"").unwrap();
        let canonical = dir.join("BOQ_master_aligned.xlsx");
        let (load, out) = resolve_master_merge_paths(&master);
        assert_eq!(load, legacy_new);
        assert_eq!(out, canonical);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn resolve_merge_paths_does_not_double_aligned_suffix() {
        let dir = std::env::temp_dir().join(format!("epc_no_double_aligned_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let aligned = dir.join("BOQ_master_aligned.xlsx");
        std::fs::write(&aligned, b"").unwrap();
        let (load, out) = resolve_master_merge_paths(&aligned);
        assert_eq!(load, aligned);
        assert_eq!(out, aligned);
        assert_eq!(
            out.file_name().and_then(|s| s.to_str()),
            Some("BOQ_master_aligned.xlsx")
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn resolve_merge_paths_first_run_uses_original_and_canonical_output() {
        let dir = std::env::temp_dir().join(format!("epc_first_aligned_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        let master = dir.join("BOQ_master.xlsx");
        std::fs::write(&master, b"").unwrap();
        let (load, out) = resolve_master_merge_paths(&master);
        assert_eq!(load, master);
        assert_eq!(out, dir.join("BOQ_master_aligned.xlsx"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    /// 复现 Desktop/test 根工作区（与 Cherry Studio 一致）下的 IPC 合并
    #[test]
    fn desktop_test_root_workspace_ipc_merge_via_csv() {
        use std::path::PathBuf;

        use crate::engine::ipc_cleaned_cache;
        use crate::engine::scanner;

        let ws = PathBuf::from("/Users/wangxy/Desktop/test");
        let boq = ws.join("SSLOT1/SSLOT1-Iringa/SSLOT1-IRI-BOQ.xlsx");
        if !boq.is_file() {
            eprintln!("skip desktop_test_root: BOQ not found");
            return;
        }
        let (load_path, _) = resolve_master_merge_paths(&boq);
        let mut master = load_master_workbook(&load_path).expect("load master");
        refine_master_workbook_item_columns(&mut master);

        eprintln!("load_path={load_path:?}");

        let merge_ctx = MergeRevisionContext {
            output_master_relative: "SSLOT1/SSLOT1-Iringa/SSLOT1-IRI-BOQ_aligned.xlsx",
            aligned_locks: &[],
            ignore_revisions: true,
        };

        let cases: Vec<(&str, &str, u8)> = vec![
            (
                "SSLOT1/SSLOT1-Iringa/SCH1-IPC7/SSLOT1-IRI-SCH1-2025007(IPC007).xlsx",
                "IPC007",
                1,
            ),
            (
                "SSLOT1/SSLOT1-Iringa/SCH4-IPC4/SS-LOT1-IRI-SCH4-2025002(IPC004)(TZS).xlsx",
                "IPC004",
                4,
            ),
            (
                "SSLOT1/SSLOT1-Iringa/SCH4-IPC8/SS-LOT1-IRI-SCH4-2026001(IPC8)-TZS.xlsx",
                "IPC8",
                4,
            ),
        ];

        for (rel, period, sch_digit) in cases {
            let ipc = ws.join(rel);
            let md5 = scanner::file_md5(&ipc).expect("md5");
            let (inferred_period, schedule_hint) =
                scanner::ipc_period_and_schedule_hint(&ipc, "IPC8");
            assert_eq!(inferred_period, period);
            let schedule_digit =
                scanner::resolve_schedule_digit_for_ipc(&ipc, &inferred_period);
            assert_eq!(schedule_digit, Some(sch_digit));
            let analysis = ipc_cleaned_cache::load_or_analyze_ipc_workbook(
                &ws,
                &ipc,
                &md5,
                &schedule_hint,
                &inferred_period,
                true,
            )
            .expect("analysis");
            apply_ipc_analysis_to_master(
                &mut master,
                &analysis,
                &schedule_hint,
                &inferred_period,
                schedule_digit,
                Some(&merge_ctx),
            )
            .unwrap_or_else(|e| panic!("merge {rel}: {e}"));
        }
    }

    fn merge_test_sheet() -> MasterSheetState {
        MasterSheetState {
            sheet_name: "Schedule1-USD".into(),
            headers: vec![
                "Item".into(),
                "Description".into(),
                "Unit".into(),
                "Est. Qty.".into(),
                "Unit Price [USD]".into(),
                "Total Price [USD]".into(),
            ],
            rows: vec![
                MasterRow {
                    cells: vec![
                        "7.1".into(),
                        "shunt reactor".into(),
                        "ea.".into(),
                        "2".into(),
                        "1416477.00".into(),
                        "2832954.00".into(),
                    ],
                    composite_key: build_composite_key("7.1", 1416477.0),
                },
                MasterRow {
                    cells: vec![
                        "22.1".into(),
                        "400kV Circuit Breakers".into(),
                        "".into(),
                        "".into(),
                        "".into(),
                        "".into(),
                    ],
                    composite_key: build_composite_key("22.1", 0.0),
                },
            ],
            period_columns: HashMap::new(),
            item_col: 0,
            description_col: Some(1),
            total_price_col: Some(5),
        }
    }

    /// 合并失败（部分 Item 无匹配）时不得修改母表：
    /// 既不能新增期数列，也不能把已匹配行的金额写进去（跨项目误路由场景的残留来源）。
    #[test]
    fn failed_merge_leaves_master_untouched() {
        let mut master = MasterWorkbookState {
            sheets: HashMap::from([("Schedule1-USD".to_string(), merge_test_sheet())]),
        };
        let analysis = IpcSheetAnalysis {
            sheet_name: "Schedule1".into(),
            rows: vec![
                CleanedIpcRow {
                    item: "7.1".into(),
                    unit_price: 1416477.0,
                    current_total: 2691306.30,
                    ..Default::default()
                },
                CleanedIpcRow {
                    item: "30.17.1".into(),
                    current_total: 56836.0,
                    ..Default::default()
                },
            ],
            total_current_amount: 2748142.30,
            currency: "USD".into(),
            row_validation_error_count: 0,
            boq_value_total: None,
        };

        let err = apply_ipc_analysis_to_master(
            &mut master,
            &analysis,
            "Schedule1",
            "IPC007",
            Some(1),
            None,
        )
        .expect_err("merge should fail");
        assert!(err.to_string().contains("无匹配"), "{err}");

        let sheet = master.sheets.get("Schedule1-USD").unwrap();
        assert_eq!(sheet.headers.len(), 6, "不应新增 IPC007 期数列");
        assert!(sheet.period_columns.is_empty());
        for row in &sheet.rows {
            assert_eq!(row.cells.len(), 6, "不应有部分写入的期数单元格");
        }
    }

    /// 残留的空期数列（仅含空值/0/合计公式）应被清理，有数据的期数列保留
    #[test]
    fn remove_empty_period_columns_drops_stale_columns_only() {
        let mut sheet = merge_test_sheet();
        for (header, values) in [
            ("IPC004", ["", ""]),
            ("IPC8", ["0.00", ""]),
            ("IPC002", ["123.45", "=SUM(G2:G3)"]),
        ] {
            let idx = sheet.headers.len();
            sheet.headers.push(header.into());
            sheet.period_columns.insert(header.into(), idx);
            for (row, value) in sheet.rows.iter_mut().zip(values) {
                row.cells.push(value.to_string());
            }
        }

        remove_empty_period_columns_in_sheet(&mut sheet);

        assert_eq!(
            sheet.headers,
            vec![
                "Item",
                "Description",
                "Unit",
                "Est. Qty.",
                "Unit Price [USD]",
                "Total Price [USD]",
                "IPC002"
            ]
        );
        assert_eq!(sheet.period_columns.get("IPC002"), Some(&6));
        assert!(!sheet.period_columns.contains_key("IPC004"));
        assert!(!sheet.period_columns.contains_key("IPC8"));
        assert_eq!(sheet.rows[0].cells[6], "123.45");
    }

    /// 期数列缺失或无数据时不允许凭台账跳过（用户删除 aligned 重建场景）
    #[test]
    fn master_state_has_period_data_requires_existing_values() {
        let mut sheet = merge_test_sheet();
        let master_empty = MasterWorkbookState {
            sheets: HashMap::from([("Schedule1-USD".to_string(), merge_test_sheet())]),
        };
        // 期数列不存在 → false
        assert!(!master_state_has_period_data(
            &master_empty,
            "Schedule1",
            Some(1),
            "IPC007"
        ));

        // 期数列存在但全空 → false
        let idx = sheet.headers.len();
        sheet.headers.push("IPC007".into());
        sheet.period_columns.insert("IPC007".into(), idx);
        for row in &mut sheet.rows {
            row.cells.push(String::new());
        }
        let master_blank = MasterWorkbookState {
            sheets: HashMap::from([("Schedule1-USD".to_string(), MasterSheetState {
                sheet_name: sheet.sheet_name.clone(),
                headers: sheet.headers.clone(),
                rows: sheet.rows.clone(),
                period_columns: sheet.period_columns.clone(),
                item_col: sheet.item_col,
                description_col: sheet.description_col,
                total_price_col: sheet.total_price_col,
            })]),
        };
        assert!(!master_state_has_period_data(
            &master_blank,
            "Schedule1",
            Some(1),
            "IPC007"
        ));

        // 期数列存在且有数据 → true
        sheet.rows[0].cells[idx] = "2691306.30".into();
        let master_filled = MasterWorkbookState {
            sheets: HashMap::from([("Schedule1-USD".to_string(), sheet)]),
        };
        assert!(master_state_has_period_data(
            &master_filled,
            "Schedule1",
            Some(1),
            "IPC007"
        ));
    }

    /// 本地 SSLOT1 回归：IPC007/004/8 与 BOQ aligned 的 Item 应能全部匹配（文件不存在则 skip）
    #[test]
    fn sslot1_ipc_merge_matches_boq_items() {
        use std::path::PathBuf;

        let ws = PathBuf::from("/Users/wangxy/Desktop/test/SSLOT1");
        let boq = ws.join("SSLOT1-Iringa/SSLOT1-IRI-BOQ.xlsx");
        if !boq.is_file() {
            eprintln!("skip sslot1_ipc_merge: BOQ not found");
            return;
        }
        let (load_path, _) = resolve_master_merge_paths(&boq);
        let mut master = load_master_workbook(&load_path).expect("load master");
        refine_master_workbook_item_columns(&mut master);

        let cases: Vec<(&str, &str, &str, u8)> = vec![
            (
                "SSLOT1-Iringa/SCH1-IPC7/SSLOT1-IRI-SCH1-2025007(IPC007).xlsx",
                "Schedule1",
                "IPC007",
                1,
            ),
            (
                "SSLOT1-Iringa/SCH4-IPC4/SS-LOT1-IRI-SCH4-2025002(IPC004)(TZS).xlsx",
                "Schedule4",
                "IPC004",
                4,
            ),
            (
                "SSLOT1-Iringa/SCH4-IPC8/SS-LOT1-IRI-SCH4-2026001(IPC8)-TZS.xlsx",
                "Schedule4",
                "IPC8",
                4,
            ),
        ];

        for (rel, schedule_hint, period, sch_digit) in cases {
            let ipc = ws.join(rel);
            if !ipc.is_file() {
                eprintln!("skip missing {rel}");
                continue;
            }
            let analysis =
                analyze_ipc_workbook(&ipc, schedule_hint, period).unwrap_or_else(|e| {
                    panic!("analyze {rel}: {e}");
                });
            let summary = apply_ipc_analysis_to_master(
                &mut master,
                &analysis,
                schedule_hint,
                period,
                Some(sch_digit),
                None,
            )
            .unwrap_or_else(|e| panic!("merge {rel}: {e}"));
            assert_eq!(
                summary.unmatched_rows, 0,
                "{rel}: unmatched {:?} on sheet {}",
                summary.unmatched_items, summary.target_sheet
            );
            assert_eq!(summary.matched_rows, analysis.rows.len() as u32, "{rel}");
        }
    }
}
