use std::collections::HashMap;
use std::net::{IpAddr, Ipv4Addr};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use mdns_sd::{ServiceDaemon, ServiceEvent, ServiceInfo};

pub const SERVICE_TYPE: &str = "_toolman-p2p._udp.local.";
pub const SERVICE_PORT: u16 = 39271;
pub const NODE_TTL_MS: u64 = 30_000;

#[derive(Clone, Debug)]
pub struct DiscoveryConfig {
    pub device_id: String,
    pub device_name: String,
    pub user_name: String,
    pub public_key_fingerprint: String,
    pub app_version: String,
}

#[derive(Clone, Debug)]
pub struct DiscoveredNode {
    pub device_id: String,
    pub device_name: String,
    pub user_name: String,
    pub public_key_fingerprint: String,
    pub online: bool,
    pub last_seen_at: u64,
}

struct NodeRecord {
    node: DiscoveredNode,
    service_name: String,
    properties: HashMap<String, String>,
}

struct RegistrationContext {
    instance_name: String,
    host_name: String,
    local_ip: IpAddr,
    base_properties: HashMap<String, String>,
    extra_properties: HashMap<String, String>,
}

pub struct NodeDiscoveryService {
    daemon: Option<ServiceDaemon>,
    browse_handle: Option<JoinHandle<()>>,
    prune_handle: Option<JoinHandle<()>>,
    prune_stop: Option<Arc<AtomicBool>>,
    nodes: Arc<Mutex<HashMap<String, NodeRecord>>>,
    local_device_id: Option<String>,
    registration: Option<RegistrationContext>,
}

impl NodeDiscoveryService {
    pub fn new() -> Self {
        Self {
            daemon: None,
            browse_handle: None,
            prune_handle: None,
            prune_stop: None,
            nodes: Arc::new(Mutex::new(HashMap::new())),
            local_device_id: None,
            registration: None,
        }
    }

    pub fn is_running(&self) -> bool {
        self.daemon.is_some()
    }

    pub fn local_device_id(&self) -> Option<String> {
        self.local_device_id.clone()
    }

    pub fn get_peer_properties(&self, device_id: &str) -> Option<HashMap<String, String>> {
        let map = self.nodes.lock().ok()?;
        map.get(device_id)
            .map(|record| record.properties.clone())
    }

    pub fn update_service_properties(
        &mut self,
        extra_properties: HashMap<String, String>,
    ) -> Result<(), String> {
        let daemon = self
            .daemon
            .as_ref()
            .ok_or_else(|| "Discovery is not running".to_string())?;
        let registration = self
            .registration
            .as_mut()
            .ok_or_else(|| "Discovery registration unavailable".to_string())?;

        registration.extra_properties = extra_properties;
        let mut properties = registration.base_properties.clone();
        properties.extend(registration.extra_properties.clone());

        let service_info = ServiceInfo::new(
            SERVICE_TYPE,
            &registration.instance_name,
            &registration.host_name,
            registration.local_ip,
            SERVICE_PORT,
            properties,
        )
        .map_err(|e| e.to_string())?;

        daemon.register(service_info).map_err(|e| e.to_string())
    }

    pub fn start(&mut self, config: DiscoveryConfig) -> Result<(), String> {
        if self.daemon.is_some() {
            return Ok(());
        }

        let daemon = ServiceDaemon::new().map_err(|e| e.to_string())?;
        let local_ip = pick_local_ipv4().ok_or_else(|| {
            "No non-loopback IPv4 address found for mDNS registration".to_string()
        })?;

        let instance_name = sanitize_instance_name(&config.device_name, &config.device_id);
        let host_name = format!("{}.local.", sanitize_hostname(&config.device_name));
        let base_properties: HashMap<String, String> = HashMap::from([
            ("device_id".to_string(), config.device_id.clone()),
            ("user_name".to_string(), config.user_name.clone()),
            ("device_name".to_string(), config.device_name.clone()),
            (
                "pubkey_fp".to_string(),
                config.public_key_fingerprint.clone(),
            ),
            ("app_version".to_string(), config.app_version.clone()),
        ]);

        let service_info = ServiceInfo::new(
            SERVICE_TYPE,
            &instance_name,
            &host_name,
            IpAddr::V4(local_ip),
            SERVICE_PORT,
            base_properties.clone(),
        )
        .map_err(|e| e.to_string())?;

        daemon.register(service_info).map_err(|e| e.to_string())?;

        let receiver = daemon.browse(SERVICE_TYPE).map_err(|e| e.to_string())?;
        let nodes = Arc::clone(&self.nodes);
        let local_device_id = config.device_id.clone();
        let browse_handle = thread::spawn(move || {
            while let Ok(event) = receiver.recv() {
                match event {
                    ServiceEvent::ServiceResolved(info) => {
                        if let Some(node) = node_from_service_info(&info) {
                            if node.device_id == local_device_id {
                                continue;
                            }
                            let properties = collect_service_properties(&info);
                            let mut map = match nodes.lock() {
                                Ok(map) => map,
                                Err(_) => continue,
                            };
                            map.insert(
                                node.device_id.clone(),
                                NodeRecord {
                                    service_name: info.get_fullname().to_string(),
                                    properties,
                                    node: DiscoveredNode {
                                        online: true,
                                        last_seen_at: now_ms(),
                                        ..node
                                    },
                                },
                            );
                        }
                    }
                    ServiceEvent::ServiceRemoved(service_name, _) => {
                        let mut map = match nodes.lock() {
                            Ok(map) => map,
                            Err(_) => continue,
                        };
                        let device_id = map
                            .iter()
                            .find(|(_, record)| record.service_name == service_name)
                            .map(|(id, _)| id.clone());
                        if let Some(device_id) = device_id {
                            if let Some(record) = map.get_mut(&device_id) {
                                record.node.online = false;
                                record.node.last_seen_at = now_ms();
                            }
                        }
                    }
                    _ => {}
                }
            }
        });

        let nodes_for_prune = Arc::clone(&self.nodes);
        let prune_stop = Arc::new(AtomicBool::new(false));
        let prune_stop_flag = Arc::clone(&prune_stop);
        let prune_handle = thread::spawn(move || {
            while !prune_stop_flag.load(Ordering::Relaxed) {
                thread::sleep(Duration::from_secs(5));
                let now = now_ms();
                let mut map = match nodes_for_prune.lock() {
                    Ok(map) => map,
                    Err(_) => continue,
                };
                map.retain(|_, record| {
                    if !record.node.online {
                        return now.saturating_sub(record.node.last_seen_at) < NODE_TTL_MS * 4;
                    }
                    if now.saturating_sub(record.node.last_seen_at) > NODE_TTL_MS {
                        record.node.online = false;
                    }
                    true
                });
            }
        });

        self.local_device_id = Some(config.device_id);
        self.registration = Some(RegistrationContext {
            instance_name,
            host_name,
            local_ip: IpAddr::V4(local_ip),
            base_properties,
            extra_properties: HashMap::new(),
        });
        self.daemon = Some(daemon);
        self.browse_handle = Some(browse_handle);
        self.prune_stop = Some(prune_stop);
        self.prune_handle = Some(prune_handle);
        Ok(())
    }

    pub fn stop(&mut self) {
        if let Some(flag) = self.prune_stop.take() {
            flag.store(true, Ordering::Relaxed);
        }
        if let Some(daemon) = self.daemon.take() {
            let _ = daemon.shutdown();
        }
        if let Some(handle) = self.browse_handle.take() {
            let _ = handle.join();
        }
        if let Some(handle) = self.prune_handle.take() {
            let _ = handle.join();
        }
        if let Ok(mut map) = self.nodes.lock() {
            map.clear();
        }
        self.local_device_id = None;
        self.registration = None;
    }

    pub fn list_nodes(&self, online_only: bool) -> Vec<DiscoveredNode> {
        let now = now_ms();
        let map = match self.nodes.lock() {
            Ok(map) => map,
            Err(_) => return Vec::new(),
        };

        map.values()
            .map(|record| record.node.clone())
            .filter(|node| {
                let fresh = now.saturating_sub(node.last_seen_at) <= NODE_TTL_MS;
                let online = node.online && fresh;
                if online_only {
                    online
                } else {
                    online || now.saturating_sub(node.last_seen_at) <= NODE_TTL_MS * 4
                }
            })
            .map(|mut node| {
                let fresh = now.saturating_sub(node.last_seen_at) <= NODE_TTL_MS;
                node.online = node.online && fresh;
                node
            })
            .collect()
    }
}

impl Default for NodeDiscoveryService {
    fn default() -> Self {
        Self::new()
    }
}

fn collect_service_properties(info: &ServiceInfo) -> HashMap<String, String> {
    let mut properties = HashMap::new();
    for prop in info.get_properties().iter() {
        properties.insert(prop.key().to_string(), prop.val_str().to_string());
    }
    properties
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn pick_local_ipv4() -> Option<Ipv4Addr> {
    let interfaces = if_addrs::get_if_addrs().ok()?;
    for iface in interfaces {
        if iface.is_loopback() {
            continue;
        }
        if let IpAddr::V4(ipv4) = iface.ip() {
            if !ipv4.is_loopback() {
                return Some(ipv4);
            }
        }
    }
    None
}

fn sanitize_instance_name(device_name: &str, device_id: &str) -> String {
    let base: String = device_name
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' { c } else { '-' })
        .collect();
    let trimmed: String = base.trim_matches('-').chars().take(40).collect();
    if trimmed.is_empty() {
        format!("toolman-{}", &device_id[..8.min(device_id.len())])
    } else {
        trimmed
    }
}

fn sanitize_hostname(device_name: &str) -> String {
    let base: String = device_name
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' { c } else { '-' })
        .collect();
    let trimmed: String = base.trim_matches('-').chars().take(63).collect();
    if trimmed.is_empty() {
        "toolman".to_string()
    } else {
        trimmed
    }
}

fn node_from_service_info(info: &ServiceInfo) -> Option<DiscoveredNode> {
    let device_id = info.get_property_val_str("device_id")?.to_string();
    let device_name = info
        .get_property_val_str("device_name")
        .unwrap_or_else(|| info.get_fullname())
        .to_string();
    let user_name = info
        .get_property_val_str("user_name")
        .unwrap_or("Unknown")
        .to_string();
    let public_key_fingerprint = info
        .get_property_val_str("pubkey_fp")
        .unwrap_or("pending")
        .to_string();

    Some(DiscoveredNode {
        device_id,
        device_name,
        user_name,
        public_key_fingerprint,
        online: true,
        last_seen_at: now_ms(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitize_instance_name_fallback() {
        let name = sanitize_instance_name("!!!", "abcdef01-2345-6789");
        assert!(name.starts_with("toolman-"));
    }
}
