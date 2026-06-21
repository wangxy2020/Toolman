use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

pub const LOCAL_BEACON_DIR: &str = "/tmp/toolman-p2p-beacon";
const BEACON_TTL_MS: u64 = 15_000;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LocalBeaconRecord {
    pub device_id: String,
    pub device_name: String,
    pub user_name: String,
    pub pubkey_fp: String,
    pub app_version: String,
    pub updated_at: u64,
    #[serde(default)]
    pub properties: HashMap<String, String>,
}

pub fn beacon_dir() -> PathBuf {
    std::env::var("TOOLMAN_P2P_BEACON_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from(LOCAL_BEACON_DIR))
}

fn beacon_path(device_id: &str) -> PathBuf {
    beacon_dir().join(format!("{device_id}.json"))
}

pub fn write_local_beacon(record: &LocalBeaconRecord) -> Result<(), String> {
    let dir = beacon_dir();
    fs::create_dir_all(&dir).map_err(|error| format!("Failed to create beacon dir: {error}"))?;
    let path = beacon_path(&record.device_id);
    let tmp = path.with_extension("json.tmp");
    let json =
        serde_json::to_string(record).map_err(|error| format!("Failed to encode beacon: {error}"))?;
    fs::write(&tmp, json).map_err(|error| format!("Failed to write beacon: {error}"))?;
    fs::rename(&tmp, &path).map_err(|error| format!("Failed to publish beacon: {error}"))?;
    Ok(())
}

pub fn read_peer_beacon(
    local_device_id: &str,
    peer_device_id: &str,
    now_ms: u64,
) -> Option<LocalBeaconRecord> {
    if peer_device_id == local_device_id {
        return None;
    }
    let path = beacon_path(peer_device_id);
    let text = fs::read_to_string(path).ok()?;
    let record = serde_json::from_str::<LocalBeaconRecord>(&text).ok()?;
    if record.device_id != peer_device_id {
        return None;
    }
    if now_ms.saturating_sub(record.updated_at) > BEACON_TTL_MS {
        return None;
    }
    Some(record)
}

pub fn remove_local_beacon(device_id: &str) {
    let _ = fs::remove_file(beacon_path(device_id));
}

pub fn scan_local_beacons(local_device_id: &str, now_ms: u64) -> Vec<LocalBeaconRecord> {
    let dir = beacon_dir();
    let entries = match fs::read_dir(&dir) {
        Ok(entries) => entries,
        Err(_) => return Vec::new(),
    };

    let mut out = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|ext| ext.to_str()) != Some("json") {
            continue;
        }
        let Ok(text) = fs::read_to_string(&path) else {
            continue;
        };
        let Ok(record) = serde_json::from_str::<LocalBeaconRecord>(&text) else {
            continue;
        };
        if record.device_id == local_device_id {
            continue;
        }
        if now_ms.saturating_sub(record.updated_at) > BEACON_TTL_MS {
            continue;
        }
        out.push(record);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_beacon_dir(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!("toolman-p2p-beacon-test-{name}"))
    }

    #[test]
    fn round_trip_beacon_scan() {
        let dir = temp_beacon_dir("scan");
        std::env::set_var("TOOLMAN_P2P_BEACON_DIR", dir.to_string_lossy().to_string());

        let record = LocalBeaconRecord {
            device_id: "11111111-2222-3333-4444-555555555555".to_string(),
            device_name: "toolman-a".to_string(),
            user_name: "User A".to_string(),
            pubkey_fp: "abc123".to_string(),
            app_version: "0.1.0".to_string(),
            updated_at: now_ms(),
            properties: HashMap::from([("sig_target".to_string(), "peer-b".to_string())]),
        };
        write_local_beacon(&record).expect("write");

        let found = scan_local_beacons("22222222-3333-4444-5555-666666666666", now_ms());
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].device_id, record.device_id);
        assert_eq!(
            found[0].properties.get("sig_target").map(String::as_str),
            Some("peer-b")
        );

        remove_local_beacon(&record.device_id);
        std::env::remove_var("TOOLMAN_P2P_BEACON_DIR");
    }

    fn now_ms() -> u64 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0)
    }
}
