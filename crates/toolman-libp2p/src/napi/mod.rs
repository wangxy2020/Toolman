use std::path::PathBuf;
use std::sync::{Arc, Mutex, RwLock};

use napi_derive::napi;
use once_cell::sync::Lazy;
use tokio::runtime::Handle;
use tokio::sync::{mpsc, oneshot};

use crate::config::NetworkConfig;
use crate::pubsub::SwarmCommand;
use crate::state::{
    read_snapshot, set_stopped, set_stopped_with_error, NetworkRuntime, NetworkSnapshot,
    NETWORK_RUNTIME,
};
use crate::swarm::run_network_swarm;

mod bindings;
mod dht_napi;
mod network;
mod pubsub_napi;

pub use bindings::*;
pub use dht_napi::*;
pub use network::*;
pub use pubsub_napi::*;

static SNAPSHOT: Lazy<Arc<RwLock<NetworkSnapshot>>> =
    Lazy::new(|| Arc::new(RwLock::new(NetworkSnapshot::default())));

static COMMAND_TX: Lazy<Mutex<Option<mpsc::UnboundedSender<SwarmCommand>>>> =
    Lazy::new(|| Mutex::new(None));

pub(crate) fn send_swarm_command(command: SwarmCommand) -> napi::Result<()> {
    let guard = COMMAND_TX
        .lock()
        .map_err(|_| napi::Error::from_reason("command channel lock poisoned"))?;
    let sender = guard
        .as_ref()
        .ok_or_else(|| napi::Error::from_reason("libp2p network is not running"))?;
    sender
        .send(command)
        .map_err(|_| napi::Error::from_reason("failed to send swarm command"))?;
    Ok(())
}

fn spawn_swarm(data_dir: PathBuf, config: NetworkConfig) -> napi::Result<()> {
    let (shutdown_tx, shutdown_rx) = oneshot::channel();
    let (command_tx, command_rx) = mpsc::unbounded_channel();
    let snapshot = SNAPSHOT.clone();

    let runtime = NETWORK_RUNTIME
        .write()
        .map_err(|_| napi::Error::from_reason("network runtime lock poisoned"))?;

    if runtime.is_some() {
        return Err(napi::Error::from_reason("libp2p network already running"));
    }

    if read_snapshot(&SNAPSHOT).running {
        set_stopped(&SNAPSHOT);
    }

    drop(runtime);

    {
        let mut guard = COMMAND_TX
            .lock()
            .map_err(|_| napi::Error::from_reason("command channel lock poisoned"))?;
        *guard = Some(command_tx.clone());
    }

    let handle = Handle::current();
    let config_for_task = config.clone();
    handle.spawn(async move {
        let result = run_network_swarm(
            data_dir,
            config_for_task,
            snapshot.clone(),
            shutdown_rx,
            command_rx,
        )
        .await;

        match result {
            Ok(()) => set_stopped(&snapshot),
            Err(error) => {
                eprintln!("[toolman-libp2p] swarm stopped with error: {error}");
                set_stopped_with_error(&snapshot, error.to_string());
            }
        }

        if let Ok(mut guard) = NETWORK_RUNTIME.write() {
            *guard = None;
        }
        if let Ok(mut guard) = COMMAND_TX.lock() {
            *guard = None;
        }
    });

    let mut runtime = NETWORK_RUNTIME
        .write()
        .map_err(|_| napi::Error::from_reason("network runtime lock poisoned"))?;
    *runtime = Some(NetworkRuntime {
        config,
        snapshot: SNAPSHOT.clone(),
        shutdown: Some(shutdown_tx),
    });

    Ok(())
}

pub fn stop_swarm_internal() -> napi::Result<()> {
    let mut runtime = NETWORK_RUNTIME
        .write()
        .map_err(|_| napi::Error::from_reason("network runtime lock poisoned"))?;

    if let Some(mut active) = runtime.take() {
        if let Some(shutdown) = active.shutdown.take() {
            let _ = shutdown.send(());
        }
        set_stopped(&active.snapshot);
    }

    if let Ok(mut guard) = COMMAND_TX.lock() {
        *guard = None;
    }

    Ok(())
}

pub(super) fn snapshot_internal() -> NetworkSnapshot {
    read_snapshot(&SNAPSHOT)
}

#[napi]
pub fn network_start(data_dir: String, config_json: String) -> napi::Result<()> {
    let config = NetworkConfig::parse(&config_json);
    spawn_swarm(PathBuf::from(data_dir), config)
}

#[napi]
pub fn network_stop() -> napi::Result<()> {
    stop_swarm_internal()
}

#[napi]
pub fn network_is_running() -> napi::Result<bool> {
    Ok(read_snapshot(&SNAPSHOT).running)
}

#[napi]
pub fn network_local_peer_id() -> napi::Result<Option<String>> {
    Ok(read_snapshot(&SNAPSHOT).local_peer_id.clone())
}

#[napi]
pub fn network_peer_count() -> napi::Result<u32> {
    Ok(read_snapshot(&SNAPSHOT).peers.len() as u32)
}

#[napi]
pub fn network_dht_health() -> napi::Result<NapiDhtHealth> {
    let snapshot = read_snapshot(&SNAPSHOT);
    Ok(NapiDhtHealth {
        mode: snapshot.dht.mode,
        bootstrap_count: snapshot.dht.bootstrap_count as u32,
        ready: snapshot.dht.ready,
        error: snapshot.dht.last_error,
    })
}
