use once_cell::sync::Lazy;
use std::collections::HashMap;
use std::sync::Mutex;
use tokio::sync::Mutex as AsyncMutex;

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

#[derive(Clone, Debug)]
pub struct IceServerEntry {
    pub urls: Vec<String>,
    pub username: Option<String>,
    pub credential: Option<String>,
}

fn default_ice_servers() -> Vec<IceServerEntry> {
    vec![IceServerEntry {
        urls: vec!["stun:stun.l.google.com:19302".to_string()],
        username: None,
        credential: None,
    }]
}

pub static ICE_SERVERS: Lazy<Mutex<Vec<IceServerEntry>>> =
    Lazy::new(|| Mutex::new(default_ice_servers()));

pub struct PendingInviteHandshake {
    pub session: std::sync::Arc<AsyncMutex<WebRtcSession>>,
}

pub static PENDING_INVITES: Lazy<AsyncMutex<HashMap<String, PendingInviteHandshake>>> =
    Lazy::new(|| AsyncMutex::new(HashMap::new()));

pub static INVITE_UDP_ANSWERS: Lazy<Mutex<HashMap<String, String>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

pub fn configured_ice_server_entries() -> Vec<IceServerEntry> {
    ICE_SERVERS
        .lock()
        .map(|servers| servers.clone())
        .unwrap_or_else(|_| default_ice_servers())
}

/** Legacy flat URL list (STUN + TURN urls). */
pub fn configured_ice_servers() -> Vec<String> {
    configured_ice_server_entries()
        .into_iter()
        .flat_map(|entry| entry.urls)
        .collect()
}

pub fn set_configured_ice_server_entries(servers: Vec<IceServerEntry>) {
    if let Ok(mut guard) = ICE_SERVERS.lock() {
        *guard = if servers.is_empty() {
            default_ice_servers()
        } else {
            servers
        };
    }
}

pub fn set_configured_ice_servers(servers: Vec<String>) {
    let entries = if servers.is_empty() {
        default_ice_servers()
    } else {
        servers
            .into_iter()
            .map(|url| IceServerEntry {
                urls: vec![url],
                username: None,
                credential: None,
            })
            .collect()
    };
    set_configured_ice_server_entries(entries);
}
