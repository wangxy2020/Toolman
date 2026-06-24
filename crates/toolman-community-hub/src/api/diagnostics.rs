use axum::extract::State;
use axum::routing::post;
use axum::{Json, Router};
use uuid::Uuid;

use crate::state::AppState;

use super::error::ApiError;
use super::response::ApiResponse;

#[derive(serde::Deserialize)]
pub struct CreateCrashReportBody {
    pub at: i64,
    pub app_version: String,
    pub platform: String,
    pub arch: String,
    pub kind: String,
    pub message: String,
    pub stack: Option<String>,
    pub device_id: Option<String>,
}

#[derive(serde::Serialize)]
pub struct CreateCrashReportData {
    pub id: String,
}

const MAX_MESSAGE_LEN: usize = 8_192;
const MAX_STACK_LEN: usize = 32_000;

pub fn router() -> Router<AppState> {
    Router::new().route("/diagnostics/crashes", post(create_crash_report))
}

async fn create_crash_report(
    State(state): State<AppState>,
    Json(body): Json<CreateCrashReportBody>,
) -> Result<Json<ApiResponse<CreateCrashReportData>>, ApiError> {
    let message = body.message.trim();
    if message.is_empty() {
        return Err(ApiError::validation("message is required"));
    }
    if message.len() > MAX_MESSAGE_LEN {
        return Err(ApiError::validation("message too long"));
    }

    let stack = body
        .stack
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);

    if stack.as_ref().is_some_and(|value| value.len() > MAX_STACK_LEN) {
        return Err(ApiError::validation("stack too long"));
    }

    let kind = body.kind.trim();
    if kind.is_empty() {
        return Err(ApiError::validation("kind is required"));
    }

    let id = Uuid::new_v4().to_string();
    let received_at = chrono::Utc::now().timestamp_millis();

    sqlx::query(
        r#"
        INSERT INTO client_crash_reports (
          id, received_at, client_at, app_version, platform, arch, kind, message, stack, device_id
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
        "#,
    )
    .bind(&id)
    .bind(received_at)
    .bind(body.at)
    .bind(body.app_version.trim())
    .bind(body.platform.trim())
    .bind(body.arch.trim())
    .bind(kind)
    .bind(message)
    .bind(stack)
    .bind(body.device_id.as_deref().map(str::trim).filter(|value| !value.is_empty()))
    .execute(&state.db)
    .await
    .map_err(|error| ApiError::internal(format!("failed to store crash report: {error}")))?;

    Ok(Json(ApiResponse::ok(CreateCrashReportData { id })))
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use tower::ServiceExt;
    use uuid::Uuid;

    use super::*;
    use crate::api::router;
    use crate::config::HubConfig;
    use crate::db::init_pool;

    fn temp_data_dir() -> PathBuf {
        std::env::temp_dir().join(format!("toolman-crash-api-{}", Uuid::new_v4()))
    }

    async fn test_app() -> (Router, sqlx::SqlitePool, PathBuf) {
        let data_dir = temp_data_dir();
        std::fs::create_dir_all(&data_dir).expect("data dir");
        let db_path = data_dir.join("community.db");
        let pool = init_pool(&db_path).await.expect("init pool");
        let config = HubConfig::with_data_dir(data_dir.clone());
        let state = AppState::new(config, pool.clone());
        (router(state), pool, data_dir)
    }

    #[tokio::test]
    async fn post_crash_report_persists_row() {
        let (app, pool, data_dir) = test_app().await;

        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/diagnostics/crashes")
                    .header("content-type", "application/json")
                    .body(Body::from(
                        r#"{
                          "at": 1710000000000,
                          "app_version": "0.1.0",
                          "platform": "darwin",
                          "arch": "arm64",
                          "kind": "uncaughtException",
                          "message": "test crash",
                          "stack": "Error: test crash\n    at main"
                        }"#,
                    ))
                    .unwrap(),
            )
            .await
            .expect("response");

        assert_eq!(response.status(), StatusCode::OK);

        let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM client_crash_reports")
            .fetch_one(&pool)
            .await
            .expect("count");
        assert_eq!(count.0, 1);

        pool.close().await;
        let _ = std::fs::remove_dir_all(data_dir);
    }
}
