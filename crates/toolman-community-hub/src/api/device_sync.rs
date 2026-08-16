use axum::extract::State;
use axum::routing::post;
use axum::{Json, Router};
use serde::{Deserialize, Serialize};

use crate::api::auth::AuthUser;
use crate::api::error::ApiError;
use crate::api::response::ApiResponse;
use crate::repositories::{DeviceSyncRepository, UpsertDeviceSyncChangeInput};
use crate::state::AppState;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SyncChangeBody {
    entity_kind: String,
    entity_id: String,
    op: String,
    updated_at: i64,
    #[serde(default)]
    payload: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PushBody {
    #[serde(default)]
    changes: Vec<SyncChangeBody>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PullBody {
    #[serde(default)]
    cursor: Option<String>,
    #[serde(default)]
    limit: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PushData {
    accepted: i64,
    rejected: Vec<RejectedChange>,
    server_time: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RejectedChange {
    entity_id: String,
    reason: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PullData {
    changes: Vec<PulledChange>,
    next_cursor: Option<String>,
    has_more: bool,
    server_time: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PulledChange {
    entity_kind: String,
    entity_id: String,
    op: String,
    updated_at: i64,
    payload: serde_json::Value,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/sync/push", post(push_changes))
        .route("/sync/pull", post(pull_changes))
}

fn repo(state: &AppState) -> DeviceSyncRepository {
    DeviceSyncRepository::new(state.db.clone())
}

async fn push_changes(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Json(body): Json<PushBody>,
) -> Result<Json<ApiResponse<PushData>>, ApiError> {
    if body.changes.len() > 500 {
        return Err(ApiError::validation("changes exceed 500"));
    }
    let repo = repo(&state);
    let mut accepted = 0_i64;
    let mut rejected = Vec::new();
    for change in body.changes {
        if change.entity_kind.trim().is_empty() || change.entity_id.trim().is_empty() {
            rejected.push(RejectedChange {
                entity_id: change.entity_id,
                reason: "invalid entity".to_string(),
            });
            continue;
        }
        if change.op != "upsert" && change.op != "delete" {
            rejected.push(RejectedChange {
                entity_id: change.entity_id,
                reason: "invalid op".to_string(),
            });
            continue;
        }
        let payload = change
            .payload
            .unwrap_or_else(|| serde_json::json!({}));
        repo.upsert_change(UpsertDeviceSyncChangeInput {
            identity_id: user.id.clone(),
            entity_kind: change.entity_kind,
            entity_id: change.entity_id,
            op: change.op,
            updated_at: change.updated_at,
            payload: payload.to_string(),
        })
        .await?;
        accepted += 1;
    }
    Ok(Json(ApiResponse::ok(PushData {
        accepted,
        rejected,
        server_time: chrono::Utc::now().timestamp_millis(),
    })))
}

async fn pull_changes(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Json(body): Json<PullBody>,
) -> Result<Json<ApiResponse<PullData>>, ApiError> {
    let after_seq = body
        .cursor
        .as_deref()
        .and_then(|value| value.parse::<i64>().ok())
        .unwrap_or(0)
        .max(0);
    let limit = body.limit.unwrap_or(100).clamp(1, 500);
    let repo = repo(&state);
    let rows = repo.pull_after(&user.id, after_seq, limit + 1).await?;
    let has_more = rows.len() as i64 > limit;
    let slice: Vec<_> = rows.into_iter().take(limit as usize).collect();
    let next_cursor = slice.last().map(|row| row.seq.to_string());
    let changes = slice
        .into_iter()
        .map(|row| PulledChange {
            entity_kind: row.entity_kind,
            entity_id: row.entity_id,
            op: row.op,
            updated_at: row.updated_at,
            payload: serde_json::from_str(&row.payload).unwrap_or_else(|_| serde_json::json!({})),
        })
        .collect();
    Ok(Json(ApiResponse::ok(PullData {
        changes,
        next_cursor,
        has_more,
        server_time: chrono::Utc::now().timestamp_millis(),
    })))
}
