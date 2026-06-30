use std::path::Path;

use anyhow::{Context, Result};
use rust_xlsxwriter::{Format, Workbook};

use crate::types::{AuditErrorRow, ExportErrorAuditRequest, ExportErrorAuditResponse};

/// 导出错误审计单页 Excel
pub fn export_error_audit(request: &ExportErrorAuditRequest) -> ExportErrorAuditResponse {
    match export_error_audit_inner(request) {
        Ok(path) => ExportErrorAuditResponse {
            ok: true,
            output_path: Some(path),
            error_message: None,
        },
        Err(e) => ExportErrorAuditResponse {
            ok: false,
            output_path: None,
            error_message: Some(e.to_string()),
        },
    }
}

fn export_error_audit_inner(request: &ExportErrorAuditRequest) -> Result<String> {
    let output = Path::new(&request.output_path);
    if let Some(parent) = output.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let mut workbook = Workbook::new();
    let worksheet = workbook.add_worksheet();
    worksheet.set_name("错误审计")?;

    let header = Format::new().set_bold();
    let headers = ["文件名", "路径", "工作表", "行提示", "错误信息"];
    for (col, h) in headers.iter().enumerate() {
        worksheet.write_string_with_format(0, col as u16, *h, &header)?;
    }

    for (row_idx, err) in request.errors.iter().enumerate() {
        let r = (row_idx + 1) as u32;
        worksheet.write_string(r, 0, &err.file_name)?;
        worksheet.write_string(r, 1, &err.file_path)?;
        worksheet.write_string(r, 2, err.sheet_name.as_deref().unwrap_or(""))?;
        worksheet.write_string(r, 3, err.row_hint.as_deref().unwrap_or(""))?;
        worksheet.write_string(r, 4, &err.error_message)?;
    }

    workbook
        .save(output)
        .with_context(|| format!("保存审计报告 {}", output.display()))?;
    Ok(output.display().to_string())
}
