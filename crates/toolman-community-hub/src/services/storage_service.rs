use std::collections::HashMap;
use std::fs;
use std::path::{Component, Path, PathBuf};

use serde_json::Value;
use sha2::{Digest, Sha256};
use zip::read::ZipArchive;
#[cfg(test)]
use zip::write::SimpleFileOptions;
#[cfg(test)]
use zip::ZipWriter;

use crate::config::HubConfig;
use crate::domain::{parse_manifest, ResourceManifest, ResourceType};

const ARCHIVE_BASENAME: &str = "package";
const EXTRACTED_DIRNAME: &str = "extracted";
const SHA256SUMS_FILENAME: &str = "SHA256SUMS";

#[derive(Debug, Clone)]
pub struct StoredPackage {
    /// Path relative to `data_dir`, pointing at the extracted package root.
    pub package_path: String,
    pub archive_path: PathBuf,
    pub extracted_dir: PathBuf,
    pub archive_sha256: String,
    pub resource_size: i64,
    pub manifest: Value,
}

#[derive(Debug, Clone)]
pub struct StorePackageInput<'a> {
    pub resource_id: &'a str,
    pub resource_type: ResourceType,
    pub version: &'a str,
    pub package_bytes: &'a [u8],
    pub original_filename: Option<&'a str>,
}

#[derive(Debug, thiserror::Error)]
pub enum StorageError {
    #[error("package exceeds size limit for {resource_type}: {size} bytes (max {max})")]
    PackageTooLarge {
        resource_type: &'static str,
        size: usize,
        max: u64,
    },
    #[error("invalid package extension: expected {expected}, got {actual}")]
    InvalidExtension { expected: String, actual: String },
    #[error("invalid version string")]
    InvalidVersion,
    #[error("unsafe archive entry path")]
    UnsafeArchivePath,
    #[error("missing manifest file: {0}")]
    MissingManifest(&'static str),
    #[error("missing required file: {0}")]
    MissingRequiredFile(&'static str),
    #[error("missing SHA256SUMS file")]
    MissingChecksumFile,
    #[error("checksum mismatch for {file}: expected {expected}, got {actual}")]
    ChecksumMismatch {
        file: String,
        expected: String,
        actual: String,
    },
    #[error("manifest validation failed: {0}")]
    Manifest(String),
    #[error("path escapes community data directory")]
    OutsideDataDir,
    #[error("package not found: {0}")]
    NotFound(String),
    #[error("io error at {path}: {source}")]
    Io {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
    #[error("zip error: {0}")]
    Zip(#[from] zip::result::ZipError),
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),
}

#[derive(Clone)]
pub struct StorageService {
    data_dir: PathBuf,
    packages_dir: PathBuf,
}

impl StorageService {
    pub fn new(config: &HubConfig) -> Self {
        Self {
            data_dir: config.data_dir.clone(),
            packages_dir: config.packages_dir.clone(),
        }
    }

    pub fn from_dirs(data_dir: PathBuf, packages_dir: PathBuf) -> Self {
        Self {
            data_dir,
            packages_dir,
        }
    }

    pub fn version_dir(
        &self,
        resource_type: ResourceType,
        resource_id: &str,
        version: &str,
    ) -> Result<PathBuf, StorageError> {
        let version = sanitize_version(version)?;
        Ok(self
            .packages_dir
            .join(resource_type.as_str())
            .join(resource_id)
            .join(version))
    }

    pub fn store_package(&self, input: StorePackageInput<'_>) -> Result<StoredPackage, StorageError> {
        self.validate_package_bytes(input.resource_type, input.package_bytes, input.original_filename)?;

        let version_dir = self.version_dir(input.resource_type, input.resource_id, input.version)?;
        if version_dir.exists() {
            fs::remove_dir_all(&version_dir).map_err(|source| StorageError::Io {
                path: version_dir.clone(),
                source,
            })?;
        }
        fs::create_dir_all(&version_dir).map_err(|source| StorageError::Io {
            path: version_dir.clone(),
            source,
        })?;

        let archive_name = format!("{ARCHIVE_BASENAME}{}", package_extension(input.resource_type));
        let archive_path = version_dir.join(&archive_name);
        let extracted_dir = version_dir.join(EXTRACTED_DIRNAME);

        let store_result = (|| {
            fs::write(&archive_path, input.package_bytes).map_err(|source| StorageError::Io {
                path: archive_path.clone(),
                source,
            })?;

            fs::create_dir_all(&extracted_dir).map_err(|source| StorageError::Io {
                path: extracted_dir.clone(),
                source,
            })?;

            extract_zip_archive(&archive_path, &extracted_dir)?;
            verify_sha256sums(&extracted_dir)?;
            validate_package_layout(&extracted_dir, input.resource_type)?;

            let manifest_path = extracted_dir.join(manifest_filename(input.resource_type));
            let manifest_raw = fs::read_to_string(&manifest_path).map_err(|source| StorageError::Io {
                path: manifest_path.clone(),
                source,
            })?;
            let manifest_value: Value = serde_json::from_str(&manifest_raw)?;
            let typed = parse_manifest(input.resource_type, &manifest_value)
                .map_err(|error| StorageError::Manifest(error.to_string()))?;

            let archive_sha256 = sha256_hex(input.package_bytes);
            let package_path = self.relative_data_path(&extracted_dir)?;
            let resource_size = i64::try_from(input.package_bytes.len()).unwrap_or(i64::MAX);

            Ok(StoredPackage {
                package_path,
                archive_path,
                extracted_dir,
                archive_sha256,
                resource_size,
                manifest: typed.into_value(),
            })
        })();

        if store_result.is_err() {
            let _ = fs::remove_dir_all(&version_dir);
        }

        store_result
    }

    pub fn resolve_package_dir(&self, package_path: &str) -> Result<PathBuf, StorageError> {
        let absolute = self.data_dir.join(package_path);
        let canonical = absolute.canonicalize().map_err(|source| StorageError::Io {
            path: absolute.clone(),
            source,
        })?;

        self.ensure_within_data_dir(&canonical)?;
        if !canonical.is_dir() {
            return Err(StorageError::NotFound(package_path.to_string()));
        }

        Ok(canonical)
    }

    pub fn read_package_file(&self, package_path: &str, relative_file: &str) -> Result<Vec<u8>, StorageError> {
        let package_dir = self.resolve_package_dir(package_path)?;
        let file_path = safe_join(&package_dir, relative_file)?;

        fs::read(&file_path).map_err(|source| StorageError::Io {
            path: file_path,
            source,
        })
    }

    pub fn read_manifest(&self, package_path: &str, resource_type: ResourceType) -> Result<Value, StorageError> {
        let bytes = self.read_package_file(package_path, manifest_filename(resource_type))?;
        Ok(serde_json::from_slice(&bytes)?)
    }

    fn validate_package_bytes(
        &self,
        resource_type: ResourceType,
        package_bytes: &[u8],
        original_filename: Option<&str>,
    ) -> Result<(), StorageError> {
        let max = max_package_bytes(resource_type);
        if package_bytes.len() as u64 > max {
            return Err(StorageError::PackageTooLarge {
                resource_type: resource_type.as_str(),
                size: package_bytes.len(),
                max,
            });
        }

        let expected_ext = package_extension(resource_type);
        if let Some(filename) = original_filename {
            if !filename.to_ascii_lowercase().ends_with(expected_ext) {
                return Err(StorageError::InvalidExtension {
                    expected: expected_ext.to_string(),
                    actual: filename.to_string(),
                });
            }
        } else if !looks_like_zip(package_bytes) {
            return Err(StorageError::InvalidExtension {
                expected: expected_ext.to_string(),
                actual: "unknown".to_string(),
            });
        }

        Ok(())
    }

    fn relative_data_path(&self, absolute: &Path) -> Result<String, StorageError> {
        let data_dir = self
            .data_dir
            .canonicalize()
            .map_err(|source| StorageError::Io {
                path: self.data_dir.clone(),
                source,
            })?;
        let absolute = absolute
            .canonicalize()
            .map_err(|source| StorageError::Io {
                path: absolute.to_path_buf(),
                source,
            })?;

        let relative = absolute
            .strip_prefix(&data_dir)
            .map_err(|_| StorageError::OutsideDataDir)?;

        Ok(relative.to_string_lossy().replace('\\', "/"))
    }

    fn ensure_within_data_dir(&self, path: &Path) -> Result<(), StorageError> {
        let data_dir = self
            .data_dir
            .canonicalize()
            .map_err(|source| StorageError::Io {
                path: self.data_dir.clone(),
                source,
            })?;

        if path.starts_with(&data_dir) {
            Ok(())
        } else {
            Err(StorageError::OutsideDataDir)
        }
    }
}

pub fn package_extension(resource_type: ResourceType) -> &'static str {
    match resource_type {
        ResourceType::Mcp => ".toolman-mcp",
        ResourceType::Skill => ".toolman-skill",
        ResourceType::Workflow => ".toolman-workflow",
        ResourceType::Task | ResourceType::Knowledge => ".zip",
    }
}

pub fn manifest_filename(resource_type: ResourceType) -> &'static str {
    match resource_type {
        ResourceType::Mcp => "mcp.manifest.json",
        ResourceType::Skill => "skill.manifest.json",
        ResourceType::Workflow => "workflow.manifest.json",
        ResourceType::Task => "task.manifest.json",
        ResourceType::Knowledge => "knowledge-bundle.manifest.json",
    }
}

pub fn max_package_bytes(resource_type: ResourceType) -> u64 {
    match resource_type {
        ResourceType::Workflow => 100 * 1024 * 1024,
        ResourceType::Mcp | ResourceType::Skill | ResourceType::Task | ResourceType::Knowledge => {
            50 * 1024 * 1024
        }
    }
}

fn sanitize_version(version: &str) -> Result<String, StorageError> {
    let trimmed = version.trim();
    if trimmed.is_empty() || trimmed.contains("..") {
        return Err(StorageError::InvalidVersion);
    }

    let sanitized = trimmed.replace(['/', '\\', '\0'], "_");
    if sanitized.is_empty() {
        return Err(StorageError::InvalidVersion);
    }

    Ok(sanitized)
}

fn looks_like_zip(bytes: &[u8]) -> bool {
    bytes.len() >= 4 && bytes[0] == b'P' && bytes[1] == b'K'
}

fn sha256_hex(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}

fn extract_zip_archive(archive_path: &Path, dest: &Path) -> Result<(), StorageError> {
    let file = fs::File::open(archive_path).map_err(|source| StorageError::Io {
        path: archive_path.to_path_buf(),
        source,
    })?;
    let mut archive = ZipArchive::new(file)?;

    for index in 0..archive.len() {
        let mut entry = archive.by_index(index)?;
        let Some(relative) = entry.enclosed_name() else {
            return Err(StorageError::UnsafeArchivePath);
        };

        let outpath = dest.join(relative);
        if entry.is_dir() {
            fs::create_dir_all(&outpath).map_err(|source| StorageError::Io {
                path: outpath.clone(),
                source,
            })?;
            continue;
        }

        if let Some(parent) = outpath.parent() {
            fs::create_dir_all(parent).map_err(|source| StorageError::Io {
                path: parent.to_path_buf(),
                source,
            })?;
        }

        let mut outfile = fs::File::create(&outpath).map_err(|source| StorageError::Io {
            path: outpath.clone(),
            source,
        })?;
        std::io::copy(&mut entry, &mut outfile).map_err(|source| StorageError::Io {
            path: outpath,
            source,
        })?;
    }

    Ok(())
}

fn parse_sha256sums(content: &str) -> Result<HashMap<String, String>, StorageError> {
    let mut entries = HashMap::new();

    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }

        let (hash, file) = line
            .split_once(char::is_whitespace)
            .ok_or(StorageError::MissingChecksumFile)?;
        let file = file.trim_start_matches('*').trim();
        if file.is_empty() || file.contains("..") {
            return Err(StorageError::UnsafeArchivePath);
        }

        entries.insert(file.replace('\\', "/"), hash.to_ascii_lowercase());
    }

    if entries.is_empty() {
        return Err(StorageError::MissingChecksumFile);
    }

    Ok(entries)
}

fn verify_sha256sums(extracted_dir: &Path) -> Result<(), StorageError> {
    let sums_path = extracted_dir.join(SHA256SUMS_FILENAME);
    let sums_raw = fs::read_to_string(&sums_path).map_err(|source| {
        if source.kind() == std::io::ErrorKind::NotFound {
            StorageError::MissingChecksumFile
        } else {
            StorageError::Io {
                path: sums_path.clone(),
                source,
            }
        }
    })?;

    let entries = parse_sha256sums(&sums_raw)?;

    for (relative_file, expected) in entries {
        if relative_file == SHA256SUMS_FILENAME {
            continue;
        }

        let file_path = safe_join(extracted_dir, &relative_file)?;
        let bytes = fs::read(&file_path).map_err(|source| StorageError::Io {
            path: file_path.clone(),
            source,
        })?;
        let actual = sha256_hex(&bytes);

        if actual != expected {
            return Err(StorageError::ChecksumMismatch {
                file: relative_file,
                expected,
                actual,
            });
        }
    }

    Ok(())
}

fn validate_package_layout(extracted_dir: &Path, resource_type: ResourceType) -> Result<(), StorageError> {
    let manifest_path = extracted_dir.join(manifest_filename(resource_type));
    if !manifest_path.is_file() {
        return Err(StorageError::MissingManifest(manifest_filename(resource_type)));
    }

    if resource_type == ResourceType::Skill {
        let skill_md = extracted_dir.join("SKILL.md");
        if !skill_md.is_file() {
            return Err(StorageError::MissingRequiredFile("SKILL.md"));
        }
    }

    if resource_type == ResourceType::Knowledge {
        let manifest_value: Value = serde_json::from_str(
            &fs::read_to_string(&manifest_path).map_err(|source| StorageError::Io {
                path: manifest_path.clone(),
                source,
            })?,
        )?;
        let manifest: crate::domain::KnowledgeManifest = serde_json::from_value(manifest_value)
            .map_err(|error| StorageError::Manifest(error.to_string()))?;
        manifest
            .validate()
            .map_err(|error| StorageError::Manifest(error.to_string()))?;
        for relative in &manifest.files {
            let file_path = safe_join(extracted_dir, relative)?;
            if !file_path.is_file() {
                return Err(StorageError::Manifest(format!("missing required file: {relative}")));
            }
        }
    }

    Ok(())
}

fn safe_join(base: &Path, relative: &str) -> Result<PathBuf, StorageError> {
    let path = Path::new(relative);
    for component in path.components() {
        match component {
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err(StorageError::UnsafeArchivePath);
            }
            _ => {}
        }
    }

    Ok(base.join(path))
}

#[cfg(test)]
mod tests {
    use std::io::{Cursor, Write};

    use super::*;
    use crate::testing::{build_test_package, sample_mcp_manifest_json};
    use serde_json::json;
    use uuid::Uuid;

    fn temp_storage() -> (StorageService, PathBuf) {
        let root = std::env::temp_dir().join(format!("toolman-storage-{}", Uuid::new_v4()));
        let packages_dir = root.join("packages");
        fs::create_dir_all(&packages_dir).expect("create packages dir");
        (
            StorageService::from_dirs(root.clone(), packages_dir),
            root,
        )
    }

    fn sample_mcp_manifest() -> String {
        sample_mcp_manifest_json()
    }

    #[test]
    fn stores_and_reads_mcp_package() {
        let (storage, root) = temp_storage();
        let resource_id = Uuid::new_v4().to_string();
        let package_bytes = build_test_package(ResourceType::Mcp, &sample_mcp_manifest(), &[]);

        let stored = storage
            .store_package(StorePackageInput {
                resource_id: &resource_id,
                resource_type: ResourceType::Mcp,
                version: "1.0.0",
                package_bytes: &package_bytes,
                original_filename: Some("demo.toolman-mcp"),
            })
            .expect("store package");

        assert!(stored.package_path.contains("packages/mcp"));
        assert_eq!(stored.resource_size, package_bytes.len() as i64);

        let manifest_bytes = storage
            .read_package_file(&stored.package_path, "mcp.manifest.json")
            .expect("read manifest");
        let manifest: Value = serde_json::from_slice(&manifest_bytes).expect("parse manifest");
        assert_eq!(manifest["mcpId"], "integration-mcp");

        let on_disk = storage.resolve_package_dir(&stored.package_path).expect("resolve");
        assert!(on_disk.join("mcp.manifest.json").is_file());

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rejects_checksum_mismatch() {
        let (storage, root) = temp_storage();
        let resource_id = Uuid::new_v4().to_string();
        let manifest = sample_mcp_manifest();
        let manifest_bytes = manifest.as_bytes();

        let package_bytes = {
            let mut buffer = Cursor::new(Vec::new());
            let options =
                SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
            let mut writer = ZipWriter::new(&mut buffer);
            writer
                .start_file("mcp.manifest.json", options)
                .expect("zip file");
            writer.write_all(manifest_bytes).expect("zip write");
            writer
                .start_file(SHA256SUMS_FILENAME, options)
                .expect("zip sums");
            writer
                .write_all(b"deadbeef  mcp.manifest.json\n")
                .expect("zip sums write");
            writer.finish().expect("zip finish");
            buffer.into_inner()
        };

        let error = storage
            .store_package(StorePackageInput {
                resource_id: &resource_id,
                resource_type: ResourceType::Mcp,
                version: "1.0.0",
                package_bytes: &package_bytes,
                original_filename: Some("broken.toolman-mcp"),
            })
            .expect_err("checksum mismatch");

        assert!(matches!(error, StorageError::ChecksumMismatch { .. }));

        let version_dir = storage
            .version_dir(ResourceType::Mcp, &resource_id, "1.0.0")
            .expect("version dir");
        assert!(!version_dir.exists());

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn rejects_tampered_manifest_after_valid_sums() {
        let (storage, root) = temp_storage();
        let resource_id = Uuid::new_v4().to_string();
        let manifest = sample_mcp_manifest();
        let mut tampered_manifest = manifest.clone();
        tampered_manifest.push('\n');

        let package_bytes = {
            let mut entries = vec![(
                manifest_filename(ResourceType::Mcp).to_string(),
                tampered_manifest.as_bytes().to_vec(),
            )];
            let sums = format!("{}  mcp.manifest.json\n", sha256_hex(manifest.as_bytes()));
            entries.push((SHA256SUMS_FILENAME.to_string(), sums.into_bytes()));

            let mut buffer = Cursor::new(Vec::new());
            let options =
                SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
            let mut writer = ZipWriter::new(&mut buffer);
            for (name, content) in entries {
                writer.start_file(name, options).expect("zip file");
                writer.write_all(&content).expect("zip write");
            }
            writer.finish().expect("zip finish");
            buffer.into_inner()
        };

        let error = storage
            .store_package(StorePackageInput {
                resource_id: &resource_id,
                resource_type: ResourceType::Mcp,
                version: "1.0.0",
                package_bytes: &package_bytes,
                original_filename: Some("tampered.toolman-mcp"),
            })
            .expect_err("checksum mismatch");

        assert!(matches!(error, StorageError::ChecksumMismatch { .. }));

        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn skill_package_requires_skill_md() {
        let (storage, root) = temp_storage();
        let resource_id = Uuid::new_v4().to_string();
        let manifest = json!({
            "schemaVersion": 1,
            "skillId": "demo",
            "name": "Demo",
            "description": "Demo skill"
        })
        .to_string();

        let package_bytes = build_test_package(ResourceType::Skill, &manifest, &[]);
        let stored = storage
            .store_package(StorePackageInput {
                resource_id: &resource_id,
                resource_type: ResourceType::Skill,
                version: "0.1.0",
                package_bytes: &package_bytes,
                original_filename: Some("demo.toolman-skill"),
            })
            .expect("store skill package");

        let skill_md = storage
            .read_package_file(&stored.package_path, "SKILL.md")
            .expect("read skill md");
        assert!(skill_md.starts_with(b"# Skill"));

        let _ = fs::remove_dir_all(root);
    }
}
