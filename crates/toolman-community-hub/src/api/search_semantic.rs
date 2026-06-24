use axum::extract::{Query, State};
use axum::routing::get;
use axum::Json;
use axum::Router;
use serde::{Deserialize, Serialize};

use crate::services::{EmbeddingService, SearchService, SearchTargetType, UnifiedSearchQuery};
use crate::state::AppState;

use super::error::ApiError;
use super::response::ApiResponse;

#[derive(Debug, Deserialize)]
pub struct SemanticSearchQuery {
    pub q: String,
    #[serde(default = "default_limit")]
    pub limit: u32,
}

fn default_limit() -> u32 {
    20
}

#[derive(Debug, Serialize)]
pub struct SemanticSearchResultItem {
    pub target_type: String,
    pub target_id: String,
    pub title: String,
    pub snippet: Option<String>,
    pub rank: f64,
}

#[derive(Debug, Serialize)]
pub struct SemanticSearchResponseData {
    pub engine: &'static str,
    pub query: String,
    pub items: Vec<SemanticSearchResultItem>,
}

pub fn router() -> Router<AppState> {
    Router::new().route("/search/semantic", get(semantic_search))
}

pub async fn semantic_search(
    State(state): State<AppState>,
    Query(query): Query<SemanticSearchQuery>,
) -> Result<Json<ApiResponse<SemanticSearchResponseData>>, ApiError> {
    let trimmed = query.q.trim();
    if trimmed.is_empty() {
        return Err(ApiError::validation("search query must not be empty"));
    }

    let embedding = EmbeddingService::from_config(&state.config);
    if embedding.is_enabled() && embedding.provider_url().is_some() {
        return Err(ApiError::not_implemented(
            "Embedding provider integration is not available yet.",
        ));
    }

    let search = SearchService::new(state.db.clone());
    let hits = search
        .search_unified(&UnifiedSearchQuery {
            q: trimmed.to_string(),
            include_resources: true,
            include_news: true,
            resource_type: None,
            category: None,
            limit: query.limit as i64,
            offset: 0,
        })
        .await
        .map_err(|error| ApiError::internal(error.to_string()))?;

    let items = hits
        .into_iter()
        .map(|hit| SemanticSearchResultItem {
            target_type: match hit.target_type {
                SearchTargetType::Resource => "resource".to_string(),
                SearchTargetType::News => "news".to_string(),
            },
            target_id: hit.target_id,
            title: hit.title,
            snippet: if hit.snippet.is_empty() {
                None
            } else {
                Some(hit.snippet)
            },
            rank: hit.rank,
        })
        .collect();

    Ok(Json(ApiResponse::ok(SemanticSearchResponseData {
        engine: "fts",
        query: trimmed.to_string(),
        items,
    })))
}
