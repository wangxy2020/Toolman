use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

#[derive(Debug, Clone)]
pub struct DhtProviderResult {
    pub cid: String,
    pub providers: Vec<String>,
    pub completed: bool,
    pub error: Option<String>,
    pub at_ms: u64,
}

static PROVIDER_RESULTS: OnceLock<Mutex<Vec<DhtProviderResult>>> = OnceLock::new();

fn inbox() -> &'static Mutex<Vec<DhtProviderResult>> {
    PROVIDER_RESULTS.get_or_init(|| Mutex::new(Vec::new()))
}

pub fn push_provider_result(result: DhtProviderResult) {
    if let Ok(mut guard) = inbox().lock() {
        guard.push(result);
        if guard.len() > 200 {
            let drain = guard.len() - 200;
            guard.drain(0..drain);
        }
    }
}

pub fn drain_provider_results() -> Vec<DhtProviderResult> {
    inbox()
        .lock()
        .map(|mut guard| std::mem::take(&mut *guard))
        .unwrap_or_default()
}

static ACTIVE_LOOKUPS: OnceLock<Mutex<HashMap<libp2p::kad::QueryId, String>>> = OnceLock::new();

pub fn track_provider_lookup(query_id: libp2p::kad::QueryId, cid: String) {
    if let Ok(mut guard) = ACTIVE_LOOKUPS.get_or_init(|| Mutex::new(HashMap::new())).lock() {
        guard.insert(query_id, cid);
    }
}

pub fn take_provider_lookup_cid(query_id: &libp2p::kad::QueryId) -> Option<String> {
    ACTIVE_LOOKUPS
        .get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
        .ok()
        .and_then(|mut guard| guard.remove(query_id))
}
