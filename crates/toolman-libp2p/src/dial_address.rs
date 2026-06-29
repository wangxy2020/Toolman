use std::collections::HashSet;
use std::net::{IpAddr, Ipv4Addr, UdpSocket};
use std::sync::OnceLock;

use libp2p::multiaddr::Protocol;
use libp2p::Multiaddr;

fn local_ipv4_addresses() -> HashSet<Ipv4Addr> {
    static CACHE: OnceLock<HashSet<Ipv4Addr>> = OnceLock::new();
    CACHE
        .get_or_init(|| {
            let mut addrs = HashSet::new();
            addrs.insert(Ipv4Addr::LOCALHOST);
            if let Ok(socket) = UdpSocket::bind("0.0.0.0:0") {
                if socket.connect("8.8.8.8:80").is_ok() {
                    if let Ok(local) = socket.local_addr() {
                        if let IpAddr::V4(ip) = local.ip() {
                            addrs.insert(ip);
                        }
                    }
                }
            }
            addrs
        })
        .clone()
}

/// When two libp2p nodes run on the same host, mDNS advertises the LAN IP. Dialing that
/// address from the same machine can fail on macOS (EADDRINUSE). Rewrite to loopback.
pub fn prefer_loopback_for_same_host_dial(multiaddr: Multiaddr) -> Multiaddr {
    let locals = local_ipv4_addresses();
    let mut out = Multiaddr::empty();
    for protocol in multiaddr.iter() {
        match protocol {
            Protocol::Ip4(ip) if locals.contains(&ip) && ip != Ipv4Addr::LOCALHOST => {
                out.push(Protocol::Ip4(Ipv4Addr::LOCALHOST));
            }
            other => out.push(other),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rewrites_primary_local_ipv4_to_loopback() {
        let locals = local_ipv4_addresses();
        let Some(local_ip) = locals.iter().find(|ip| **ip != Ipv4Addr::LOCALHOST).copied() else {
            return;
        };

        let peer_id = libp2p::PeerId::random();
        let mut source = Multiaddr::empty();
        source.push(Protocol::Ip4(local_ip));
        source.push(Protocol::Tcp(62504));
        source.push(Protocol::P2p(peer_id));

        let rewritten = prefer_loopback_for_same_host_dial(source);
        assert!(rewritten.to_string().contains("/ip4/127.0.0.1/tcp/62504/"));
    }

    #[test]
    fn keeps_remote_ipv4_unchanged() {
        let peer_id = libp2p::PeerId::random();
        let mut source = Multiaddr::empty();
        source.push(Protocol::Ip4(Ipv4Addr::new(10, 20, 30, 40)));
        source.push(Protocol::Tcp(4001));
        source.push(Protocol::P2p(peer_id));

        let rewritten = prefer_loopback_for_same_host_dial(source.clone());
        assert_eq!(rewritten.to_string(), source.to_string());
    }
}
