use once_cell::sync::Lazy;
use std::collections::HashMap;
use std::sync::Mutex;
use tokio::sync::{Mutex as AsyncMutex, Notify};

use crate::connection::webrtc_session::WebRtcSession;
use crate::connection::ConnectionManager;
use crate::crypto::WorkspaceKeyRegistry;
use crate::discovery::NodeDiscoveryService;

pub static DISCOVERY: Lazy<Mutex<NodeDiscoveryService>> =
    Lazy::new(|| Mutex::new(NodeDiscoveryService::new()));

pub static CONNECTIONS: Lazy<AsyncMutex<ConnectionManager>> =
    Lazy::new(|| AsyncMutex::new(ConnectionManager::new()));

pub static WORKSPACE_KEYS: Lazy<Mutex<WorkspaceKeyRegistry>> =
    Lazy::new(|| Mutex::new(WorkspaceKeyRegistry::default()));

pub static ICE_SERVERS: Lazy<Mutex<Vec<String>>> = Lazy::new(|| {
    Mutex::new(vec!["stun:stun.l.google.com:19302".to_string()])
});

pub struct PendingInviteHandshake {
    pub invite_id: String,
    pub workspace_id: Option<String>,
    pub offer_sdp: String,
    pub session: std::sync::Arc<AsyncMutex<WebRtcSession>>,
    pub answer_sdp: Mutex<Option<String>>,
    pub answer_notify: Notify,
}

pub static PENDING_INVITES: Lazy<AsyncMutex<HashMap<String, PendingInviteHandshake>>> =
    Lazy::new(|| AsyncMutex::new(HashMap::new()));

pub static INVITE_UDP_ANSWERS: Lazy<Mutex<HashMap<String, String>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

pub fn configured_ice_servers() -> Vec<String> {
    ICE_SERVERS
        .lock()
        .map(|servers| servers.clone())
        .unwrap_or_else(|_| vec!["stun:stun.l.google.com:19302".to_string()])
}

pub fn set_configured_ice_servers(servers: Vec<String>) {
    if let Ok(mut guard) = ICE_SERVERS.lock() {
        *guard = if servers.is_empty() {
            vec!["stun:stun.l.google.com:19302".to_string()]
        } else {
            servers
        };
    }
}
