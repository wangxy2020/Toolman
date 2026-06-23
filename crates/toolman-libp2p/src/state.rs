use std::sync::{Arc, RwLock};
use std::time::{SystemTime, UNIX_EPOCH};

use once_cell::sync::Lazy;
use tokio::sync::oneshot;

use crate::config::NetworkConfig;

#[derive(Clone, Debug)]
pub struct ConnectedPeer {
    pub peer_id: String,
    pub transport: String,
    pub connected_at_ms: u64,
}

#[derive(Clone, Debug, Default)]
pub struct DhtStatus {
    pub mode: String,
    pub bootstrap_count: usize,
    pub ready: bool,
    pub last_error: Option<String>,
}

#[derive(Clone, Debug, Default)]
pub struct NetworkSnapshot {
    pub running: bool,
    pub local_peer_id: Option<String>,
    pub peers: Vec<ConnectedPeer>,
    pub dht: DhtStatus,
    pub last_error: Option<String>,
}

pub struct NetworkRuntime {
    pub config: NetworkConfig,
    pub snapshot: Arc<RwLock<NetworkSnapshot>>,
    pub shutdown: Option<oneshot::Sender<()>>,
}

pub static NETWORK_RUNTIME: Lazy<RwLock<Option<NetworkRuntime>>> =
    Lazy::new(|| RwLock::new(None));

pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

pub fn set_running(snapshot: &Arc<RwLock<NetworkSnapshot>>, local_peer_id: String, config: &NetworkConfig) {
    if let Ok(mut guard) = snapshot.write() {
        guard.running = true;
        guard.local_peer_id = Some(local_peer_id);
        guard.last_error = None;
        guard.dht = DhtStatus {
            mode: config.dht_mode.clone(),
            bootstrap_count: config.bootstrap_multiaddrs.len(),
            ready: false,
            last_error: None,
        };
    }
}

pub fn set_stopped(snapshot: &Arc<RwLock<NetworkSnapshot>>) {
    if let Ok(mut guard) = snapshot.write() {
        guard.running = false;
        guard.peers.clear();
        guard.local_peer_id = None;
        guard.dht.ready = false;
    }
}

pub fn upsert_peer(snapshot: &Arc<RwLock<NetworkSnapshot>>, peer_id: String, transport: String) {
    if let Ok(mut guard) = snapshot.write() {
        if let Some(existing) = guard.peers.iter_mut().find(|peer| peer.peer_id == peer_id) {
            existing.transport = transport;
            return;
        }
        guard.peers.push(ConnectedPeer {
            peer_id,
            transport,
            connected_at_ms: now_ms(),
        });
    }
}

pub fn remove_peer(snapshot: &Arc<RwLock<NetworkSnapshot>>, peer_id: &str) {
    if let Ok(mut guard) = snapshot.write() {
        guard.peers.retain(|peer| peer.peer_id != peer_id);
    }
}

pub fn set_dht_ready(snapshot: &Arc<RwLock<NetworkSnapshot>>, ready: bool, error: Option<String>) {
    if let Ok(mut guard) = snapshot.write() {
        guard.dht.ready = ready;
        guard.dht.last_error = error.clone();
        if let Some(message) = error {
            guard.last_error = Some(message);
        }
    }
}

pub fn read_snapshot(snapshot: &Arc<RwLock<NetworkSnapshot>>) -> NetworkSnapshot {
    snapshot
        .read()
        .map(|guard| guard.clone())
        .unwrap_or_default()
}
