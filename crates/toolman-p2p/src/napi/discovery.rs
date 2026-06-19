use napi_derive::napi;

use crate::discovery::{DiscoveryConfig, NodeDiscoveryService};
use crate::state::DISCOVERY;

#[napi(object)]
pub struct NapiDiscoveryConfig {
    #[napi(js_name = "deviceId")]
    pub device_id: String,
    #[napi(js_name = "deviceName")]
    pub device_name: String,
    #[napi(js_name = "userName")]
    pub user_name: String,
    #[napi(js_name = "publicKeyFingerprint")]
    pub public_key_fingerprint: String,
    #[napi(js_name = "appVersion")]
    pub app_version: String,
}

#[napi(object)]
pub struct NapiDiscoveredNode {
    #[napi(js_name = "deviceId")]
    pub device_id: String,
    #[napi(js_name = "deviceName")]
    pub device_name: String,
    #[napi(js_name = "userName")]
    pub user_name: String,
    #[napi(js_name = "publicKeyFingerprint")]
    pub public_key_fingerprint: String,
    pub online: bool,
    #[napi(js_name = "lastSeenAt")]
    pub last_seen_at: f64,
}

#[napi]
pub fn discovery_start(config: NapiDiscoveryConfig) -> napi::Result<()> {
    let mut service = DISCOVERY
        .lock()
        .map_err(|_| napi::Error::from_reason("discovery service lock poisoned"))?;

    service
        .start(DiscoveryConfig {
            device_id: config.device_id,
            device_name: config.device_name,
            user_name: config.user_name,
            public_key_fingerprint: config.public_key_fingerprint,
            app_version: config.app_version,
        })
        .map_err(napi::Error::from_reason)?;

    Ok(())
}

#[napi]
pub fn discovery_stop() -> napi::Result<()> {
    let mut service = DISCOVERY
        .lock()
        .map_err(|_| napi::Error::from_reason("discovery service lock poisoned"))?;
    service.stop();
    Ok(())
}

#[napi]
pub fn discovery_is_running() -> napi::Result<bool> {
    let service = DISCOVERY
        .lock()
        .map_err(|_| napi::Error::from_reason("discovery service lock poisoned"))?;
    Ok(service.is_running())
}

#[napi]
pub fn discovery_list_nodes(online_only: Option<bool>) -> napi::Result<Vec<NapiDiscoveredNode>> {
    let service = DISCOVERY
        .lock()
        .map_err(|_| napi::Error::from_reason("discovery service lock poisoned"))?;

    Ok(service
        .list_nodes(online_only.unwrap_or(false))
        .into_iter()
        .map(|node| NapiDiscoveredNode {
            device_id: node.device_id,
            device_name: node.device_name,
            user_name: node.user_name,
            public_key_fingerprint: node.public_key_fingerprint,
            online: node.online,
            last_seen_at: node.last_seen_at as f64,
        })
        .collect())
}
