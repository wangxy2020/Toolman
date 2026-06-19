use napi_derive::napi;

use crate::connection::ConnectionState;
use crate::state::{configured_ice_servers, set_configured_ice_servers, CONNECTIONS};

use super::connection::NapiConnectionConnectResult;

#[napi(object)]
pub struct NapiInviteConnectResult {
    pub state: String,
    #[napi(js_name = "answerSdp")]
    pub answer_sdp: String,
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
pub fn connection_get_stun_servers() -> napi::Result<Vec<String>> {
    Ok(configured_ice_servers())
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
    let mut manager = CONNECTIONS.lock().await;
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
    let mut manager = CONNECTIONS.lock().await;
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
