use axum::extract::{Query, State};
use axum::routing::get;
use axum::Json;
use axum::Router;
use serde::Deserialize;

use crate::services::EmbeddingService;
use crate::state::AppState;

use super::error::ApiError;
use super::response::ApiResponse;

#[derive(Debug, Deserialize)]
pub struct SemanticSearchQuery {
    pub q: String,
    #[serde(default = "default_limit")]
    #[allow(dead_code)]
    pub limit: u32,
}

fn default_limit() -> u32 {
    20
}

#[derive(serde::Serialize)]
pub struct SemanticSearchDisabledData {
    pub status: &'static str,
    pub query: String,
}

pub fn router() -> Router<AppState> {
    Router::new().route("/search/semantic", get(semantic_search))
}

pub async fn semantic_search(
    State(state): State<AppState>,
    Query(query): Query<SemanticSearchQuery>,
) -> Result<Json<ApiResponse<SemanticSearchDisabledData>>, ApiError> {
    let trimmed = query.q.trim();
    if trimmed.is_empty() {
        return Err(ApiError::validation("search query must not be empty"));
    }

    let embedding = EmbeddingService::from_config(&state.config);
    if !embedding.is_enabled() {
        return Err(ApiError::not_implemented(
            "Semantic search is disabled. Set COMMUNITY_HUB_SEMANTIC_SEARCH=1 and configure COMMUNITY_HUB_EMBEDDING_URL.",
        ));
    }

    if embedding.provider_url().is_none() {
        return Err(ApiError::not_implemented(
            "Semantic search is enabled but COMMUNITY_HUB_EMBEDDING_URL is not configured.",
        ));
    }

    Err(ApiError::not_implemented(
        "Embedding provider integration is not available yet.",
    ))
}
