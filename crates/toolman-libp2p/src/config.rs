use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct NetworkConfig {
    #[serde(default = "default_mdns_enabled")]
    pub mdns_enabled: bool,
    #[serde(default = "default_dht_mode")]
    pub dht_mode: String,
    #[serde(default)]
    pub bootstrap_multiaddrs: Vec<String>,
}

fn default_mdns_enabled() -> bool {
    true
}

fn default_dht_mode() -> String {
    "client".to_string()
}

impl Default for NetworkConfig {
    fn default() -> Self {
        Self {
            mdns_enabled: default_mdns_enabled(),
            dht_mode: default_dht_mode(),
            bootstrap_multiaddrs: Vec::new(),
        }
    }
}

impl NetworkConfig {
    pub fn parse(raw: &str) -> Self {
        serde_json::from_str(raw).unwrap_or_default()
    }

    pub fn dht_enabled(&self) -> bool {
        self.dht_mode != "off"
    }

    pub fn dht_server(&self) -> bool {
        self.dht_mode == "server"
    }
}
