use std::path::Path;

use office_oxide::DocumentFormat;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FileKind {
    Docx,
    Doc,
    WpsNew,
    WpsOld,
    Unknown,
}

pub fn detect_file_kind(path: &Path) -> FileKind {
    let ext = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();

    match ext.as_str() {
        "docx" => FileKind::Docx,
        "doc" => FileKind::Doc,
        "wpsx" => FileKind::WpsNew,
        "wps" => FileKind::WpsOld,
        _ => FileKind::Unknown,
    }
}

pub fn native_format(path: &Path) -> Option<DocumentFormat> {
    DocumentFormat::from_path(path)
}

pub fn is_editable_docx_kind(kind: FileKind) -> bool {
    matches!(kind, FileKind::Docx | FileKind::WpsNew)
}

pub fn needs_conversion(kind: FileKind) -> bool {
    matches!(kind, FileKind::Doc | FileKind::WpsOld | FileKind::WpsNew)
}
