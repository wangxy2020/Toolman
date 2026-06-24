use axum::extract::State;
use axum::Json;

use crate::services::EmbeddingService;
use crate::state::AppState;

use super::response::ApiResponse;

#[derive(serde::Serialize)]
pub struct HealthData {
    pub status: &'static str,
    pub version: &'static str,
    pub db: &'static str,
    pub data_dir: String,
    pub require_review: bool,
    pub rate_limit_rpm: u64,
    pub semantic_search: &'static str,
    pub user_count: i64,
    pub resource_count: i64,
    pub crash_report_count: i64,
    /// F1 peering API surface is available on this Hub build (catalog sync lands in PR2).
    pub federation_peering: bool,
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

    let crash_report_count: (i64,) =
        sqlx::query_as("SELECT COUNT(*) FROM client_crash_reports")
            .fetch_one(&state.db)
            .await
            .unwrap_or((0,));

    let embedding = EmbeddingService::from_config(&state.config);

    Json(ApiResponse::ok(HealthData {
        status: "healthy",
        version: crate::VERSION,
        db: "connected",
        data_dir: state.config.data_dir.display().to_string(),
        require_review: state.config.require_review,
        rate_limit_rpm: state.config.rate_limit_rpm,
        semantic_search: embedding.status_label(),
        user_count: user_count.0,
        resource_count: resource_count.0,
        crash_report_count: crash_report_count.0,
        federation_peering: true,
    }))
}
