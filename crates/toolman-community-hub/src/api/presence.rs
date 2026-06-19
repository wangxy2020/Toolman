use axum::extract::State;
use axum::routing::post;
use axum::{Json, Router};
use serde::Deserialize;

use crate::api::auth::AuthUser;
use crate::api::error::ApiError;
use crate::api::response::ApiResponse;
use crate::services::presence_service::{DevicePresenceItem, PresenceService};
use crate::state::AppState;

#[derive(Debug, Deserialize)]
pub struct HeartbeatBody {
    pub device_id: String,
    pub device_name: String,
    #[serde(default = "default_device_kind")]
    pub device_kind: String,
}

fn default_device_kind() -> String {
    "desktop".to_string()
}

pub fn router() -> Router<AppState> {
    Router::new().route("/presence/heartbeat", post(heartbeat))
}

fn service(state: &AppState) -> PresenceService {
    PresenceService::new(state.db.clone())
}

async fn heartbeat(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Json(body): Json<HeartbeatBody>,
) -> Result<Json<ApiResponse<DevicePresenceItem>>, ApiError> {
    let item = service(&state)
        .heartbeat(
            &user,
            &body.device_id,
            &body.device_name,
            &body.device_kind,
        )
        .await?;
    Ok(Json(ApiResponse::ok(item)))
}
