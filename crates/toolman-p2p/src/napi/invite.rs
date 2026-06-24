use napi_derive::napi;

use crate::connection::ConnectionState;
use crate::state::{
    configured_ice_server_entries, configured_ice_servers, set_configured_ice_server_entries,
    set_configured_ice_servers, IceServerEntry,
};

use super::connection::NapiConnectionConnectResult;

#[napi(object)]
pub struct NapiInviteConnectResult {
    pub state: String,
    #[napi(js_name = "answerSdp")]
    pub answer_sdp: String,
}

#[napi(object)]
pub struct NapiIceServer {
    pub urls: Vec<String>,
    pub username: Option<String>,
    pub credential: Option<String>,
}

fn map_state(state: ConnectionState) -> String {
    state.as_str().to_string()
}

#[napi]
pub fn connection_set_stun_servers(servers: Vec<String>) -> napi::Result<()> {
    set_configured_ice_servers(servers);
    Ok(())
}

#[napi]
pub fn connection_set_ice_servers(servers: Vec<NapiIceServer>) -> napi::Result<()> {
    let entries = servers
        .into_iter()
        .filter_map(|server| {
            let urls: Vec<String> = server
                .urls
                .into_iter()
                .map(|url| url.trim().to_string())
                .filter(|url| !url.is_empty())
                .collect();
            if urls.is_empty() {
                return None;
            }
            Some(IceServerEntry {
                urls,
                username: server
                    .username
                    .map(|value| value.trim().to_string())
                    .filter(|value| !value.is_empty()),
                credential: server
                    .credential
                    .map(|value| value.trim().to_string())
                    .filter(|value| !value.is_empty()),
            })
        })
        .collect::<Vec<_>>();
    set_configured_ice_server_entries(entries);
    Ok(())
}

#[napi]
pub fn connection_get_stun_servers() -> napi::Result<Vec<String>> {
    Ok(configured_ice_servers())
}

#[napi]
pub fn connection_get_ice_servers() -> napi::Result<Vec<NapiIceServer>> {
    Ok(configured_ice_server_entries()
        .into_iter()
        .map(|entry| NapiIceServer {
            urls: entry.urls,
            username: entry.username,
            credential: entry.credential,
        })
        .collect())
}

#[napi]
pub async fn invite_create_offer(
    invite_id: String,
    workspace_id: Option<String>,
) -> napi::Result<String> {
    crate::connection::ConnectionManager::create_invite_offer(invite_id, workspace_id)
        .await
        .map_err(napi::Error::from_reason)
}

#[napi]
pub async fn invite_wait_for_answer(
    invite_id: String,
    timeout_secs: Option<u32>,
) -> napi::Result<NapiConnectionConnectResult> {
    let mut manager = crate::state::CONNECTIONS.lock().await;
    let state = manager
        .wait_for_invite_answer(invite_id, timeout_secs.unwrap_or(300) as u64)
        .await
        .map_err(napi::Error::from_reason)?;
    Ok(NapiConnectionConnectResult {
        state: map_state(state),
    })
}

#[napi]
pub async fn invite_connect_as_joiner(
    owner_device_id: String,
    workspace_id: Option<String>,
    offer_sdp: String,
    invite_id: String,
) -> napi::Result<NapiInviteConnectResult> {
    let mut manager = crate::state::CONNECTIONS.lock().await;
    let (state, answer_sdp) = manager
        .connect_via_invite(
            &owner_device_id,
            workspace_id,
            &offer_sdp,
            &invite_id,
        )
        .await
        .map_err(napi::Error::from_reason)?;
    Ok(NapiInviteConnectResult {
        state: map_state(state),
        answer_sdp,
    })
}
