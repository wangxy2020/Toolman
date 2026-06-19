use napi_derive::napi;

use crate::connection::types::{EVENTS_CHANNEL_LABEL, FILES_CHANNEL_LABEL};
use crate::connection::ConnectionState;
use crate::state::CONNECTIONS;

#[napi(object)]
pub struct NapiConnectionInfo {
    #[napi(js_name = "peerDeviceId")]
    pub peer_device_id: String,
    pub state: String,
    #[napi(js_name = "workspaceId")]
    pub workspace_id: Option<String>,
    #[napi(js_name = "connectedAt")]
    pub connected_at: Option<f64>,
    #[napi(js_name = "bytesSent")]
    pub bytes_sent: f64,
    #[napi(js_name = "bytesReceived")]
    pub bytes_received: f64,
    #[napi(js_name = "connectionMode")]
    pub connection_mode: Option<String>,
}

#[napi(object)]
pub struct NapiConnectionConnectResult {
    pub state: String,
}

#[napi(object)]
pub struct NapiConnectionListResult {
    pub connections: Vec<NapiConnectionInfo>,
}

#[napi(object)]
pub struct NapiIncomingMessage {
    #[napi(js_name = "peerDeviceId")]
    pub peer_device_id: String,
    pub channel: String,
    pub data: napi::bindgen_prelude::Buffer,
}

fn map_state(state: ConnectionState) -> String {
    state.as_str().to_string()
}

fn map_connection(info: crate::connection::ConnectionInfo) -> NapiConnectionInfo {
    NapiConnectionInfo {
        peer_device_id: info.peer_device_id,
        state: map_state(info.state),
        workspace_id: info.workspace_id,
        connected_at: info.connected_at.map(|value| value as f64),
        bytes_sent: info.bytes_sent as f64,
        bytes_received: info.bytes_received as f64,
        connection_mode: info
            .connection_mode
            .map(|mode| mode.as_str().to_string()),
    }
}

#[napi]
pub async fn connection_connect(
    peer_device_id: String,
    workspace_id: Option<String>,
) -> napi::Result<NapiConnectionConnectResult> {
    let mut manager = CONNECTIONS.lock().await;
    let state = manager
        .connect(&peer_device_id, workspace_id)
        .await
        .map_err(napi::Error::from_reason)?;
    Ok(NapiConnectionConnectResult {
        state: map_state(state),
    })
}

#[napi]
pub async fn connection_disconnect(peer_device_id: String) -> napi::Result<()> {
    let mut manager = CONNECTIONS.lock().await;
    manager
        .disconnect(&peer_device_id)
        .await
        .map_err(napi::Error::from_reason)
}

#[napi]
pub async fn connection_list() -> napi::Result<NapiConnectionListResult> {
    let manager = CONNECTIONS.lock().await;
    let connections = manager.list().await;
    Ok(NapiConnectionListResult {
        connections: connections.into_iter().map(map_connection).collect(),
    })
}

#[napi]
pub async fn connection_send(
    peer_device_id: String,
    channel: String,
    data: napi::bindgen_prelude::Buffer,
) -> napi::Result<()> {
    let manager = CONNECTIONS.lock().await;
    manager
        .send(&peer_device_id, &channel, data.as_ref())
        .await
        .map_err(napi::Error::from_reason)
}

#[napi]
pub async fn connection_drain_messages(
    peer_device_id: String,
) -> napi::Result<Vec<napi::bindgen_prelude::Buffer>> {
    let manager = CONNECTIONS.lock().await;
    let messages = manager.drain_incoming_events(&peer_device_id).await;
    Ok(messages
        .into_iter()
        .map(napi::bindgen_prelude::Buffer::from)
        .collect())
}

#[napi]
pub async fn connection_drain_all_messages() -> napi::Result<Vec<NapiIncomingMessage>> {
    let manager = CONNECTIONS.lock().await;
    let connections = manager.list().await;
    let mut results = Vec::new();
    for connection in connections {
        let event_messages = manager
            .drain_incoming_events(&connection.peer_device_id)
            .await;
        for data in event_messages {
            results.push(NapiIncomingMessage {
                peer_device_id: connection.peer_device_id.clone(),
                channel: EVENTS_CHANNEL_LABEL.to_string(),
                data: napi::bindgen_prelude::Buffer::from(data),
            });
        }

        let file_messages = manager
            .drain_incoming_files(&connection.peer_device_id)
            .await;
        for data in file_messages {
            results.push(NapiIncomingMessage {
                peer_device_id: connection.peer_device_id.clone(),
                channel: FILES_CHANNEL_LABEL.to_string(),
                data: napi::bindgen_prelude::Buffer::from(data),
            });
        }
    }
    Ok(results)
}
