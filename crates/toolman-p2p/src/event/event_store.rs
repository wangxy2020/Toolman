use std::fs::{self, File, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WalEventRecord {
    #[serde(rename = "eventId")]
    pub event_id: String,
    #[serde(rename = "workspaceId")]
    pub workspace_id: String,
    pub seq: u64,
    #[serde(rename = "resourceType")]
    pub resource_type: String,
    #[serde(rename = "resourceId")]
    pub resource_id: String,
    #[serde(rename = "operatorId")]
    pub operator_id: String,
    #[serde(rename = "eventType")]
    pub event_type: String,
    #[serde(rename = "payloadJson")]
    pub payload_json: String,
    #[serde(rename = "payloadHash")]
    pub payload_hash: String,
    #[serde(rename = "prevEventHash")]
    pub prev_event_hash: Option<String>,
    #[serde(rename = "eventHash")]
    pub event_hash: String,
    pub timestamp: u64,
    #[serde(rename = "sourceDeviceId")]
    pub source_device_id: String,
}

#[derive(Debug, Clone)]
pub struct AppendEventInput {
    pub workspace_id: String,
    pub resource_type: String,
    pub resource_id: String,
    pub operator_id: String,
    pub event_type: String,
    pub payload_json: String,
    pub source_device_id: String,
    pub timestamp: Option<u64>,
}

pub struct EventStore {
    data_dir: PathBuf,
}

impl EventStore {
    pub fn new(data_dir: PathBuf) -> Self {
        Self { data_dir }
    }

    pub fn append(&self, input: AppendEventInput) -> Result<WalEventRecord, String> {
        let payload_hash = sha256_hex(input.payload_json.as_bytes());
        let last = self.read_last_record(&input.workspace_id)?;
        let seq = last.as_ref().map(|record| record.seq + 1).unwrap_or(1);
        let prev_event_hash = last.map(|record| record.event_hash);
        let event_id = Uuid::new_v4().to_string();
        let timestamp = input.timestamp.unwrap_or_else(current_timestamp_ms);
        let event_hash = compute_event_hash(
            &event_id,
            &input.workspace_id,
            seq,
            &input.resource_type,
            &input.resource_id,
            &input.operator_id,
            &input.event_type,
            &payload_hash,
            prev_event_hash.as_deref(),
            timestamp,
            &input.source_device_id,
        );

        let record = WalEventRecord {
            event_id,
            workspace_id: input.workspace_id,
            seq,
            resource_type: input.resource_type,
            resource_id: input.resource_id,
            operator_id: input.operator_id,
            event_type: input.event_type,
            payload_json: input.payload_json,
            payload_hash,
            prev_event_hash,
            event_hash,
            timestamp,
            source_device_id: input.source_device_id,
        };

        self.append_wal_record(&record)?;
        self.write_cached_last_seq(&record.workspace_id, record.seq)?;
        Ok(record)
    }

    pub fn list_since(&self, workspace_id: &str, since_seq: u64, limit: usize) -> Result<Vec<WalEventRecord>, String> {
        let path = self.wal_path(workspace_id);
        if !path.exists() {
            return Ok(Vec::new());
        }

        let file = File::open(&path).map_err(|error| error.to_string())?;
        let reader = BufReader::new(file);
        let mut records = Vec::new();

        for line in reader.lines() {
            let line = line.map_err(|error| error.to_string())?;
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            let record: WalEventRecord =
                serde_json::from_str(trimmed).map_err(|error| format!("invalid WAL line: {error}"))?;
            if record.seq > since_seq {
                records.push(record);
            }
        }

        records.sort_by_key(|record| record.seq);
        if records.len() > limit {
            records.truncate(limit);
        }
        Ok(records)
    }

    fn wal_path(&self, workspace_id: &str) -> PathBuf {
        self.data_dir
            .join("p2p")
            .join("workspaces")
            .join(workspace_id)
            .join("events.wal.jsonl")
    }

    fn last_seq_path(&self, workspace_id: &str) -> PathBuf {
        self.data_dir
            .join("p2p")
            .join("workspaces")
            .join(workspace_id)
            .join("events.wal.last_seq")
    }

    fn read_cached_last_seq(&self, workspace_id: &str) -> Option<u64> {
        let path = self.last_seq_path(workspace_id);
        if !path.exists() {
            return None;
        }
        let raw = fs::read_to_string(&path).ok()?;
        raw.trim().parse::<u64>().ok()
    }

    fn write_cached_last_seq(&self, workspace_id: &str, seq: u64) -> Result<(), String> {
        let path = self.last_seq_path(workspace_id);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        fs::write(path, seq.to_string()).map_err(|error| error.to_string())
    }

    fn read_last_record(&self, workspace_id: &str) -> Result<Option<WalEventRecord>, String> {
        let path = self.wal_path(workspace_id);
        if !path.exists() {
            return Ok(None);
        }

        let file = File::open(&path).map_err(|error| error.to_string())?;
        let reader = BufReader::new(file);
        let mut last: Option<WalEventRecord> = None;

        for line in reader.lines() {
            let line = line.map_err(|error| error.to_string())?;
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            let record: WalEventRecord =
                serde_json::from_str(trimmed).map_err(|error| format!("invalid WAL line: {error}"))?;
            last = Some(record);
        }

        Ok(last)
    }

    fn append_wal_record(&self, record: &WalEventRecord) -> Result<(), String> {
        let path = self.wal_path(&record.workspace_id);
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }

        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
            .map_err(|error| error.to_string())?;

        let line = serde_json::to_string(record).map_err(|error| error.to_string())?;
        writeln!(file, "{line}").map_err(|error| error.to_string())?;
        Ok(())
    }
}

pub fn sha256_hex(data: &[u8]) -> String {
    let digest = Sha256::digest(data);
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

pub fn compute_event_hash(
    event_id: &str,
    workspace_id: &str,
    seq: u64,
    resource_type: &str,
    resource_id: &str,
    operator_id: &str,
    event_type: &str,
    payload_hash: &str,
    prev_event_hash: Option<&str>,
    timestamp: u64,
    source_device_id: &str,
) -> String {
    let prev = prev_event_hash.unwrap_or("");
    let material = format!(
        "{event_id}|{workspace_id}|{seq}|{resource_type}|{resource_id}|{operator_id}|{event_type}|{payload_hash}|{prev}|{timestamp}|{source_device_id}"
    );
    sha256_hex(material.as_bytes())
}

fn current_timestamp_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_data_dir() -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        std::env::temp_dir().join(format!("toolman-event-store-{nanos}"))
    }

    #[test]
    fn append_builds_hash_chain() {
        let data_dir = temp_data_dir();
        let store = EventStore::new(data_dir.clone());
        let workspace_id = Uuid::new_v4().to_string();

        let first = store
            .append(AppendEventInput {
                workspace_id: workspace_id.clone(),
                resource_type: "Workspace".to_string(),
                resource_id: workspace_id.clone(),
                operator_id: "member-1".to_string(),
                event_type: "Created".to_string(),
                payload_json: r#"{"name":"测试群"}"#.to_string(),
                source_device_id: "device-1".to_string(),
                timestamp: Some(1_700_000_000_000),
            })
            .expect("first append");

        assert_eq!(first.seq, 1);
        assert!(first.prev_event_hash.is_none());
        assert!(!first.event_hash.is_empty());

        let second = store
            .append(AppendEventInput {
                workspace_id: workspace_id.clone(),
                resource_type: "Member".to_string(),
                resource_id: "member-2".to_string(),
                operator_id: "member-2".to_string(),
                event_type: "Joined".to_string(),
                payload_json: r#"{"display_name":"张三"}"#.to_string(),
                source_device_id: "device-2".to_string(),
                timestamp: Some(1_700_000_000_100),
            })
            .expect("second append");

        assert_eq!(second.seq, 2);
        assert_eq!(second.prev_event_hash.as_deref(), Some(first.event_hash.as_str()));

        let listed = store.list_since(&workspace_id, 0, 10).expect("list");
        assert_eq!(listed.len(), 2);

        let _ = fs::remove_dir_all(data_dir);
    }

    #[test]
    fn list_since_respects_limit_and_offset_seq() {
        let data_dir = temp_data_dir();
        let store = EventStore::new(data_dir.clone());
        let workspace_id = Uuid::new_v4().to_string();

        for index in 1..=5 {
            store
                .append(AppendEventInput {
                    workspace_id: workspace_id.clone(),
                    resource_type: "File".to_string(),
                    resource_id: format!("file-{index}"),
                    operator_id: "member-1".to_string(),
                    event_type: "Shared".to_string(),
                    payload_json: format!(r#"{{"index":{index}}}"#),
                    source_device_id: "device-1".to_string(),
                    timestamp: Some(1_700_000_000_000 + index),
                })
                .expect("append");
        }

        let after_two = store.list_since(&workspace_id, 2, 10).expect("list");
        assert_eq!(after_two.len(), 3);
        assert_eq!(after_two[0].seq, 3);

        let limited = store.list_since(&workspace_id, 0, 2).expect("limited");
        assert_eq!(limited.len(), 2);
        assert_eq!(limited[0].seq, 1);
        assert_eq!(limited[1].seq, 2);

        let _ = fs::remove_dir_all(data_dir);
    }
}
