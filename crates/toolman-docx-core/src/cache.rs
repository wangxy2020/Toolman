use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::io::{Read, Seek, SeekFrom};
use std::num::NonZeroUsize;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use lru::LruCache;
use serde::{Deserialize, Serialize};

use crate::convert::ConvertError;

const DEFAULT_MAX_ENTRIES: usize = 64;
const SAMPLE_BYTES: u64 = 65_536;

#[derive(Debug, Clone, Serialize, Deserialize)]
struct CacheEntryRecord {
    key: String,
    file_name: String,
    bytes: u64,
    updated_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct CacheIndex {
    entries: Vec<CacheEntryRecord>,
}

pub struct DiskConversionCache {
    dir: PathBuf,
    index_path: PathBuf,
    max_entries: usize,
    entries: LruCache<String, PathBuf>,
}

impl DiskConversionCache {
    pub fn open(dir: impl AsRef<Path>) -> Result<Self, ConvertError> {
        Self::open_with_max_entries(dir, resolve_max_entries())
    }

    pub(crate) fn open_with_max_entries(dir: impl AsRef<Path>, max_entries: usize) -> Result<Self, ConvertError> {
        let dir = dir.as_ref().to_path_buf();
        fs::create_dir_all(&dir)?;
        let index_path = dir.join("index.json");
        let max_entries = max_entries.max(1);

        let mut cache = Self {
            dir,
            index_path,
            max_entries,
            entries: LruCache::new(
                NonZeroUsize::new(max_entries).expect("cache max entries must be > 0"),
            ),
        };
        cache.load_index()?;
        Ok(cache)
    }

    pub fn get_copy(&mut self, key: &str, output: &Path) -> Result<bool, ConvertError> {
        let Some(cached_path) = self.entries.get(key).cloned() else {
            return Ok(false);
        };

        if !cached_path.exists() {
            self.entries.pop(key);
            return Ok(false);
        }

        if let Some(parent) = output.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::copy(&cached_path, output)?;
        Ok(true)
    }

    pub fn store_copy(&mut self, key: &str, converted: &Path) -> Result<(), ConvertError> {
        if !converted.exists() {
            return Err(ConvertError::Io(std::io::Error::new(
                std::io::ErrorKind::NotFound,
                format!("converted file missing: {}", converted.display()),
            )));
        }

        let file_name = format!("{key}.docx");
        let cached_path = self.dir.join(&file_name);

        while self.entries.len() >= self.max_entries && !self.entries.contains(key) {
            if let Some((_, path)) = self.entries.pop_lru() {
                let _ = fs::remove_file(path);
            }
        }

        fs::copy(converted, &cached_path)?;
        if let Some(evicted_path) = self.entries.put(key.to_string(), cached_path) {
            let _ = fs::remove_file(evicted_path);
        }
        self.evict_to_limit();
        self.persist_index()?;
        Ok(())
    }

    fn load_index(&mut self) -> Result<(), ConvertError> {
        if !self.index_path.exists() {
            return Ok(());
        }

        let raw = fs::read_to_string(&self.index_path)?;
        let index: CacheIndex = serde_json::from_str(&raw).unwrap_or(CacheIndex {
            entries: Vec::new(),
        });

        for record in index.entries {
            let path = self.dir.join(&record.file_name);
            if path.exists() {
                while self.entries.len() >= self.max_entries {
                    if let Some((_, old_path)) = self.entries.pop_lru() {
                        let _ = fs::remove_file(old_path);
                    }
                }
                if let Some(evicted_path) = self.entries.put(record.key, path) {
                    let _ = fs::remove_file(evicted_path);
                }
            }
        }

        self.evict_to_limit();
        Ok(())
    }

    fn persist_index(&self) -> Result<(), ConvertError> {
        let mut records = Vec::new();
        for (key, path) in self.entries.iter() {
            let metadata = fs::metadata(path)?;
            records.push(CacheEntryRecord {
                key: key.clone(),
                file_name: path
                    .file_name()
                    .and_then(|value| value.to_str())
                    .unwrap_or("unknown.docx")
                    .to_string(),
                bytes: metadata.len(),
                updated_at: metadata
                    .modified()
                    .unwrap_or(SystemTime::UNIX_EPOCH)
                    .duration_since(UNIX_EPOCH)
                    .map(|duration| duration.as_secs())
                    .unwrap_or(0),
            });
        }

        let payload = CacheIndex { entries: records };
        fs::write(&self.index_path, serde_json::to_string_pretty(&payload)?)?;
        Ok(())
    }

    fn evict_to_limit(&mut self) {
        while self.entries.len() > self.max_entries {
            if let Some((_, path)) = self.entries.pop_lru() {
                let _ = fs::remove_file(path);
            }
        }
    }
}

fn resolve_max_entries() -> usize {
    std::env::var("TOOLMAN_DOCX_CACHE_MAX_ENTRIES")
        .ok()
        .and_then(|value| value.parse().ok())
        .filter(|value| *value > 0)
        .unwrap_or(DEFAULT_MAX_ENTRIES)
}

pub fn cache_key_for_path(path: &Path) -> Result<String, ConvertError> {
    let metadata = fs::metadata(path)?;
    let mut hasher = DefaultHasher::new();
    metadata.len().hash(&mut hasher);
    if let Ok(modified) = metadata.modified() {
        modified.hash(&mut hasher);
    }

    let mut file = fs::File::open(path)?;
    let mut head = vec![0u8; SAMPLE_BYTES as usize];
    let head_len = file.read(&mut head)?;
    head[..head_len].hash(&mut hasher);

    if metadata.len() > SAMPLE_BYTES {
        let tail_offset = metadata.len().saturating_sub(SAMPLE_BYTES);
        file.seek(SeekFrom::Start(tail_offset))?;
        let mut tail = vec![0u8; SAMPLE_BYTES as usize];
        let tail_len = file.read(&mut tail)?;
        tail[..tail_len].hash(&mut hasher);
    }

    Ok(format!("{:016x}", hasher.finish()))
}

pub fn cache_output_path(cache_dir: &Path, key: &str) -> PathBuf {
    cache_dir.join(format!("{key}.docx"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn write_temp_file(dir: &Path, name: &str, content: &[u8]) -> PathBuf {
        let path = dir.join(name);
        let mut file = fs::File::create(&path).expect("create temp file");
        file.write_all(content).expect("write temp file");
        path
    }

    #[test]
    fn cache_key_changes_when_content_changes() {
        let dir = tempfile::tempdir().expect("tempdir");
        let first = write_temp_file(dir.path(), "a.doc", b"hello");
        let second = write_temp_file(dir.path(), "b.doc", b"world");
        let key_first = cache_key_for_path(&first).expect("key first");
        let key_second = cache_key_for_path(&second).expect("key second");
        assert_ne!(key_first, key_second);
    }

    #[test]
    fn disk_cache_stores_and_retrieves_copy() {
        let dir = tempfile::tempdir().expect("tempdir");
        let cache_dir = dir.path().join("cache");
        let source = write_temp_file(dir.path(), "source.docx", b"docx-content");
        let output = dir.path().join("out.docx");

        let key = cache_key_for_path(&source).expect("cache key");
        let mut cache = DiskConversionCache::open(&cache_dir).expect("open cache");
        assert!(!cache.get_copy(&key, &output).expect("cache miss"));

        cache.store_copy(&key, &source).expect("store copy");
        assert!(cache.get_copy(&key, &output).expect("cache hit"));
        assert_eq!(fs::read(&output).expect("read output"), b"docx-content");
    }

    #[test]
    fn disk_cache_evicts_lru_entries() {
        let dir = tempfile::tempdir().expect("tempdir");
        let cache_dir = dir.path().join("cache");

        let first = write_temp_file(dir.path(), "first.docx", b"first");
        let second = write_temp_file(dir.path(), "second.docx", b"second");
        let first_key = cache_key_for_path(&first).expect("first key");
        let second_key = cache_key_for_path(&second).expect("second key");

        let mut cache =
            DiskConversionCache::open_with_max_entries(&cache_dir, 1).expect("open cache");
        cache.store_copy(&first_key, &first).expect("store first");
        cache.store_copy(&second_key, &second).expect("store second");

        let first_cached = cache_output_path(&cache_dir, &first_key);
        let second_cached = cache_output_path(&cache_dir, &second_key);
        assert!(!first_cached.exists());
        assert!(second_cached.exists());
    }
}
