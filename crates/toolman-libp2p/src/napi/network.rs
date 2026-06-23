use napi_derive::napi;

use super::snapshot_internal;

#[napi(object)]
pub struct NapiLibp2pPeer {
    #[napi(js_name = "peerId")]
    pub peer_id: String,
    pub transport: String,
    #[napi(js_name = "connectedAt")]
    pub connected_at: f64,
}

#[napi(object)]
pub struct NapiDhtHealth {
    pub mode: String,
    #[napi(js_name = "bootstrapCount")]
    pub bootstrap_count: u32,
    pub ready: bool,
    pub error: Option<String>,
}

#[napi(object)]
pub struct NapiNetworkPeerList {
    pub peers: Vec<NapiLibp2pPeer>,
}

#[napi]
pub fn network_list_peers() -> napi::Result<NapiNetworkPeerList> {
    let snapshot = snapshot_internal();
    Ok(NapiNetworkPeerList {
        peers: snapshot
            .peers
            .into_iter()
            .map(|peer| NapiLibp2pPeer {
                peer_id: peer.peer_id,
                transport: peer.transport,
                connected_at: peer.connected_at_ms as f64,
            })
            .collect(),
    })
}

#[napi(object)]
pub struct NapiNetworkSnapshot {
    pub running: bool,
    #[napi(js_name = "localPeerId")]
    pub local_peer_id: Option<String>,
    #[napi(js_name = "peerCount")]
    pub peer_count: u32,
    pub peers: Vec<NapiLibp2pPeer>,
    pub dht: NapiDhtHealth,
    pub error: Option<String>,
}

#[napi]
pub fn network_get_snapshot() -> napi::Result<NapiNetworkSnapshot> {
    let snapshot = snapshot_internal();
    Ok(NapiNetworkSnapshot {
        running: snapshot.running,
        local_peer_id: snapshot.local_peer_id.clone(),
        peer_count: snapshot.peers.len() as u32,
        peers: snapshot
            .peers
            .into_iter()
            .map(|peer| NapiLibp2pPeer {
                peer_id: peer.peer_id,
                transport: peer.transport,
                connected_at: peer.connected_at_ms as f64,
            })
            .collect(),
        dht: NapiDhtHealth {
            mode: snapshot.dht.mode,
            bootstrap_count: snapshot.dht.bootstrap_count as u32,
            ready: snapshot.dht.ready,
            error: snapshot.dht.last_error,
        },
        error: snapshot.last_error,
    })
}
