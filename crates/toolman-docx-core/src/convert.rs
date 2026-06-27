use std::path::{Path, PathBuf};
use std::process::Stdio;

use office_oxide::Document;
use thiserror::Error;
use tokio::process::Command;

use crate::cache::{cache_key_for_path, DiskConversionCache};
use crate::format::{detect_file_kind, needs_conversion, FileKind};
use crate::lo_pool::libreoffice_semaphore;

#[derive(Debug, Error)]
pub enum ConvertError {
    #[error("unsupported file format")]
    UnsupportedFormat,
    #[error("source file not found: {0}")]
    NotFound(String),
    #[error("office_oxide: {0}")]
    OfficeOxide(String),
    #[error("libreoffice conversion failed: {0}")]
    LibreOffice(String),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),
}

#[derive(Debug, Clone, Default)]
pub struct ConvertOptions {
    pub cache_dir: Option<PathBuf>,
}

impl ConvertOptions {
    pub fn from_env() -> Self {
        Self {
            cache_dir: std::env::var("TOOLMAN_DOCX_CACHE_DIR")
                .ok()
                .map(PathBuf::from),
        }
    }
}

pub async fn convert_to_docx(input: &Path, output: &Path) -> Result<FileKind, ConvertError> {
    convert_to_docx_with_options(input, output, ConvertOptions::from_env()).await
}

pub async fn convert_to_docx_with_options(
    input: &Path,
    output: &Path,
    options: ConvertOptions,
) -> Result<FileKind, ConvertError> {
    if !input.exists() {
        return Err(ConvertError::NotFound(input.display().to_string()));
    }

    let kind = detect_file_kind(input);
    if !needs_conversion(kind) && kind != FileKind::Docx {
        return Err(ConvertError::UnsupportedFormat);
    }

    if kind == FileKind::Docx {
        std::fs::copy(input, output)?;
        return Ok(FileKind::Docx);
    }

    if let Some(cache_dir) = options.cache_dir.as_deref() {
        let key = cache_key_for_path(input)?;
        let mut cache = DiskConversionCache::open(cache_dir)?;
        if cache.get_copy(&key, output)? {
            return Ok(kind);
        }

        let result_kind = match kind {
            FileKind::Doc | FileKind::WpsNew => {
                convert_with_office_oxide(input, output, kind).await?
            }
            FileKind::WpsOld => {
                convert_with_libreoffice(input, output).await?;
                FileKind::WpsOld
            }
            FileKind::Docx | FileKind::Unknown => return Err(ConvertError::UnsupportedFormat),
        };

        cache.store_copy(&key, output)?;
        return Ok(result_kind);
    }

    if matches!(kind, FileKind::Doc | FileKind::WpsNew) {
        return convert_with_office_oxide(input, output, kind).await;
    }

    convert_with_libreoffice(input, output).await?;
    Ok(FileKind::WpsOld)
}

async fn convert_with_office_oxide(
    input: &Path,
    output: &Path,
    kind: FileKind,
) -> Result<FileKind, ConvertError> {
    let doc = Document::open(input).map_err(|error| ConvertError::OfficeOxide(error.to_string()))?;
    doc.save_as(output)
        .map_err(|error| ConvertError::OfficeOxide(error.to_string()))?;
    Ok(kind)
}

async fn convert_with_libreoffice(input: &Path, output: &Path) -> Result<(), ConvertError> {
    let _permit = libreoffice_semaphore()
        .acquire()
        .await
        .map_err(|error| ConvertError::LibreOffice(format!("LO pool unavailable: {error}")))?;

    let Some(parent) = output.parent() else {
        return Err(ConvertError::LibreOffice("invalid output path".into()));
    };
    std::fs::create_dir_all(parent)?;

    let libreoffice = resolve_libreoffice_command();
    let status = Command::new(&libreoffice)
        .arg("--headless")
        .arg("--convert-to")
        .arg("docx")
        .arg("--outdir")
        .arg(parent)
        .arg(input)
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .status()
        .await
        .map_err(|error| {
            ConvertError::LibreOffice(format!(
                "failed to spawn {libreoffice}: {error}. Install LibreOffice for legacy .wps support."
            ))
        })?;

    if !status.success() {
        return Err(ConvertError::LibreOffice(
            "LibreOffice returned a non-zero exit code".into(),
        ));
    }

    let generated = parent.join(format!(
        "{}.docx",
        input
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("converted")
    ));

    if !generated.exists() {
        return Err(ConvertError::LibreOffice(format!(
            "expected converted file missing: {}",
            generated.display()
        )));
    }

    if generated != output {
        std::fs::rename(&generated, output)?;
    }

    Ok(())
}

fn resolve_libreoffice_command() -> String {
    for candidate in [
        "libreoffice",
        "soffice",
        "/Applications/LibreOffice.app/Contents/MacOS/soffice",
        "/usr/bin/libreoffice",
        "/usr/local/bin/libreoffice",
    ] {
        if Path::new(candidate).exists() || which_available(candidate) {
            return candidate.to_string();
        }
    }
    "libreoffice".to_string()
}

fn which_available(command: &str) -> bool {
    std::process::Command::new("which")
        .arg(command)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}
