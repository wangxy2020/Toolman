use axum::extract::{Path, Query, State};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Deserialize;

use crate::api::auth::{require_permission, AuthUser};
use crate::api::error::ApiError;
use crate::api::response::ApiResponse;
use crate::domain::{ResourceStatus, ResourceType, ResourceVisibility, UserPermission};
use crate::services::marketplace_service::{
    CreateMarketplaceDraftInput, MarketplaceListQuery, MarketplaceResourceDetail,
    MarketplaceResourceItem, MarketplaceService, MarketplaceVersionDetail,
    MarketplaceVersionSummary, UpdateMarketplaceResourceInput,
};
use crate::services::resource_social_service::ResourceSocialService;
use crate::services::SearchSort;
use crate::state::AppState;

#[derive(Debug, Deserialize)]
pub struct ResourceListParams {
    pub resource_type: Option<String>,
    pub category: Option<String>,
    pub tags: Option<String>,
    pub q: Option<String>,
    pub sort: Option<String>,
    pub visibility: Option<String>,
    pub status: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct CreateResourceRequest {
    pub title: String,
    pub description: Option<String>,
    pub resource_type: String,
    pub tags: Option<Vec<String>>,
    pub category: Option<String>,
    pub license: Option<String>,
    pub visibility: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct PatchResourceRequest {
    pub title: Option<String>,
    pub description: Option<String>,
    pub tags: Option<Vec<String>>,
    pub category: Option<String>,
    pub license: Option<String>,
    pub visibility: Option<String>,
    pub status: Option<String>,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/marketplace/resources",
            get(list_resources).post(create_resource),
        )
        .route(
            "/marketplace/resources/{id}",
            get(get_resource)
                .patch(patch_resource)
                .delete(delete_resource),
        )
        .route(
            "/marketplace/resources/{id}/versions",
            get(list_versions),
        )
        .route(
            "/marketplace/resources/{id}/versions/{version}",
            get(get_version),
        )
        .route("/marketplace/resources/{id}/like", post(like_resource))
        .route("/marketplace/resources/{id}/dislike", post(dislike_resource))
        .route("/marketplace/resources/{id}/favorite", post(favorite_resource))
}

fn service(state: &AppState) -> MarketplaceService {
    MarketplaceService::new(state.db.clone())
}

fn social_service(state: &AppState) -> ResourceSocialService {
    ResourceSocialService::new(state.db.clone())
}

async fn list_resources(
    State(state): State<AppState>,
    Query(params): Query<ResourceListParams>,
) -> Result<Json<ApiResponse<Vec<MarketplaceResourceItem>>>, ApiError> {
    let resource_type = params
        .resource_type
        .as_deref()
        .map(ResourceType::parse)
        .transpose()
        .map_err(|error| ApiError::validation(error.to_string()))?;
    let visibility = params
        .visibility
        .as_deref()
        .map(ResourceVisibility::parse)
        .transpose()
        .map_err(|error| ApiError::validation(error.to_string()))?;
    let status = params
        .status
        .as_deref()
        .map(ResourceStatus::parse)
        .transpose()
        .map_err(|error| ApiError::validation(error.to_string()))?;
    let tags = params.tags.as_deref().map(parse_tags);
    let has_query = params.q.as_ref().is_some_and(|value| !value.trim().is_empty());
    let sort = parse_sort(params.sort.as_deref(), has_query)?;

    let items = service(&state)
        .list_resources(&MarketplaceListQuery {
            resource_type,
            category: params.category,
            tags,
            q: params.q,
            sort,
            visibility,
            status,
            limit: params.limit.unwrap_or(20).clamp(1, 100),
            offset: params.offset.unwrap_or(0).max(0),
        })
        .await?;

    Ok(Json(ApiResponse::ok(items)))
}

async fn get_resource(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<MarketplaceResourceDetail>>, ApiError> {
    let detail = service(&state).get_resource(&id).await?;
    Ok(Json(ApiResponse::ok(detail)))
}

async fn list_versions(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<Vec<MarketplaceVersionSummary>>>, ApiError> {
    let versions = service(&state).list_versions(&id).await?;
    Ok(Json(ApiResponse::ok(versions)))
}

async fn get_version(
    State(state): State<AppState>,
    Path((id, version)): Path<(String, String)>,
) -> Result<Json<ApiResponse<MarketplaceVersionDetail>>, ApiError> {
    let detail = service(&state).get_version(&id, &version).await?;
    Ok(Json(ApiResponse::ok(detail)))
}

async fn create_resource(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Json(body): Json<CreateResourceRequest>,
) -> Result<Json<ApiResponse<MarketplaceResourceItem>>, ApiError> {
    require_permission(&user, UserPermission::CreateResource)?;
    let resource_type = ResourceType::parse(&body.resource_type)
        .map_err(|error| ApiError::validation(error.to_string()))?;
    let visibility = body
        .visibility
        .as_deref()
        .map(ResourceVisibility::parse)
        .transpose()
        .map_err(|error| ApiError::validation(error.to_string()))?;

    let item = service(&state)
        .create_draft(
            &user,
            CreateMarketplaceDraftInput {
                title: body.title,
                description: body.description,
                resource_type,
                tags: body.tags,
                category: body.category,
                license: body.license,
                visibility,
            },
        )
        .await?;

    Ok(Json(ApiResponse::ok(item)))
}

async fn patch_resource(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    Json(body): Json<PatchResourceRequest>,
) -> Result<Json<ApiResponse<MarketplaceResourceItem>>, ApiError> {
    let visibility = body
        .visibility
        .as_deref()
        .map(ResourceVisibility::parse)
        .transpose()
        .map_err(|error| ApiError::validation(error.to_string()))?;
    let status = body
        .status
        .as_deref()
        .map(ResourceStatus::parse)
        .transpose()
        .map_err(|error| ApiError::validation(error.to_string()))?;

    let item = service(&state)
        .update_resource(
            &user,
            &id,
            UpdateMarketplaceResourceInput {
                title: body.title,
                description: body.description,
                tags: body.tags,
                category: body.category,
                license: body.license,
                visibility,
                status,
            },
        )
        .await?;

    Ok(Json(ApiResponse::ok(item)))
}

async fn delete_resource(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<serde_json::Value>>, ApiError> {
    service(&state).delete_resource(&user, &id).await?;
    Ok(Json(ApiResponse::ok(serde_json::json!({ "deleted": true }))))
}

async fn like_resource(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<crate::services::ResourceInteractionResult>>, ApiError> {
    let result = social_service(&state).like_resource(&user, &id).await?;
    Ok(Json(ApiResponse::ok(result)))
}

async fn dislike_resource(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<crate::services::ResourceInteractionResult>>, ApiError> {
    let result = social_service(&state).dislike_resource(&user, &id).await?;
    Ok(Json(ApiResponse::ok(result)))
}

async fn favorite_resource(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<crate::services::ResourceInteractionResult>>, ApiError> {
    let result = social_service(&state).favorite_resource(&user, &id).await?;
    Ok(Json(ApiResponse::ok(result)))
}

fn parse_tags(raw: &str) -> Vec<String> {
    raw.split(',')
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .collect()
}

fn parse_sort(sort: Option<&str>, has_query: bool) -> Result<SearchSort, ApiError> {
    match sort {
        None => Ok(if has_query {
            SearchSort::Relevance
        } else {
            SearchSort::Newest
        }),
        Some("newest") => Ok(SearchSort::Newest),
        Some("rating") => Ok(SearchSort::Rating),
        Some("downloads") => Ok(SearchSort::Downloads),
        Some("installs") => Ok(SearchSort::Installs),
        Some("relevance") => Ok(SearchSort::Relevance),
        Some(other) => Err(ApiError::validation(format!("invalid sort: {other}"))),
    }
}
