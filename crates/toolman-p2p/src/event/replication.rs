use serde::{Deserialize, Serialize};

pub const PROTOCOL_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteWorkspaceEvent {
    pub event_id: String,
    pub workspace_id: String,
    pub seq: u64,
    pub resource_type: String,
    pub resource_id: String,
    pub operator_id: String,
    pub event_type: String,
    pub payload_json: String,
    pub payload_hash: String,
    pub prev_event_hash: Option<String>,
    pub timestamp: u64,
    pub source_device_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ReplicationMessage {
    #[serde(rename = "sync.hello")]
    SyncHello {
        #[serde(default = "default_version")]
        v: u32,
        workspace_id: String,
        device_id: String,
        last_received_seq: u64,
        latest_seq: u64,
    },
    #[serde(rename = "sync.hello_ack")]
    SyncHelloAck {
        #[serde(default = "default_version")]
        v: u32,
        workspace_id: String,
        device_id: String,
        last_received_seq: u64,
        latest_seq: u64,
    },
    #[serde(rename = "events.request")]
    EventsRequest {
        #[serde(default = "default_version")]
        v: u32,
        workspace_id: String,
        since_seq: u64,
    },
    #[serde(rename = "events.batch")]
    EventsBatch {
        #[serde(default = "default_version")]
        v: u32,
        workspace_id: String,
        events: Vec<RemoteWorkspaceEvent>,
    },
}

fn default_version() -> u32 {
    PROTOCOL_VERSION
}

pub fn parse_replication_message(payload: &[u8]) -> Result<ReplicationMessage, String> {
    serde_json::from_slice(payload).map_err(|error| format!("invalid replication message: {error}"))
}

pub fn encode_replication_message(message: &ReplicationMessage) -> Result<Vec<u8>, String> {
    serde_json::to_vec(message).map_err(|error| format!("failed to encode replication message: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip_sync_hello() {
        let message = ReplicationMessage::SyncHello {
            v: PROTOCOL_VERSION,
            workspace_id: "ws-1".to_string(),
            device_id: "dev-1".to_string(),
            last_received_seq: 3,
            latest_seq: 5,
        };
        let encoded = encode_replication_message(&message).expect("encode");
        let decoded = parse_replication_message(&encoded).expect("decode");
        match decoded {
            ReplicationMessage::SyncHello {
                workspace_id,
                latest_seq,
                ..
            } => {
                assert_eq!(workspace_id, "ws-1");
                assert_eq!(latest_seq, 5);
            }
            _ => panic!("unexpected variant"),
        }
    }
}
