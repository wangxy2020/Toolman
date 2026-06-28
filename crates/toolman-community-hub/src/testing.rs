//! Hidden helpers shared by unit tests and `tests/` integration tests.
#![doc(hidden)]

use std::io::{Cursor, Write};

use serde_json::json;
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

use crate::domain::ResourceType;
use crate::services::storage_service::manifest_filename;

const SHA256SUMS_FILENAME: &str = "SHA256SUMS";

fn sha256_hex(bytes: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    hex::encode(Sha256::digest(bytes))
}

pub fn sample_mcp_manifest_json() -> String {
    json!({
        "schemaVersion": 1,
        "mcpId": "integration-mcp",
        "transport": "stdio",
        "command": "npx",
        "tools": [{ "name": "ping", "description": "Ping" }],
        "templates": [{ "name": "default", "config": {} }],
        "files": ["mcp.manifest.json"]
    })
    .to_string()
}

pub fn build_test_package(
    resource_type: ResourceType,
    manifest_json: &str,
    extra_files: &[(&str, &[u8])],
) -> Vec<u8> {
    let mut file_entries: Vec<(String, Vec<u8>)> = Vec::new();
    file_entries.push((
        manifest_filename(resource_type).to_string(),
        manifest_json.as_bytes().to_vec(),
    ));

    if resource_type == ResourceType::Skill {
        file_entries.push(("SKILL.md".to_string(), b"# Skill\n".to_vec()));
    }

    for (name, content) in extra_files {
        file_entries.push((name.to_string(), content.to_vec()));
    }

    let mut sums = String::new();
    for (name, content) in &file_entries {
        sums.push_str(&format!("{}  {name}\n", sha256_hex(content)));
    }
    file_entries.push((SHA256SUMS_FILENAME.to_string(), sums.into_bytes()));

    let mut buffer = Cursor::new(Vec::new());
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
    let mut writer = ZipWriter::new(&mut buffer);

    for (name, content) in file_entries {
        writer
            .start_file(name, options)
            .expect("start zip file");
        writer.write_all(&content).expect("write zip content");
    }

    writer.finish().expect("finish zip");
    buffer.into_inner()
}
