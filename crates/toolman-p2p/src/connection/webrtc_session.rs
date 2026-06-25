use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use bytes::Bytes;
use tokio::sync::{Mutex, Notify, oneshot};
use tokio::time::{sleep, timeout};
use webrtc::api::interceptor_registry::register_default_interceptors;
use webrtc::api::media_engine::MediaEngine;
use webrtc::api::APIBuilder;
use webrtc::data_channel::data_channel_state::RTCDataChannelState;
use webrtc::data_channel::data_channel_init::RTCDataChannelInit;
use webrtc::data_channel::data_channel_message::DataChannelMessage;
use webrtc::data_channel::RTCDataChannel;
use webrtc::peer_connection::configuration::RTCConfiguration;
use webrtc::ice_transport::ice_server::RTCIceServer;
use webrtc::peer_connection::peer_connection_state::RTCPeerConnectionState;
use webrtc::peer_connection::offer_answer_options::RTCOfferOptions;
use webrtc::peer_connection::sdp::session_description::RTCSessionDescription;
use webrtc::peer_connection::RTCPeerConnection;

use super::types::{
    ConnectionInfo, ConnectionMode, ConnectionState, SharedDataChannel, SharedPeerConnection,
    EVENTS_CHANNEL_LABEL, FILES_CHANNEL_LABEL, HANDSHAKE_PING, HANDSHAKE_PONG,
};
use crate::crypto::{ChannelCipherSet, WorkspaceKeyRegistry, WORKSPACE_KEY_LEN};
use crate::state::configured_ice_server_entries;

const MAX_INCOMING_QUEUE_MESSAGES: usize = 512;

fn push_incoming_message(queue: &mut Vec<Vec<u8>>, message: Vec<u8>) {
    if queue.len() >= MAX_INCOMING_QUEUE_MESSAGES {
        queue.remove(0);
    }
    queue.push(message);
}

struct SessionCiphers {
    scope_id: String,
    workspace_key: [u8; WORKSPACE_KEY_LEN],
    events: ChannelCipherSet,
    files: ChannelCipherSet,
}

pub struct WebRtcSession {
    pub peer_device_id: String,
    pub workspace_id: Option<String>,
    pub state: Arc<Mutex<ConnectionState>>,
    pub pc: SharedPeerConnection,
    pub events_channel: Arc<Mutex<Option<SharedDataChannel>>>,
    pub files_channel: Arc<Mutex<Option<SharedDataChannel>>>,
    ciphers: Arc<Mutex<Option<SessionCiphers>>>,
    pub bytes_sent: AtomicU64,
    pub bytes_received: AtomicU64,
    pub connected_at: Mutex<Option<u64>>,
    pub manual_close: Arc<std::sync::atomic::AtomicBool>,
    pub connection_mode: Mutex<Option<ConnectionMode>>,
    incoming_events: Arc<Mutex<Vec<Vec<u8>>>>,
    incoming_files: Arc<Mutex<Vec<Vec<u8>>>>,
}

impl WebRtcSession {
    pub async fn new(
        peer_device_id: String,
        workspace_id: Option<String>,
        api: &webrtc::api::API,
        lan_only: bool,
    ) -> Result<Self, String> {
        let ice_servers = if lan_only {
            Vec::new()
        } else {
            configured_ice_server_entries()
                .into_iter()
                .map(|entry| {
                    let mut server = RTCIceServer {
                        urls: entry.urls,
                        ..Default::default()
                    };
                    if let Some(username) = entry.username {
                        server.username = username;
                    }
                    if let Some(credential) = entry.credential {
                        server.credential = credential;
                    }
                    server
                })
                .collect()
        };
        let config = RTCConfiguration {
            ice_servers,
            ..Default::default()
        };
        let pc = Arc::new(
            api.new_peer_connection(config)
                .await
                .map_err(|e| e.to_string())?,
        );

        Ok(Self {
            peer_device_id,
            workspace_id,
            state: Arc::new(Mutex::new(ConnectionState::Idle)),
            pc,
            events_channel: Arc::new(Mutex::new(None)),
            files_channel: Arc::new(Mutex::new(None)),
            ciphers: Arc::new(Mutex::new(None)),
            bytes_sent: AtomicU64::new(0),
            bytes_received: AtomicU64::new(0),
            connected_at: Mutex::new(None),
            manual_close: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            connection_mode: Mutex::new(None),
            incoming_events: Arc::new(Mutex::new(Vec::new())),
            incoming_files: Arc::new(Mutex::new(Vec::new())),
        })
    }

    pub async fn set_state(&self, state: ConnectionState) {
        *self.state.lock().await = state;
    }

    pub async fn current_state(&self) -> ConnectionState {
        self.state.lock().await.clone()
    }

    pub async fn prepare_incoming_channels(&self) {
        let events_channel = Arc::clone(&self.events_channel);
        let files_channel = Arc::clone(&self.files_channel);
        self.pc.on_data_channel(Box::new(move |channel: Arc<RTCDataChannel>| {
            let events_channel = Arc::clone(&events_channel);
            let files_channel = Arc::clone(&files_channel);
            Box::pin(async move {
                let label = channel.label().to_string();
                if label == EVENTS_CHANNEL_LABEL {
                    *events_channel.lock().await = Some(Arc::clone(&channel));
                } else if label == FILES_CHANNEL_LABEL {
                    *files_channel.lock().await = Some(Arc::clone(&channel));
                }
            })
        }));
    }

    pub async fn create_outgoing_channels(&self) -> Result<(), String> {
        let events = self
            .pc
            .create_data_channel(
                EVENTS_CHANNEL_LABEL,
                Some(RTCDataChannelInit {
                    ordered: Some(true),
                    ..Default::default()
                }),
            )
            .await
            .map_err(|e| e.to_string())?;
        *self.events_channel.lock().await = Some(events);

        let files = self
            .pc
            .create_data_channel(
                FILES_CHANNEL_LABEL,
                Some(RTCDataChannelInit {
                    ordered: Some(false),
                    max_retransmits: Some(0),
                    ..Default::default()
                }),
            )
            .await
            .map_err(|e| e.to_string())?;
        *self.files_channel.lock().await = Some(files);
        Ok(())
    }

    pub async fn create_offer_sdp(&self) -> Result<String, String> {
        self.create_offer_sdp_with_options(None).await
    }

    pub async fn create_ice_restart_offer_sdp(&self) -> Result<String, String> {
        self.create_offer_sdp_with_options(Some(RTCOfferOptions {
            ice_restart: true,
            ..Default::default()
        }))
        .await
    }

    async fn create_offer_sdp_with_options(
        &self,
        options: Option<RTCOfferOptions>,
    ) -> Result<String, String> {
        if self.events_channel.lock().await.is_none() {
            self.create_outgoing_channels().await?;
        }
        let offer = self
            .pc
            .create_offer(options)
            .await
            .map_err(|e| e.to_string())?;
        let mut gathering_complete = self.pc.gathering_complete_promise().await;
        self.pc
            .set_local_description(offer)
            .await
            .map_err(|e| e.to_string())?;
        let _ = gathering_complete.recv().await;
        self.pc
            .local_description()
            .await
            .map(|desc| desc.sdp)
            .ok_or_else(|| "Missing local offer description".to_string())
    }

    pub async fn accept_ice_restart_offer(&self, offer_sdp: &str) -> Result<String, String> {
        let offer =
            RTCSessionDescription::offer(offer_sdp.to_string()).map_err(|e| e.to_string())?;
        self.pc
            .set_remote_description(offer)
            .await
            .map_err(|e| e.to_string())?;
        let answer = self
            .pc
            .create_answer(None)
            .await
            .map_err(|e| e.to_string())?;
        let mut gathering_complete = self.pc.gathering_complete_promise().await;
        self.pc
            .set_local_description(answer)
            .await
            .map_err(|e| e.to_string())?;
        let _ = gathering_complete.recv().await;
        self.pc
            .local_description()
            .await
            .map(|desc| desc.sdp)
            .ok_or_else(|| "Missing local answer description".to_string())
    }

    pub async fn accept_offer_and_create_answer(&self, offer_sdp: &str) -> Result<String, String> {
        let offer =
            RTCSessionDescription::offer(offer_sdp.to_string()).map_err(|e| e.to_string())?;
        self.pc
            .set_remote_description(offer)
            .await
            .map_err(|e| e.to_string())?;
        let answer = self
            .pc
            .create_answer(None)
            .await
            .map_err(|e| e.to_string())?;
        let mut gathering_complete = self.pc.gathering_complete_promise().await;
        self.pc
            .set_local_description(answer)
            .await
            .map_err(|e| e.to_string())?;
        let _ = gathering_complete.recv().await;
        self.pc
            .local_description()
            .await
            .map(|desc| desc.sdp)
            .ok_or_else(|| "Missing local answer description".to_string())
    }

    pub async fn apply_answer(&self, answer_sdp: &str) -> Result<(), String> {
        let answer =
            RTCSessionDescription::answer(answer_sdp.to_string()).map_err(|e| e.to_string())?;
        self.pc
            .set_remote_description(answer)
            .await
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    pub async fn wait_until_connected(&self, wait_for: Duration) -> Result<(), String> {
        if self.pc.connection_state() == RTCPeerConnectionState::Connected {
            return Ok(());
        }

        let (tx, rx) = oneshot::channel::<()>();
        let tx = Arc::new(Mutex::new(Some(tx)));
        self.pc.on_peer_connection_state_change(Box::new({
            let tx = Arc::clone(&tx);
            move |state| {
                let tx = Arc::clone(&tx);
                Box::pin(async move {
                    if matches!(
                        state,
                        RTCPeerConnectionState::Connected
                            | RTCPeerConnectionState::Failed
                            | RTCPeerConnectionState::Closed
                    ) {
                        if let Some(sender) = tx.lock().await.take() {
                            let _ = sender.send(());
                        }
                    }
                })
            }
        }));

        timeout(wait_for, rx)
            .await
            .map_err(|_| "Timed out waiting for WebRTC connection".to_string())?
            .map_err(|_| "WebRTC connection watcher dropped".to_string())?;

        if self.pc.connection_state() == RTCPeerConnectionState::Connected {
            Ok(())
        } else {
            Err(format!(
                "Peer connection ended in state {:?}",
                self.pc.connection_state()
            ))
        }
    }

    pub async fn is_transport_ready(&self) -> bool {
        if self
            .manual_close
            .load(std::sync::atomic::Ordering::Relaxed)
        {
            return false;
        }
        if self.pc.connection_state() != RTCPeerConnectionState::Connected {
            return false;
        }
        let events_ready =
            Self::channel_is_open(self.events_channel.lock().await.as_ref()).await;
        let files_ready =
            Self::channel_is_open(self.files_channel.lock().await.as_ref()).await;
        events_ready && files_ready
    }

    pub async fn wait_for_channels_open(&self, wait_for: Duration) -> Result<(), String> {
        let deadline = tokio::time::Instant::now() + wait_for;
        loop {
            let events_ready = Self::channel_is_open(self.events_channel.lock().await.as_ref()).await;
            let files_ready = Self::channel_is_open(self.files_channel.lock().await.as_ref()).await;
            if events_ready && files_ready {
                return Ok(());
            }
            if tokio::time::Instant::now() >= deadline {
                return Err("Timed out waiting for data channels".to_string());
            }
            sleep(Duration::from_millis(100)).await;
        }
    }

    async fn channel_is_open(channel: Option<&SharedDataChannel>) -> bool {
        match channel {
            Some(dc) => dc.ready_state() == RTCDataChannelState::Open,
            None => false,
        }
    }

    pub async fn init_ciphers_with_material(
        &self,
        workspace_key: [u8; WORKSPACE_KEY_LEN],
        scope_id: String,
        key_version: u32,
    ) -> Result<(), String> {
        let events = ChannelCipherSet::new(
            &workspace_key,
            &scope_id,
            EVENTS_CHANNEL_LABEL,
            key_version,
        )?;
        let files = ChannelCipherSet::new(
            &workspace_key,
            &scope_id,
            FILES_CHANNEL_LABEL,
            key_version,
        )?;
        *self.ciphers.lock().await = Some(SessionCiphers {
            scope_id,
            workspace_key,
            events,
            files,
        });
        Ok(())
    }

    pub async fn init_ciphers(
        &self,
        local_device_id: &str,
        registry: &WorkspaceKeyRegistry,
    ) -> Result<(), String> {
        let (workspace_key, scope_id, key_version) = registry.resolve_workspace_material(
            self.workspace_id.as_deref(),
            local_device_id,
            &self.peer_device_id,
        );
        self.init_ciphers_with_material(workspace_key, scope_id, key_version)
            .await
    }

    pub async fn rotate_ciphers_if_workspace(
        &self,
        workspace_id: &str,
        workspace_key: [u8; WORKSPACE_KEY_LEN],
        key_version: u32,
    ) -> Result<(), String> {
        let mut guard = self.ciphers.lock().await;
        let Some(ciphers) = guard.as_mut() else {
            return Ok(());
        };

        ciphers.workspace_key = workspace_key;
        ciphers.scope_id = workspace_id.to_string();
        ciphers.events.rotate(
            &workspace_key,
            workspace_id,
            EVENTS_CHANNEL_LABEL,
            key_version,
        )?;
        ciphers.files.rotate(
            &workspace_key,
            workspace_id,
            FILES_CHANNEL_LABEL,
            key_version,
        )?;
        Ok(())
    }

    pub async fn perform_handshake(&self, as_offerer: bool) -> Result<(), String> {
        if as_offerer {
            self.send_on_channel(EVENTS_CHANNEL_LABEL, HANDSHAKE_PING)
                .await?;
            self.wait_for_message_on_events(HANDSHAKE_PONG, Duration::from_secs(10))
                .await?;
        } else {
            self.wait_for_message_on_events(HANDSHAKE_PING, Duration::from_secs(10))
                .await?;
            self.send_on_channel(EVENTS_CHANNEL_LABEL, HANDSHAKE_PONG)
                .await?;
        }
        Ok(())
    }

    pub async fn send_on_channel(&self, channel: &str, data: &[u8]) -> Result<(), String> {
        let dc = match channel {
            EVENTS_CHANNEL_LABEL => self.events_channel.lock().await.clone(),
            FILES_CHANNEL_LABEL => self.files_channel.lock().await.clone(),
            _ => return Err(format!("Unknown channel: {channel}")),
        }
        .ok_or_else(|| format!("Channel not open: {channel}"))?;

        let payload = {
            let guard = self.ciphers.lock().await;
            let ciphers = guard
                .as_ref()
                .ok_or_else(|| "Channel cipher not initialized".to_string())?;
            let cipher = match channel {
                EVENTS_CHANNEL_LABEL => &ciphers.events,
                FILES_CHANNEL_LABEL => &ciphers.files,
                _ => return Err(format!("Unknown channel: {channel}")),
            };
            cipher.encrypt(data)?
        };
        let sent_len = payload.len() as u64;

        dc.send(&Bytes::from(payload))
            .await
            .map_err(|e| e.to_string())?;
        self.bytes_sent.fetch_add(sent_len, Ordering::Relaxed);
        Ok(())
    }

    async fn wait_for_message_on_events(
        &self,
        expected: &[u8],
        wait_for: Duration,
    ) -> Result<(), String> {
        let notify = Arc::new(Notify::new());
        let matched = Arc::new(std::sync::atomic::AtomicBool::new(false));
        let channel = self
            .events_channel
            .lock()
            .await
            .clone()
            .ok_or_else(|| "Events channel not ready".to_string())?;

        let notify_for_cb = Arc::clone(&notify);
        let matched_for_cb = Arc::clone(&matched);
        let ciphers_for_cb = Arc::clone(&self.ciphers);
        let expected = expected.to_vec();
        let expected_len = expected.len();
        channel.on_message(Box::new(move |message: DataChannelMessage| {
            let notify = Arc::clone(&notify_for_cb);
            let matched = Arc::clone(&matched_for_cb);
            let ciphers = Arc::clone(&ciphers_for_cb);
            let expected = expected.clone();
            Box::pin(async move {
                let plaintext = {
                    let guard = ciphers.lock().await;
                    guard
                        .as_ref()
                        .and_then(|session| session.events.decrypt(message.data.as_ref()).ok())
                };
                if plaintext.as_deref() == Some(expected.as_slice()) {
                    matched.store(true, Ordering::Relaxed);
                    notify.notify_waiters();
                }
            })
        }));

        let result = timeout(wait_for, async {
            while !matched.load(Ordering::Relaxed) {
                notify.notified().await;
            }
        })
        .await;

        if result.is_err() {
            return Err("Timed out waiting for handshake message".to_string());
        }
        self.bytes_received
            .fetch_add(expected_len as u64, Ordering::Relaxed);
        Ok(())
    }

    pub async fn install_events_message_listener(&self) {
        let channel = {
            let guard = self.events_channel.lock().await;
            guard.clone()
        };
        let Some(channel) = channel else {
            return;
        };

        let queue = Arc::clone(&self.incoming_events);
        let ciphers = Arc::clone(&self.ciphers);

        channel.on_message(Box::new(move |message: DataChannelMessage| {
            let queue = Arc::clone(&queue);
            let ciphers = Arc::clone(&ciphers);
            Box::pin(async move {
                let plaintext = {
                    let guard = ciphers.lock().await;
                    guard.as_ref().and_then(|session| {
                        session.events.decrypt(message.data.as_ref()).ok()
                    })
                };
                let Some(plaintext) = plaintext else {
                    return;
                };
                if plaintext == HANDSHAKE_PING || plaintext == HANDSHAKE_PONG {
                    return;
                }
                let mut guard = queue.lock().await;
                push_incoming_message(&mut guard, plaintext);
            })
        }));
    }

    pub async fn install_connection_state_monitor(&self) {
        let state = Arc::clone(&self.state);
        let manual_close = Arc::clone(&self.manual_close);
        self.pc.on_peer_connection_state_change(Box::new(move |pc_state| {
            let state = Arc::clone(&state);
            let manual_close = Arc::clone(&manual_close);
            Box::pin(async move {
                if manual_close.load(std::sync::atomic::Ordering::Relaxed) {
                    return;
                }
                match pc_state {
                    RTCPeerConnectionState::Disconnected => {
                        *state.lock().await = ConnectionState::Reconnecting;
                    }
                    RTCPeerConnectionState::Failed | RTCPeerConnectionState::Closed => {
                        *state.lock().await = ConnectionState::Closed;
                    }
                    RTCPeerConnectionState::Connected => {
                        *state.lock().await = ConnectionState::Connected;
                    }
                    _ => {}
                }
            })
        }));
    }

    pub async fn install_files_message_listener(&self) {
        let channel = {
            let guard = self.files_channel.lock().await;
            guard.clone()
        };
        let Some(channel) = channel else {
            return;
        };

        let queue = Arc::clone(&self.incoming_files);
        let ciphers = Arc::clone(&self.ciphers);

        channel.on_message(Box::new(move |message: DataChannelMessage| {
            let queue = Arc::clone(&queue);
            let ciphers = Arc::clone(&ciphers);
            Box::pin(async move {
                let plaintext = {
                    let guard = ciphers.lock().await;
                    guard.as_ref().and_then(|session| {
                        session.files.decrypt(message.data.as_ref()).ok()
                    })
                };
                let Some(plaintext) = plaintext else {
                    return;
                };
                let mut guard = queue.lock().await;
                push_incoming_message(&mut guard, plaintext);
            })
        }));
    }

    pub async fn drain_incoming_events(&self) -> Vec<Vec<u8>> {
        let mut queue = self.incoming_events.lock().await;
        if queue.is_empty() {
            return Vec::new();
        }
        let drained = std::mem::take(&mut *queue);
        let total: u64 = drained.iter().map(|item| item.len() as u64).sum();
        self.bytes_received.fetch_add(total, Ordering::Relaxed);
        drained
    }

    pub async fn drain_incoming_files(&self) -> Vec<Vec<u8>> {
        let mut queue = self.incoming_files.lock().await;
        if queue.is_empty() {
            return Vec::new();
        }
        let drained = std::mem::take(&mut *queue);
        let total: u64 = drained.iter().map(|item| item.len() as u64).sum();
        self.bytes_received.fetch_add(total, Ordering::Relaxed);
        drained
    }

    pub async fn close(&self) {
        let _ = self.pc.close().await;
    }

    pub async fn set_connection_mode(&self, mode: ConnectionMode) {
        *self.connection_mode.lock().await = Some(mode);
    }

    pub async fn connection_mode(&self) -> Option<ConnectionMode> {
        self.connection_mode.lock().await.clone()
    }

    pub async fn info_snapshot(&self) -> ConnectionInfo {
        ConnectionInfo {
            peer_device_id: self.peer_device_id.clone(),
            state: self.current_state().await,
            workspace_id: self.workspace_id.clone(),
            connected_at: *self.connected_at.lock().await,
            bytes_sent: self.bytes_sent.load(Ordering::Relaxed),
            bytes_received: self.bytes_received.load(Ordering::Relaxed),
            connection_mode: self.connection_mode.lock().await.clone(),
        }
    }

    pub async fn mark_connected(&self) {
        self.set_state(ConnectionState::Connected).await;
        let mut connected_at = self.connected_at.lock().await;
        if connected_at.is_none() {
            *connected_at = Some(now_ms());
        }
    }
}

pub fn build_api() -> Result<webrtc::api::API, String> {
    let mut media_engine = MediaEngine::default();
    media_engine
        .register_default_codecs()
        .map_err(|e| e.to_string())?;
    let registry = register_default_interceptors(Default::default(), &mut media_engine)
        .map_err(|e| e.to_string())?;
    Ok(APIBuilder::new()
        .with_media_engine(media_engine)
        .with_interceptor_registry(registry)
        .build())
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}
