mod local_beacon;
mod node_discovery;

pub use local_beacon::read_peer_beacon;
pub use node_discovery::{DiscoveryConfig, NodeDiscoveryService};
