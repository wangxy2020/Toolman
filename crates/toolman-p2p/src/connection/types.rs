use std::sync::Arc;

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ConnectionState {
    Idle,
    Signaling,
    Connecting,
    Connected,
    Reconnecting,
    Closed,
}

impl ConnectionState {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Idle => "idle",
            Self::Signaling => "signaling",
            Self::Connecting => "connecting",
            Self::Connected => "connected",
            Self::Reconnecting => "reconnecting",
            Self::Closed => "closed",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ConnectionMode {
    Lan,
    Wan,
}

impl ConnectionMode {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Lan => "lan",
            Self::Wan => "wan",
        }
    }
}

#[derive(Clone, Debug)]
pub struct ConnectionInfo {
    pub peer_device_id: String,
    pub state: ConnectionState,
    pub workspace_id: Option<String>,
    pub connected_at: Option<u64>,
    pub bytes_sent: u64,
    pub bytes_received: u64,
    pub connection_mode: Option<ConnectionMode>,
}

pub const EVENTS_CHANNEL_LABEL: &str = "events";
pub const FILES_CHANNEL_LABEL: &str = "files";
pub const HANDSHAKE_PING: &[u8] = b"toolman-p2p-ping";
pub const HANDSHAKE_PONG: &[u8] = b"toolman-p2p-pong";

pub type SharedPeerConnection = Arc<webrtc::peer_connection::RTCPeerConnection>;
pub type SharedDataChannel = Arc<webrtc::data_channel::RTCDataChannel>;
