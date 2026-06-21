use std::sync::Arc;
use std::time::Duration;

use once_cell::sync::Lazy;
use tokio::sync::Mutex as AsyncMutex;

use crate::discovery::read_peer_beacon;
use crate::signaling::{
    append_toolman_signal_port, clear_signaling_properties, deliver_answer_via_udp, parse_signal,
    publish_signal, listen_for_udp_answers_on_socket, SignalMessage,
};
use crate::state::{
    PendingInviteHandshake, PENDING_INVITES, INVITE_UDP_ANSWERS, DISCOVERY, WORKSPACE_KEYS,
};
use crate::crypto::WORKSPACE_KEY_LEN;

use super::types::{ConnectionInfo, ConnectionMode, ConnectionState};
use super::webrtc_session::{build_api, WebRtcSession};

const CONNECT_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(45);
const CHANNEL_OPEN_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(30);
const SIGNAL_POLL_INTERVAL: std::time::Duration = std::time::Duration::from_millis(500);

static WEBRTC_API: Lazy<Arc<webrtc::api::API>> = Lazy::new(|| {
    Arc::new(build_api().expect("Failed to initialize WebRTC API"))
});

struct PeerConnectionEntry {
    session: Arc<AsyncMutex<WebRtcSession>>,
}

pub struct ConnectionManager {
    sessions: std::collections::HashMap<String, PeerConnectionEntry>,
}

impl ConnectionManager {
    pub fn new() -> Self {
        Self {
            sessions: std::collections::HashMap::new(),
        }
    }

    pub async fn connect(
        &mut self,
        peer_device_id: &str,
        workspace_id: Option<String>,
    ) -> Result<ConnectionState, String> {
        let local_device_id = Self::local_device_id()?;
        if local_device_id == peer_device_id {
            return Err("Cannot connect to local device".to_string());
        }
        if !Self::discovery_running()? {
            return Err("P2P discovery is not running".to_string());
        }

        self.wait_for_peer_online(peer_device_id).await?;

        if let Some(entry) = self.sessions.get(peer_device_id) {
            let session = entry.session.lock().await;
            if session.current_state().await == ConnectionState::Connected {
                return Ok(ConnectionState::Connected);
            }
        }

        let api = Arc::clone(&WEBRTC_API);

        let lan_only = Self::peer_is_local_beacon(peer_device_id);
        let session = Arc::new(AsyncMutex::new(
            WebRtcSession::new(
                peer_device_id.to_string(),
                workspace_id.clone(),
                api.as_ref(),
                lan_only,
            )
            .await?,
        ));
        {
            let guard = session.lock().await;
            guard.set_state(ConnectionState::Signaling).await;
            guard.prepare_incoming_channels().await;
        }

        self.sessions.insert(
            peer_device_id.to_string(),
            PeerConnectionEntry {
                session: Arc::clone(&session),
            },
        );

        let is_offerer = local_device_id < peer_device_id.to_string();
        let connect_result = if is_offerer {
            self.connect_as_offerer(&session, peer_device_id, &local_device_id)
                .await
        } else {
            self.connect_as_answerer(&session, peer_device_id, &local_device_id)
                .await
        };

        match connect_result {
            Ok(()) => {
                let guard = session.lock().await;
                guard
                    .set_connection_mode(ConnectionMode::Lan)
                    .await;
                drop(guard);
                session.lock().await.mark_connected().await;
                Self::clear_local_signal()?;
                Ok(ConnectionState::Connected)
            }
            Err(error) => {
                self.sessions.remove(peer_device_id);
                session.lock().await.close().await;
                Self::clear_local_signal()?;
                Err(error)
            }
        }
    }

    pub async fn disconnect(&mut self, peer_device_id: &str) -> Result<(), String> {
        let Some(entry) = self.sessions.remove(peer_device_id) else {
            return Ok(());
        };
        let session = entry.session.lock().await;
        session
            .manual_close
            .store(true, std::sync::atomic::Ordering::Relaxed);
        session.set_state(ConnectionState::Closed).await;
        session.close().await;
        Ok(())
    }

    pub async fn list(&self) -> Vec<ConnectionInfo> {
        let mut results = Vec::new();
        for entry in self.sessions.values() {
            let session = entry.session.lock().await;
            results.push(session.info_snapshot().await);
        }
        results
    }

    pub async fn rotate_workspace_key(
        &self,
        workspace_id: &str,
        workspace_key: [u8; WORKSPACE_KEY_LEN],
        key_version: u32,
    ) -> Result<(), String> {
        {
            let mut registry = WORKSPACE_KEYS
                .lock()
                .map_err(|_| "workspace key lock poisoned".to_string())?;
            registry.rotate_workspace_key(workspace_id, workspace_key, key_version);
        }

        for entry in self.sessions.values() {
            let session = entry.session.lock().await;
            session
                .rotate_ciphers_if_workspace(workspace_id, workspace_key, key_version)
                .await?;
        }
        Ok(())
    }

    pub async fn send(
        &self,
        peer_device_id: &str,
        channel: &str,
        data: &[u8],
    ) -> Result<(), String> {
        let entry = self
            .sessions
            .get(peer_device_id)
            .ok_or_else(|| "Connection not found".to_string())?;
        let session = entry.session.lock().await;
        if session.current_state().await != ConnectionState::Connected {
            return Err("Connection is not ready".to_string());
        }
        session.send_on_channel(channel, data).await
    }

    pub async fn drain_incoming_events(&self, peer_device_id: &str) -> Vec<Vec<u8>> {
        let Some(entry) = self.sessions.get(peer_device_id) else {
            return Vec::new();
        };
        let session = entry.session.lock().await;
        session.drain_incoming_events().await
    }

    pub async fn drain_incoming_files(&self, peer_device_id: &str) -> Vec<Vec<u8>> {
        let Some(entry) = self.sessions.get(peer_device_id) else {
            return Vec::new();
        };
        let session = entry.session.lock().await;
        session.drain_incoming_files().await
    }

    pub async fn create_invite_offer(
        invite_id: String,
        workspace_id: Option<String>,
    ) -> Result<String, String> {
        if !Self::discovery_running()? {
            return Err("P2P discovery is not running".to_string());
        }

        let api = Arc::clone(&WEBRTC_API);
        let session = Arc::new(AsyncMutex::new(
            WebRtcSession::new(
                "invite-pending".to_string(),
                workspace_id.clone(),
                api.as_ref(),
                false,
            )
            .await?,
        ));
        {
            let guard = session.lock().await;
            guard.set_state(ConnectionState::Signaling).await;
            guard.prepare_incoming_channels().await;
        }

        let offer_sdp = session.lock().await.create_offer_sdp().await?;

        let signal_socket = tokio::net::UdpSocket::bind("0.0.0.0:0")
            .await
            .map_err(|error| format!("Failed to bind invite signal socket: {error}"))?;
        let signal_port = signal_socket
            .local_addr()
            .map_err(|error| format!("Failed to read invite signal port: {error}"))?
            .port();
        let invite_id_listener = invite_id.clone();
        let invite_id_store = invite_id.clone();
        tokio::spawn(async move {
            if let Ok(answer_sdp) = listen_for_udp_answers_on_socket(
                signal_socket,
                invite_id_listener,
                Duration::from_secs(300),
            )
            .await
            {
                if let Ok(mut answers) = INVITE_UDP_ANSWERS.lock() {
                    answers.insert(invite_id_store, answer_sdp);
                }
            }
        });

        let offer_with_signal = append_toolman_signal_port(&offer_sdp, signal_port);
        let handshake = PendingInviteHandshake {
            invite_id: invite_id.clone(),
            workspace_id,
            offer_sdp: offer_with_signal.clone(),
            session,
            answer_sdp: std::sync::Mutex::new(None),
            answer_notify: tokio::sync::Notify::new(),
        };
        PENDING_INVITES
            .lock()
            .await
            .insert(invite_id, handshake);
        Ok(offer_with_signal)
    }

    pub async fn wait_for_invite_answer(
        &mut self,
        invite_id: String,
        timeout_secs: u64,
    ) -> Result<ConnectionState, String> {
        let timeout = Duration::from_secs(timeout_secs.max(1));
        let local_device_id = Self::local_device_id()?;
        let deadline = tokio::time::Instant::now() + timeout;

        while tokio::time::Instant::now() < deadline {
            let udp_answer = INVITE_UDP_ANSWERS
                .lock()
                .ok()
                .and_then(|answers| answers.get(&invite_id).cloned());
            if let Some(answer_sdp) = udp_answer {
                if let Ok(mut answers) = INVITE_UDP_ANSWERS.lock() {
                    answers.remove(&invite_id);
                }
                let joiner_device_id = Self::resolve_joiner_from_signal(&invite_id, &local_device_id)
                    .unwrap_or_else(|| "unknown-joiner".to_string());
                return self
                    .accept_invite_answer(&invite_id, &joiner_device_id, &answer_sdp)
                    .await;
            }

            if let Some((joiner_device_id, answer_sdp)) =
                Self::poll_invite_answer_signal(&invite_id, &local_device_id)?
            {
                return self
                    .accept_invite_answer(&invite_id, &joiner_device_id, &answer_sdp)
                    .await;
            }

            tokio::time::sleep(SIGNAL_POLL_INTERVAL).await;
        }

        Err("Timed out waiting for invite answer".to_string())
    }

    pub async fn connect_via_invite(
        &mut self,
        owner_device_id: &str,
        workspace_id: Option<String>,
        offer_sdp: &str,
        invite_id: &str,
    ) -> Result<(ConnectionState, String), String> {
        if !Self::discovery_running()? {
            return Err("P2P discovery is not running".to_string());
        }
        let local_device_id = Self::local_device_id()?;
        if local_device_id == owner_device_id {
            return Err("Cannot connect to local device".to_string());
        }

        if let Some(entry) = self.sessions.get(owner_device_id) {
            let session = entry.session.lock().await;
            if session.current_state().await == ConnectionState::Connected {
                return Ok((ConnectionState::Connected, String::new()));
            }
        }

        let api = Arc::clone(&WEBRTC_API);
        let lan_only = Self::peer_is_local_beacon(owner_device_id);
        let session = Arc::new(AsyncMutex::new(
            WebRtcSession::new(
                owner_device_id.to_string(),
                workspace_id.clone(),
                api.as_ref(),
                lan_only,
            )
            .await?,
        ));
        {
            let guard = session.lock().await;
            guard.set_state(ConnectionState::Signaling).await;
            guard.prepare_incoming_channels().await;
        }

        self.sessions.insert(
            owner_device_id.to_string(),
            PeerConnectionEntry {
                session: Arc::clone(&session),
            },
        );

        let answer_sdp = {
            let guard = session.lock().await;
            guard.set_state(ConnectionState::Connecting).await;
            guard
                .accept_offer_and_create_answer(offer_sdp)
                .await?
        };

        Self::publish_local_signal(owner_device_id, "answer", &answer_sdp, invite_id)?;
        if let Err(error) =
            deliver_answer_via_udp(offer_sdp, invite_id, &answer_sdp).await
        {
            eprintln!("[toolman-p2p] invite UDP answer delivery failed: {error}");
        }

        {
            let guard = session.lock().await;
            guard.wait_until_connected(CONNECT_TIMEOUT).await?;
            guard
                .wait_for_channels_open(CHANNEL_OPEN_TIMEOUT)
                .await?;
        }
        Self::init_session_ciphers(&session, &local_device_id).await?;
        session.lock().await.perform_handshake(false).await?;
        session.lock().await.install_events_message_listener().await;
        session.lock().await.install_files_message_listener().await;
        session
            .lock()
            .await
            .set_connection_mode(ConnectionMode::Wan)
            .await;
        session.lock().await.mark_connected().await;
        Self::clear_local_signal()?;
        Ok((ConnectionState::Connected, answer_sdp))
    }

    pub async fn accept_invite_answer(
        &mut self,
        invite_id: &str,
        joiner_device_id: &str,
        answer_sdp: &str,
    ) -> Result<ConnectionState, String> {
        let pending = PENDING_INVITES
            .lock()
            .await
            .remove(invite_id)
            .ok_or_else(|| format!("Invite handshake not found: {invite_id}"))?;
        let session = pending.session;
        let local_device_id = Self::local_device_id()?;
        let joiner_device_id = if joiner_device_id == "unknown-joiner" {
            Self::resolve_joiner_from_signal(invite_id, &local_device_id)
                .unwrap_or_else(|| "unknown-joiner".to_string())
        } else {
            joiner_device_id.to_string()
        };

        {
            let mut guard = session.lock().await;
            guard.peer_device_id = joiner_device_id.clone();
            guard.set_state(ConnectionState::Connecting).await;
            guard.apply_answer(answer_sdp).await?;
            guard.wait_until_connected(CONNECT_TIMEOUT).await?;
            guard
                .wait_for_channels_open(CHANNEL_OPEN_TIMEOUT)
                .await?;
        }

        Self::init_session_ciphers(&session, &local_device_id).await?;
        session.lock().await.perform_handshake(true).await?;
        session.lock().await.install_events_message_listener().await;
        session.lock().await.install_files_message_listener().await;
        session
            .lock()
            .await
            .set_connection_mode(ConnectionMode::Wan)
            .await;
        session.lock().await.mark_connected().await;

        if joiner_device_id != "unknown-joiner" {
            self.sessions.insert(
                joiner_device_id.clone(),
                PeerConnectionEntry {
                    session: Arc::clone(&session),
                },
            );
        }

        Ok(ConnectionState::Connected)
    }

    fn poll_invite_answer_signal(
        invite_id: &str,
        local_device_id: &str,
    ) -> Result<Option<(String, String)>, String> {
        let discovery = DISCOVERY
            .lock()
            .map_err(|_| "discovery lock poisoned".to_string())?;
        for node in discovery.list_nodes(false) {
            let Some(properties) = discovery.get_peer_properties(&node.device_id) else {
                continue;
            };
            let Some(signal) = parse_signal(&node.device_id, &properties) else {
                continue;
            };
            if signal.target_device_id == local_device_id
                && signal.signal_type == "answer"
                && signal.nonce == invite_id
            {
                return Ok(Some((node.device_id.clone(), signal.sdp)));
            }
        }
        Ok(None)
    }

    fn resolve_joiner_from_signal(
        invite_id: &str,
        local_device_id: &str,
    ) -> Option<String> {
        Self::poll_invite_answer_signal(invite_id, local_device_id)
            .ok()
            .flatten()
            .map(|(device_id, _)| device_id)
    }

    async fn connect_as_offerer(
        &self,
        session: &Arc<AsyncMutex<WebRtcSession>>,
        peer_device_id: &str,
        local_device_id: &str,
    ) -> Result<(), String> {
        session
            .lock()
            .await
            .set_state(ConnectionState::Connecting)
            .await;

        let offer_sdp = session.lock().await.create_offer_sdp().await?;
        let nonce = format!("offer-{}", crate::util::now_ms());
        Self::publish_local_signal(peer_device_id, "offer", &offer_sdp, &nonce)?;

        let answer = Self::wait_for_signal(peer_device_id, local_device_id, "answer").await?;
        {
            let guard = session.lock().await;
            guard.apply_answer(&answer.sdp).await?;
            guard.wait_until_connected(CONNECT_TIMEOUT).await?;
            guard
                .wait_for_channels_open(CHANNEL_OPEN_TIMEOUT)
                .await?;
        }
        Self::init_session_ciphers(session, local_device_id).await?;
        session.lock().await.perform_handshake(true).await?;
        session.lock().await.install_events_message_listener().await;
        session.lock().await.install_files_message_listener().await;
        Ok(())
    }

    async fn connect_as_answerer(
        &self,
        session: &Arc<AsyncMutex<WebRtcSession>>,
        peer_device_id: &str,
        local_device_id: &str,
    ) -> Result<(), String> {
        let offer = Self::wait_for_signal(peer_device_id, local_device_id, "offer").await?;
        session
            .lock()
            .await
            .set_state(ConnectionState::Connecting)
            .await;

        let answer_sdp = session
            .lock()
            .await
            .accept_offer_and_create_answer(&offer.sdp)
            .await?;
        let nonce = format!("answer-{}", crate::util::now_ms());
        Self::publish_local_signal(peer_device_id, "answer", &answer_sdp, &nonce)?;

        {
            let guard = session.lock().await;
            guard.wait_until_connected(CONNECT_TIMEOUT).await?;
            guard
                .wait_for_channels_open(CHANNEL_OPEN_TIMEOUT)
                .await?;
        }
        Self::init_session_ciphers(session, local_device_id).await?;
        session.lock().await.perform_handshake(false).await?;
        session.lock().await.install_events_message_listener().await;
        session.lock().await.install_files_message_listener().await;
        Ok(())
    }

    async fn init_session_ciphers(
        session: &Arc<AsyncMutex<WebRtcSession>>,
        local_device_id: &str,
    ) -> Result<(), String> {
        let (workspace_id, peer_device_id) = {
            let guard = session.lock().await;
            (guard.workspace_id.clone(), guard.peer_device_id.clone())
        };

        let (workspace_key, scope_id, key_version) = {
            let registry = WORKSPACE_KEYS
                .lock()
                .map_err(|_| "workspace key lock poisoned".to_string())?;
            registry.resolve_workspace_material(
                workspace_id.as_deref(),
                local_device_id,
                &peer_device_id,
            )
        };

        session
            .lock()
            .await
            .init_ciphers_with_material(workspace_key, scope_id, key_version)
            .await
    }

    async fn wait_for_peer_online(&self, peer_device_id: &str) -> Result<(), String> {
        let deadline = tokio::time::Instant::now() + CONNECT_TIMEOUT;
        while tokio::time::Instant::now() < deadline {
            let online = {
                let discovery = DISCOVERY
                    .lock()
                    .map_err(|_| "discovery lock poisoned".to_string())?;
                discovery
                    .list_nodes(true)
                    .into_iter()
                    .any(|node| node.device_id == peer_device_id)
            };
            if online {
                return Ok(());
            }
            tokio::time::sleep(SIGNAL_POLL_INTERVAL).await;
        }
        Err(format!("Peer not discovered on LAN: {peer_device_id}"))
    }

    async fn wait_for_signal(
        peer_device_id: &str,
        local_device_id: &str,
        signal_type: &str,
    ) -> Result<SignalMessage, String> {
        let deadline = tokio::time::Instant::now() + CONNECT_TIMEOUT;
        let mut seen_nonce: Option<String> = None;

        while tokio::time::Instant::now() < deadline {
            let properties = {
                let discovery = DISCOVERY
                    .lock()
                    .map_err(|_| "discovery lock poisoned".to_string())?;
                discovery.get_peer_properties(peer_device_id)
            };

            if let Some(props) = properties {
                if let Some(signal) = parse_signal(peer_device_id, &props) {
                    if signal.target_device_id == local_device_id
                        && signal.signal_type == signal_type
                        && seen_nonce.as_deref() != Some(signal.nonce.as_str())
                    {
                        seen_nonce = Some(signal.nonce.clone());
                        return Ok(signal);
                    }
                }
            }

            tokio::time::sleep(SIGNAL_POLL_INTERVAL).await;
        }

        Err(format!(
            "Timed out waiting for {signal_type} from {peer_device_id}"
        ))
    }

    fn publish_local_signal(
        target_device_id: &str,
        signal_type: &str,
        sdp: &str,
        nonce: &str,
    ) -> Result<(), String> {
        let mut discovery = DISCOVERY
            .lock()
            .map_err(|_| "discovery lock poisoned".to_string())?;
        let extra = publish_signal(target_device_id, signal_type, sdp, nonce);
        discovery.update_service_properties(extra)
    }

    fn clear_local_signal() -> Result<(), String> {
        let mut discovery = DISCOVERY
            .lock()
            .map_err(|_| "discovery lock poisoned".to_string())?;
        discovery.update_service_properties(clear_signaling_properties())
    }

    fn peer_is_local_beacon(peer_device_id: &str) -> bool {
        let Ok(discovery) = DISCOVERY.lock() else {
            return false;
        };
        let Some(local_device_id) = discovery.local_device_id() else {
            return false;
        };
        read_peer_beacon(&local_device_id, peer_device_id, crate::util::now_ms()).is_some()
    }

    fn local_device_id() -> Result<String, String> {
        let discovery = DISCOVERY
            .lock()
            .map_err(|_| "discovery lock poisoned".to_string())?;
        discovery
            .local_device_id()
            .ok_or_else(|| "Local device id unavailable; start discovery first".to_string())
    }

    fn discovery_running() -> Result<bool, String> {
        let discovery = DISCOVERY
            .lock()
            .map_err(|_| "discovery lock poisoned".to_string())?;
        Ok(discovery.is_running())
    }
}

impl Default for ConnectionManager {
    fn default() -> Self {
        Self::new()
    }
}
