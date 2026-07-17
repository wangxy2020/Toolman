//! Toolman DOCX conversion core
//! Copyright (C) 2024–2026 Toolman Contributors
//! SPDX-License-Identifier: AGPL-3.0-or-later
//! Source: https://github.com/wangxy2020/Toolman
mod cache;
mod convert;
mod format;
mod lo_pool;

pub use cache::{cache_key_for_path, cache_output_path, DiskConversionCache};
pub use convert::{
    convert_to_docx, convert_to_docx_with_options, ConvertError, ConvertOptions,
};
pub use format::{detect_file_kind, is_editable_docx_kind, native_format, needs_conversion, FileKind};
