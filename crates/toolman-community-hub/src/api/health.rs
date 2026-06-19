use axum::extract::State;
use axum::Json;

use crate::state::AppState;

use super::response::ApiResponse;

#[derive(serde::Serialize)]
pub struct HealthData {
    pub status: &'static str,
    pub version: &'static str,
    pub db: &'static str,
    pub data_dir: String,
    pub require_review: bool,
    pub user_count: i64,
    pub resource_count: i64,
}

pub async fn health(State(state): State<AppState>) -> Json<ApiResponse<HealthData>> {
    let user_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM community_users")
        .fetch_one(&state.db)
        .await
        .unwrap_or((0,));

    let resource_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM community_resources")
        .fetch_one(&state.db)
        .await
        .unwrap_or((0,));

    Json(ApiResponse::ok(HealthData {
        status: "healthy",
        version: crate::VERSION,
        db: "connected",
        data_dir: state.config.data_dir.display().to_string(),
        require_review: state.config.require_review,
        user_count: user_count.0,
        resource_count: resource_count.0,
    }))
}
