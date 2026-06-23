use std::collections::HashMap;
use std::net::{IpAddr, Ipv4Addr};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use mdns_sd::{ServiceDaemon, ServiceEvent, ServiceInfo};

use super::local_beacon::{self, LocalBeaconRecord};

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
    device_id: String,
    device_name: String,
    user_name: String,
    public_key_fingerprint: String,
    app_version: String,
    base_properties: HashMap<String, String>,
    extra_properties: HashMap<String, String>,
}

pub struct NodeDiscoveryService {
    daemon: Option<ServiceDaemon>,
    browse_handle: Option<JoinHandle<()>>,
    prune_handle: Option<JoinHandle<()>>,
    beacon_handle: Option<JoinHandle<()>>,
    prune_stop: Option<Arc<AtomicBool>>,
    beacon_stop: Option<Arc<AtomicBool>>,
    nodes: Arc<Mutex<HashMap<String, NodeRecord>>>,
    local_device_id: Option<String>,
    registration: Option<Arc<Mutex<RegistrationContext>>>,
}

impl NodeDiscoveryService {
    pub fn new() -> Self {
        Self {
            daemon: None,
            browse_handle: None,
            prune_handle: None,
            beacon_handle: None,
            prune_stop: None,
            beacon_stop: None,
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
        let now = now_ms();
        if let Some(local_device_id) = self.local_device_id.as_deref() {
            if let Some(record) = local_beacon::read_peer_beacon(local_device_id, device_id, now) {
                return Some(record.properties);
            }
        }

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
            .as_ref()
            .ok_or_else(|| "Discovery registration unavailable".to_string())?;
        let mut registration = registration
            .lock()
            .map_err(|_| "Discovery registration lock poisoned".to_string())?;

        registration.extra_properties = extra_properties;
        let mut properties = registration.base_properties.clone();
        properties.extend(registration.extra_properties.clone());

        let service_info = ServiceInfo::new(
            SERVICE_TYPE,
            &registration.instance_name,
            &registration.host_name,
            registration.local_ip,
            SERVICE_PORT,
            properties.clone(),
        )
        .map_err(|e| e.to_string())?;

        daemon.register(service_info).map_err(|e| e.to_string())?;
        publish_registration_beacon(&registration, &properties)
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
        let host_name = unique_service_host_name(&config.device_id);
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
        publish_registration_beacon_from_base(&config, &base_properties)?;

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

        self.local_device_id = Some(config.device_id.clone());
        let registration = Arc::new(Mutex::new(RegistrationContext {
            instance_name,
            host_name,
            local_ip: IpAddr::V4(local_ip),
            device_id: config.device_id.clone(),
            device_name: config.device_name.clone(),
            user_name: config.user_name.clone(),
            public_key_fingerprint: config.public_key_fingerprint.clone(),
            app_version: config.app_version.clone(),
            base_properties,
            extra_properties: HashMap::new(),
        }));
        self.registration = Some(Arc::clone(&registration));

        let nodes_for_beacon = Arc::clone(&self.nodes);
        let local_device_id_for_beacon = config.device_id.clone();
        let beacon_stop = Arc::new(AtomicBool::new(false));
        let beacon_stop_flag = Arc::clone(&beacon_stop);
        let beacon_handle = thread::spawn(move || {
            while !beacon_stop_flag.load(Ordering::Relaxed) {
                if let Ok(registration) = registration.lock() {
                    let mut properties = registration.base_properties.clone();
                    properties.extend(registration.extra_properties.clone());
                    let _ = publish_registration_beacon(&registration, &properties);
                }

                let now = now_ms();
                for record in local_beacon::scan_local_beacons(&local_device_id_for_beacon, now) {
                    let node = DiscoveredNode {
                        device_id: record.device_id.clone(),
                        device_name: record.device_name.clone(),
                        user_name: record.user_name.clone(),
                        public_key_fingerprint: record.pubkey_fp.clone(),
                        online: true,
                        last_seen_at: record.updated_at,
                    };
                    let mut map = match nodes_for_beacon.lock() {
                        Ok(map) => map,
                        Err(_) => continue,
                    };
                    map.insert(
                        record.device_id.clone(),
                        NodeRecord {
                            service_name: format!("local-beacon:{}", record.device_id),
                            properties: record.properties,
                            node,
                        },
                    );
                }

                thread::sleep(Duration::from_millis(500));
            }
        });

        self.daemon = Some(daemon);
        self.browse_handle = Some(browse_handle);
        self.prune_stop = Some(prune_stop);
        self.prune_handle = Some(prune_handle);
        self.beacon_stop = Some(beacon_stop);
        self.beacon_handle = Some(beacon_handle);
        Ok(())
    }

    pub fn stop(&mut self) {
        if let Some(device_id) = self.local_device_id.take() {
            local_beacon::remove_local_beacon(&device_id);
        }
        if let Some(flag) = self.beacon_stop.take() {
            flag.store(true, Ordering::Relaxed);
        }
        if let Some(flag) = self.prune_stop.take() {
            flag.store(true, Ordering::Relaxed);
        }
        if let Some(daemon) = self.daemon.take() {
            let _ = daemon.shutdown();
        }
        if let Some(handle) = self.browse_handle.take() {
            let _ = handle.join();
        }
        if let Some(handle) = self.beacon_handle.take() {
            let _ = handle.join();
        }
        if let Some(handle) = self.prune_handle.take() {
            let _ = handle.join();
        }
        if let Ok(mut map) = self.nodes.lock() {
            map.clear();
        }
        self.registration = None;
    }

    pub fn is_peer_online(&self, peer_device_id: &str) -> bool {
        let now = now_ms();
        if let Some(local_device_id) = self.local_device_id.as_deref() {
            if local_beacon::read_peer_beacon(local_device_id, peer_device_id, now).is_some() {
                return true;
            }
        }

        let map = match self.nodes.lock() {
            Ok(map) => map,
            Err(_) => return false,
        };
        map.get(peer_device_id)
            .map(|record| {
                let fresh = now.saturating_sub(record.node.last_seen_at) <= NODE_TTL_MS;
                record.node.online && fresh
            })
            .unwrap_or(false)
    }

    pub fn list_nodes(&self, online_only: bool) -> Vec<DiscoveredNode> {
        let now = now_ms();
        let map = match self.nodes.lock() {
            Ok(map) => map,
            Err(_) => return Vec::new(),
        };

        let mut nodes: Vec<DiscoveredNode> = map
            .values()
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
            .collect();

        if online_only {
            if let Some(local_device_id) = self.local_device_id.as_deref() {
                for record in local_beacon::scan_local_beacons(local_device_id, now) {
                    if nodes
                        .iter()
                        .any(|node| node.device_id == record.device_id && node.online)
                    {
                        continue;
                    }
                    nodes.retain(|node| node.device_id != record.device_id);
                    nodes.push(DiscoveredNode {
                        device_id: record.device_id.clone(),
                        device_name: record.device_name.clone(),
                        user_name: record.user_name.clone(),
                        public_key_fingerprint: record.pubkey_fp.clone(),
                        online: true,
                        last_seen_at: record.updated_at,
                    });
                }
            }
        }

        nodes
    }
}

impl Default for NodeDiscoveryService {
    fn default() -> Self {
        Self::new()
    }
}

fn publish_registration_beacon_from_base(
    config: &DiscoveryConfig,
    base_properties: &HashMap<String, String>,
) -> Result<(), String> {
    let record = LocalBeaconRecord {
        device_id: config.device_id.clone(),
        device_name: config.device_name.clone(),
        user_name: config.user_name.clone(),
        pubkey_fp: config.public_key_fingerprint.clone(),
        app_version: config.app_version.clone(),
        updated_at: now_ms(),
        properties: base_properties.clone(),
    };
    local_beacon::write_local_beacon(&record)
}

fn publish_registration_beacon(
    registration: &RegistrationContext,
    properties: &HashMap<String, String>,
) -> Result<(), String> {
    let record = LocalBeaconRecord {
        device_id: registration.device_id.clone(),
        device_name: registration.device_name.clone(),
        user_name: registration.user_name.clone(),
        pubkey_fp: registration.public_key_fingerprint.clone(),
        app_version: registration.app_version.clone(),
        updated_at: now_ms(),
        properties: properties.clone(),
    };
    local_beacon::write_local_beacon(&record)
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

fn device_id_slug(device_id: &str, max_len: usize) -> String {
    device_id
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .take(max_len)
        .collect()
}

fn sanitize_instance_name(device_name: &str, device_id: &str) -> String {
    let base: String = device_name
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' { c } else { '-' })
        .collect();
    let trimmed: String = base.trim_matches('-').chars().take(24).collect();
    let suffix = device_id_slug(device_id, 8);
    if trimmed.is_empty() {
        format!("toolman-{suffix}")
    } else {
        format!("{trimmed}-{suffix}")
    }
}

fn unique_service_host_name(device_id: &str) -> String {
    let slug = device_id_slug(device_id, 12);
    if slug.is_empty() {
        "toolman-p2p.local.".to_string()
    } else {
        format!("toolman-{slug}.local.")
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

    #[test]
    fn same_device_name_produces_distinct_service_names() {
        let host_a = unique_service_host_name("11111111-2222-3333-4444-555555555555");
        let host_b = unique_service_host_name("66666666-7777-8888-9999-000000000000");
        assert_ne!(host_a, host_b);

        let instance_a = sanitize_instance_name("WangxyMac", "11111111-2222-3333-4444-555555555555");
        let instance_b = sanitize_instance_name("WangxyMac", "66666666-7777-8888-9999-000000000000");
        assert_ne!(instance_a, instance_b);
    }
}
