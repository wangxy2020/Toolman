use axum::extract::State;
use axum::routing::post;
use axum::{Json, Router};
use serde::{Deserialize, Serialize};

use crate::api::error::ApiError;
use crate::api::response::ApiResponse;
use crate::repositories::{WorkspaceMailboxRepository, WorkspaceMailboxRepositoryError};
use crate::state::AppState;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PutBody {
    workspace_id: String,
    device_id: String,
    recipient_device_id: String,
    grant: String,
    ciphertext_b64: String,
    #[serde(default)]
    seq: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PullBody {
    workspace_id: String,
    device_id: String,
    grant: String,
    #[serde(default)]
    since_seq: Option<i64>,
    #[serde(default)]
    limit: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PutData {
    ok: bool,
    stored: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct Envelope {
    seq: i64,
    ciphertext_b64: String,
    deposited_at: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PullData {
    ok: bool,
    envelopes: Vec<Envelope>,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/sync/p2p/mailbox/put", post(put_envelope))
        .route("/sync/p2p/mailbox/pull", post(pull_envelopes))
}

fn map_repo_error(error: WorkspaceMailboxRepositoryError) -> ApiError {
    match error {
        WorkspaceMailboxRepositoryError::GrantMismatch => {
            ApiError::forbidden("mailbox grant mismatch")
        }
        WorkspaceMailboxRepositoryError::Database(error) => ApiError::internal(error.to_string()),
    }
}

async fn put_envelope(
    State(state): State<AppState>,
    Json(body): Json<PutBody>,
) -> Result<Json<ApiResponse<PutData>>, ApiError> {
    if body.workspace_id.trim().is_empty()
        || body.device_id.trim().is_empty()
        || body.recipient_device_id.trim().is_empty()
        || body.grant.len() < 16
        || body.ciphertext_b64.len() < 16
    {
        return Err(ApiError::validation("invalid mailbox put"));
    }
    if body.ciphertext_b64.len() > 96 * 1024 {
        return Err(ApiError::validation("mailbox ciphertext too large"));
    }
    let seq = body.seq.unwrap_or_else(|| chrono::Utc::now().timestamp_millis());
    WorkspaceMailboxRepository::new(state.db.clone())
        .put(
            &body.workspace_id,
            &body.recipient_device_id,
            seq,
            &body.ciphertext_b64,
            &body.grant,
            chrono::Utc::now().timestamp_millis(),
        )
        .await
        .map_err(map_repo_error)?;
    Ok(Json(ApiResponse::ok(PutData {
        ok: true,
        stored: true,
    })))
}

async fn pull_envelopes(
    State(state): State<AppState>,
    Json(body): Json<PullBody>,
) -> Result<Json<ApiResponse<PullData>>, ApiError> {
    if body.workspace_id.trim().is_empty() || body.device_id.trim().is_empty() || body.grant.len() < 16
    {
        return Err(ApiError::validation("invalid mailbox pull"));
    }
    let limit = body.limit.unwrap_or(100).clamp(1, 200);
    let rows = WorkspaceMailboxRepository::new(state.db.clone())
        .pull(
            &body.workspace_id,
            &body.device_id,
            &body.grant,
            body.since_seq.unwrap_or(0).max(0),
            limit,
        )
        .await
        .map_err(map_repo_error)?;
    Ok(Json(ApiResponse::ok(PullData {
        ok: true,
        envelopes: rows
            .into_iter()
            .map(|row| Envelope {
                seq: row.seq,
                ciphertext_b64: row.ciphertext,
                deposited_at: row.deposited_at,
            })
            .collect(),
    })))
}
