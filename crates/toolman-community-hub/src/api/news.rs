use axum::extract::{Path, Query, State};
use axum::http::HeaderMap;
use axum::routing::{delete, get, post};
use axum::{Json, Router};
use serde::Deserialize;

use crate::api::auth::{load_optional_viewer, AuthUser};
use crate::api::error::ApiError;
use crate::api::response::ApiResponse;
use crate::domain::{CreateRssSourceInput, NewsArticleSort};
use crate::services::news_service::{
    CreateNewsCommentRequest, FetchSourceResult, NewsArticleItem, NewsArticleQuery,
    NewsCommentItem, NewsInteractionResult, NewsService, RssSourceItem,
};
use crate::state::AppState;

#[derive(Debug, Deserialize)]
pub struct CreateRssSourceBody {
    pub title: String,
    pub feed_url: String,
    pub site_url: Option<String>,
    pub category: Option<String>,
    pub language: Option<String>,
    pub fetch_interval_minutes: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct NewsArticleListParams {
    pub source_id: Option<String>,
    pub category: Option<String>,
    pub q: Option<String>,
    pub sort: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct RecommendedParams {
    pub limit: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct CommentListParams {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct CreateCommentBody {
    pub body: String,
    pub parent_id: Option<String>,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/news/sources", get(list_sources).post(create_source))
        .route("/news/sources/{id}", delete(delete_source))
        .route("/news/sources/{id}/fetch", post(fetch_source))
        .route("/news/articles/recommended", get(recommended_articles))
        .route("/news/articles", get(list_articles))
        .route(
            "/news/articles/{id}/comments",
            get(list_comments).post(create_comment),
        )
        .route("/news/articles/{id}/favorite", post(favorite_article))
        .route("/news/articles/{id}/like", post(like_article))
        .route("/news/articles/{id}/dislike", post(dislike_article))
        .route("/news/articles/{id}", get(get_article))
}

fn service(state: &AppState) -> NewsService {
    NewsService::new(state.db.clone())
}

async fn list_sources(
    State(state): State<AppState>,
) -> Result<Json<ApiResponse<Vec<RssSourceItem>>>, ApiError> {
    let sources = service(&state).list_sources().await?;
    Ok(Json(ApiResponse::ok(sources)))
}

async fn create_source(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Json(body): Json<CreateRssSourceBody>,
) -> Result<Json<ApiResponse<RssSourceItem>>, ApiError> {
    user.ensure_active().map_err(ApiError::from)?;
    let source = service(&state)
        .create_source(CreateRssSourceInput {
            id: None,
            title: body.title,
            feed_url: body.feed_url,
            site_url: body.site_url,
            category: body.category,
            language: body.language,
            enabled: Some(true),
            fetch_interval_minutes: body.fetch_interval_minutes,
        })
        .await?;

    Ok(Json(ApiResponse::ok(source)))
}

async fn delete_source(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<serde_json::Value>>, ApiError> {
    user.ensure_active().map_err(ApiError::from)?;
    service(&state).delete_source(&id).await?;
    Ok(Json(ApiResponse::ok(serde_json::json!({ "deleted": true }))))
}

async fn fetch_source(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<FetchSourceResult>>, ApiError> {
    user.ensure_active().map_err(ApiError::from)?;
    let result = service(&state).fetch_source(&id).await?;
    Ok(Json(ApiResponse::ok(result)))
}

async fn list_articles(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(params): Query<NewsArticleListParams>,
) -> Result<Json<ApiResponse<Vec<NewsArticleItem>>>, ApiError> {
    let viewer = load_optional_viewer(&state, &headers).await?;
    let sort = params
        .sort
        .as_deref()
        .map(NewsArticleSort::parse)
        .transpose()
        .map_err(|error| ApiError::validation(error.to_string()))?;

    let items = service(&state)
        .list_articles(
            &NewsArticleQuery {
                source_id: params.source_id,
                category: params.category,
                q: params.q,
                sort: sort.unwrap_or_default(),
                limit: params.limit.unwrap_or(20).clamp(1, 100),
                offset: params.offset.unwrap_or(0).max(0),
            },
            viewer.as_ref(),
        )
        .await?;

    Ok(Json(ApiResponse::ok(items)))
}

async fn recommended_articles(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(params): Query<RecommendedParams>,
) -> Result<Json<ApiResponse<Vec<NewsArticleItem>>>, ApiError> {
    let viewer = load_optional_viewer(&state, &headers).await?;
        let items = service(&state)
        .recommended_articles(viewer.as_ref(), params.limit.unwrap_or(10).clamp(1, 50))
        .await?;

    Ok(Json(ApiResponse::ok(items)))
}

async fn get_article(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<NewsArticleItem>>, ApiError> {
    let viewer = load_optional_viewer(&state, &headers).await?;
    let item = service(&state).get_article(&id, viewer.as_ref()).await?;
    Ok(Json(ApiResponse::ok(item)))
}

async fn favorite_article(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<NewsInteractionResult>>, ApiError> {
    let result = service(&state).favorite_article(&user, &id).await?;
    Ok(Json(ApiResponse::ok(result)))
}

async fn like_article(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<NewsInteractionResult>>, ApiError> {
    let result = service(&state).like_article(&user, &id).await?;
    Ok(Json(ApiResponse::ok(result)))
}

async fn dislike_article(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<NewsInteractionResult>>, ApiError> {
    let result = service(&state).dislike_article(&user, &id).await?;
    Ok(Json(ApiResponse::ok(result)))
}

async fn list_comments(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Query(params): Query<CommentListParams>,
) -> Result<Json<ApiResponse<Vec<NewsCommentItem>>>, ApiError> {
    let items = service(&state)
        .list_comments(
            &id,
            params.limit.unwrap_or(20).clamp(1, 100),
            params.offset.unwrap_or(0).max(0),
        )
        .await?;

    Ok(Json(ApiResponse::ok(items)))
}

async fn create_comment(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    Json(body): Json<CreateCommentBody>,
) -> Result<Json<ApiResponse<NewsCommentItem>>, ApiError> {
    let item = service(&state)
        .create_comment(
            &user,
            &id,
            CreateNewsCommentRequest {
                body: body.body,
                parent_id: body.parent_id,
            },
        )
        .await?;

    Ok(Json(ApiResponse::ok(item)))
}
