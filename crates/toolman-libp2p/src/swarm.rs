use std::error::Error;
use std::sync::{Arc, RwLock};
use std::time::Duration;

use futures::StreamExt;
use libp2p::gossipsub;
use libp2p::identify;
use libp2p::kad::{self, store::MemoryStore, QueryResult};
use libp2p::mdns;
use libp2p::noise;
use libp2p::ping;
use libp2p::swarm::{NetworkBehaviour, SwarmEvent};
use libp2p::tcp;
use libp2p::yamux;
use libp2p::{identity, Multiaddr, PeerId, SwarmBuilder};
use tokio::sync::{mpsc, oneshot};

use crate::config::NetworkConfig;
use crate::dht_state::{push_provider_result, take_provider_lookup_cid, track_provider_lookup, DhtProviderResult};
use crate::identity::load_libp2p_keypair;
use crate::pubsub::SwarmCommand;
use crate::pubsub_state::{push_pubsub_message, PubsubInboxMessage};
use crate::state::now_ms;
use crate::state::{
    read_snapshot, remove_peer, set_dht_ready, set_running, set_stopped, upsert_peer, NetworkSnapshot,
};

const PROTOCOL_VERSION: &str = "/toolman/libp2p/1.0.0";

#[derive(NetworkBehaviour)]
pub(crate) struct ToolmanBehaviour {
    mdns: mdns::tokio::Behaviour,
    kademlia: kad::Behaviour<MemoryStore>,
    ping: ping::Behaviour,
    identify: identify::Behaviour,
    gossipsub: gossipsub::Behaviour,
}

pub async fn run_network_swarm(
    data_dir: std::path::PathBuf,
    config: NetworkConfig,
    snapshot: Arc<RwLock<NetworkSnapshot>>,
    mut shutdown_rx: oneshot::Receiver<()>,
    mut command_rx: mpsc::UnboundedReceiver<SwarmCommand>,
) -> Result<(), Box<dyn Error + Send + Sync>> {
    let keypair = load_libp2p_keypair(&data_dir)?;
    let local_peer_id = keypair.public().to_peer_id();
    set_running(&snapshot, local_peer_id.to_string(), &config);

    let mut swarm = SwarmBuilder::with_existing_identity(keypair.clone())
        .with_tokio()
        .with_tcp(
            tcp::Config::default().nodelay(true),
            noise::Config::new,
            yamux::Config::default,
        )?
        .with_behaviour(|key| build_behaviour(key, &config))?
        .with_swarm_config(|cfg| {
            cfg.with_idle_connection_timeout(Duration::from_secs(90))
        })
        .build();

    swarm.listen_on("/ip4/0.0.0.0/tcp/0".parse()?)?;

    if config.dht_enabled() {
        bootstrap_kad(&mut swarm, &config);
    } else {
        set_dht_ready(&snapshot, false, Some("DHT disabled".to_string()));
    }

    loop {
        tokio::select! {
            _ = &mut shutdown_rx => break,
            command = command_rx.recv() => {
                if let Some(command) = command {
                    handle_swarm_command(&mut swarm, command);
                }
            }
            event = swarm.select_next_some() => {
                handle_swarm_event(&mut swarm, event, &snapshot, &config);
            }
        }
    }

    set_stopped(&snapshot);
    Ok(())
}

fn build_behaviour(
    key: &identity::Keypair,
    config: &NetworkConfig,
) -> Result<ToolmanBehaviour, Box<dyn Error + Send + Sync>> {
    let peer_id = key.public().to_peer_id();
    let mdns = mdns::tokio::Behaviour::new(mdns::Config::default(), peer_id)?;

    let store = MemoryStore::new(peer_id);
    let mut kad_config = kad::Config::default();
    if !config.dht_server() {
        kad_config.set_kbucket_inserts(kad::BucketInserts::Manual);
    }
    let kademlia = kad::Behaviour::with_config(peer_id, store, kad_config);
    let ping = ping::Behaviour::new(ping::Config::new());
    let identify = identify::Behaviour::new(identify::Config::new(
        PROTOCOL_VERSION.to_string(),
        key.public(),
    ));

    let gossipsub_config = gossipsub::ConfigBuilder::default()
        .heartbeat_interval(Duration::from_secs(1))
        .validation_mode(gossipsub::ValidationMode::Permissive)
        .build()
        .map_err(|error| format!("gossipsub config: {error}"))?;
    let gossipsub = gossipsub::Behaviour::new(
        gossipsub::MessageAuthenticity::Signed(key.clone()),
        gossipsub_config,
    )
    .map_err(|error| format!("gossipsub behaviour: {error}"))?;

    let _ = config;

    Ok(ToolmanBehaviour {
        mdns,
        kademlia,
        ping,
        identify,
        gossipsub,
    })
}

fn handle_swarm_command(swarm: &mut libp2p::Swarm<ToolmanBehaviour>, command: SwarmCommand) {
    match command {
        SwarmCommand::PubsubSubscribe(topic) => {
            let ident = gossipsub::IdentTopic::new(topic);
            if let Err(error) = swarm.behaviour_mut().gossipsub.subscribe(&ident) {
                eprintln!("[toolman-libp2p] pubsub subscribe failed: {error}");
            }
        }
        SwarmCommand::PubsubUnsubscribe(topic) => {
            let ident = gossipsub::IdentTopic::new(topic);
            if let Err(error) = swarm.behaviour_mut().gossipsub.unsubscribe(&ident) {
                eprintln!("[toolman-libp2p] pubsub unsubscribe failed: {error}");
            }
        }
        SwarmCommand::PubsubPublish { topic, data } => {
            let ident = gossipsub::IdentTopic::new(topic);
            if let Err(error) = swarm.behaviour_mut().gossipsub.publish(ident, data) {
                eprintln!("[toolman-libp2p] pubsub publish failed: {error}");
            }
        }
        SwarmCommand::DhtProvide(cid) => {
            let key = kad::RecordKey::new(&cid);
            if let Err(error) = swarm.behaviour_mut().kademlia.start_providing(key) {
                eprintln!("[toolman-libp2p] dht provide failed for {cid}: {error}");
            }
        }
        SwarmCommand::DhtGetProviders(cid) => {
            let key = kad::RecordKey::new(&cid);
            let query_id = swarm.behaviour_mut().kademlia.get_providers(key);
            track_provider_lookup(query_id, cid);
        }
    }
}

fn handle_gossipsub_event(event: gossipsub::Event) {
    if let gossipsub::Event::Message {
        propagation_source,
        message,
        ..
    } = event
    {
        push_pubsub_message(PubsubInboxMessage {
            topic: message.topic.to_string(),
            data: message.data.to_vec(),
            from_peer_id: propagation_source.to_string(),
            received_at_ms: now_ms(),
        });
    }
}

fn bootstrap_kad(swarm: &mut libp2p::Swarm<ToolmanBehaviour>, config: &NetworkConfig) {
    if config.bootstrap_multiaddrs.is_empty() {
        return;
    }

    for addr in &config.bootstrap_multiaddrs {
        if let Ok(multiaddr) = addr.parse::<Multiaddr>() {
            if let Some(peer_id) = extract_peer_id(&multiaddr) {
                swarm
                    .behaviour_mut()
                    .kademlia
                    .add_address(&peer_id, multiaddr);
            }
        }
    }

    if let Err(error) = swarm.behaviour_mut().kademlia.bootstrap() {
        eprintln!("[toolman-libp2p] kad bootstrap skipped: {error}");
    }
}

fn extract_peer_id(multiaddr: &Multiaddr) -> Option<PeerId> {
    use libp2p::multiaddr::Protocol;
    multiaddr.iter().find_map(|protocol| {
        if let Protocol::P2p(peer_id) = protocol {
            Some(peer_id)
        } else {
            None
        }
    })
}

fn handle_swarm_event(
    swarm: &mut libp2p::Swarm<ToolmanBehaviour>,
    event: SwarmEvent<ToolmanBehaviourEvent>,
    snapshot: &Arc<RwLock<NetworkSnapshot>>,
    config: &NetworkConfig,
) {
    match event {
        SwarmEvent::Behaviour(event) => match event {
            ToolmanBehaviourEvent::Mdns(mdns_event) => {
                if !config.mdns_enabled {
                    return;
                }
                match mdns_event {
                    mdns::Event::Discovered(list) => {
                        for (peer_id, multiaddr) in list {
                            if peer_id == *swarm.local_peer_id() {
                                continue;
                            }
                            let _ = swarm.dial(multiaddr);
                        }
                    }
                    mdns::Event::Expired(list) => {
                        for (peer_id, _) in list {
                            let _ = peer_id;
                            let _ = read_snapshot(snapshot);
                        }
                    }
                }
            }
            ToolmanBehaviourEvent::Kademlia(kad_event) => {
                if let kad::Event::OutboundQueryProgressed { id, result, .. } = kad_event {
                    match result {
                        QueryResult::Bootstrap(Ok(result)) => {
                            set_dht_ready(
                                snapshot,
                                true,
                                if result.num_remaining == 0 {
                                    None
                                } else {
                                    Some(format!("bootstrap remaining: {}", result.num_remaining))
                                },
                            );
                        }
                        QueryResult::Bootstrap(Err(error)) => {
                            set_dht_ready(
                                snapshot,
                                false,
                                Some(format!("bootstrap failed: {error}")),
                            );
                        }
                        QueryResult::GetProviders(Ok(providers)) => {
                            let cid = take_provider_lookup_cid(&id).unwrap_or_else(|| "unknown".to_string());
                            match providers {
                                kad::GetProvidersOk::FoundProviders { providers, .. } => {
                                    let peer_ids = providers
                                        .into_iter()
                                        .map(|peer_id| peer_id.to_string())
                                        .collect::<Vec<_>>();
                                    push_provider_result(DhtProviderResult {
                                        cid,
                                        providers: peer_ids,
                                        completed: false,
                                        error: None,
                                        at_ms: now_ms(),
                                    });
                                }
                                kad::GetProvidersOk::FinishedWithNoAdditionalRecord { .. } => {
                                    push_provider_result(DhtProviderResult {
                                        cid,
                                        providers: Vec::new(),
                                        completed: true,
                                        error: None,
                                        at_ms: now_ms(),
                                    });
                                }
                            }
                        }
                        QueryResult::GetProviders(Err(error)) => {
                            let cid = take_provider_lookup_cid(&id).unwrap_or_else(|| "unknown".to_string());
                            push_provider_result(DhtProviderResult {
                                cid,
                                providers: Vec::new(),
                                completed: true,
                                error: Some(format!("get providers failed: {error}")),
                                at_ms: now_ms(),
                            });
                        }
                        QueryResult::StartProviding(Ok(_)) => {}
                        QueryResult::StartProviding(Err(error)) => {
                            eprintln!("[toolman-libp2p] start providing failed: {error}");
                        }
                        _ => {}
                    }
                }
            }
            ToolmanBehaviourEvent::Gossipsub(gossipsub_event) => {
                handle_gossipsub_event(gossipsub_event);
            }
            _ => {}
        },
        SwarmEvent::ConnectionEstablished { peer_id, .. } => {
            upsert_peer(snapshot, peer_id.to_string(), "tcp".to_string());
        }
        SwarmEvent::ConnectionClosed { peer_id, .. } => {
            remove_peer(snapshot, &peer_id.to_string());
        }
        SwarmEvent::OutgoingConnectionError { peer_id, error, .. } => {
            if let Some(peer_id) = peer_id {
                eprintln!(
                    "[toolman-libp2p] outgoing connection error to {peer_id}: {error}"
                );
            }
        }
        _ => {}
    }
}
