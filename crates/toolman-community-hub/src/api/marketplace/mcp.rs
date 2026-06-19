use axum::extract::{Multipart, Path, Query, State};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Deserialize;

use crate::api::auth::{require_permission, AuthUser};
use crate::api::error::ApiError;
use crate::api::response::ApiResponse;
use crate::domain::{ResourceStatus, UserPermission};
use crate::services::mcp_market_service::{
    CreateMcpDraftInput, McpListQuery, McpManifestResponse, McpMarketListItem, McpMarketService,
    PublishMcpPackageInput,
};
use crate::state::AppState;

#[derive(Debug, Deserialize)]
pub struct CreateMcpDraftRequest {
    pub title: String,
    pub description: Option<String>,
    pub tags: Option<Vec<String>>,
    pub category: Option<String>,
    pub license: Option<String>,
    pub visibility: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct McpListParams {
    pub category: Option<String>,
    pub status: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/marketplace/mcp", get(list_mcps).post(create_draft))
        .route(
            "/marketplace/mcp/{id}",
            get(get_mcp).delete(unpublish_mcp),
        )
        .route("/marketplace/mcp/{id}/publish", post(publish_mcp))
        .route("/marketplace/mcp/{id}/manifest", get(get_manifest))
        .route("/marketplace/mcp/{id}/templates", get(get_templates))
}

fn service(state: &AppState) -> McpMarketService {
    McpMarketService::new(state.config.clone(), state.db.clone())
}

async fn list_mcps(
    State(state): State<AppState>,
    Query(params): Query<McpListParams>,
) -> Result<Json<ApiResponse<Vec<McpMarketListItem>>>, ApiError> {
    let status = params
        .status
        .as_deref()
        .map(ResourceStatus::parse)
        .transpose()
        .map_err(|error| ApiError::validation(error.to_string()))?;

    let items = service(&state)
        .list_mcps(&McpListQuery {
            category: params.category,
            status,
            limit: params.limit,
            offset: params.offset,
        })
        .await?;

    Ok(Json(ApiResponse::ok(items)))
}

async fn get_mcp(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<McpMarketListItem>>, ApiError> {
    let item = service(&state).get_mcp(&id).await?;
    Ok(Json(ApiResponse::ok(item)))
}

async fn get_manifest(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<McpManifestResponse>>, ApiError> {
    let manifest = service(&state).get_manifest(&id).await?;
    Ok(Json(ApiResponse::ok(manifest)))
}

async fn get_templates(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<Vec<serde_json::Value>>>, ApiError> {
    let templates = service(&state).get_templates(&id).await?;
    Ok(Json(ApiResponse::ok(templates)))
}

async fn create_draft(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Json(body): Json<CreateMcpDraftRequest>,
) -> Result<Json<ApiResponse<McpMarketListItem>>, ApiError> {
    require_permission(&user, UserPermission::CreateResource)?;
    let visibility = body
        .visibility
        .as_deref()
        .map(crate::domain::ResourceVisibility::parse)
        .transpose()
        .map_err(|error| ApiError::validation(error.to_string()))?;

    let resource = service(&state)
        .create_draft(
            &user,
            CreateMcpDraftInput {
                title: body.title,
                description: body.description,
                tags: body.tags,
                category: body.category,
                license: body.license,
                visibility,
            },
        )
        .await?;

    let item = service(&state).get_mcp(&resource.id).await?;
    Ok(Json(ApiResponse::ok(item)))
}

async fn publish_mcp(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    mut multipart: Multipart,
) -> Result<Json<ApiResponse<McpMarketListItem>>, ApiError> {
    require_permission(&user, UserPermission::Publish)?;
    let mut version = None;
    let mut changelog = None;
    let mut package_bytes = None;
    let mut filename = None;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|error| ApiError::validation(error.to_string()))?
    {
        match field.name() {
            Some("version") => {
                version = Some(
                    field
                        .text()
                        .await
                        .map_err(|error| ApiError::validation(error.to_string()))?,
                );
            }
            Some("changelog") => {
                changelog = Some(
                    field
                        .text()
                        .await
                        .map_err(|error| ApiError::validation(error.to_string()))?,
                );
            }
            Some("package") => {
                filename = field.file_name().map(str::to_string);
                package_bytes = Some(
                    field
                        .bytes()
                        .await
                        .map_err(|error| ApiError::validation(error.to_string()))?
                        .to_vec(),
                );
            }
            _ => {}
        }
    }

    let version = version.ok_or_else(|| ApiError::validation("version is required"))?;
    let package_bytes =
        package_bytes.ok_or_else(|| ApiError::validation("package file is required"))?;

    let resource = service(&state)
        .publish_package(
            &user,
            PublishMcpPackageInput {
                resource_id: id.clone(),
                version,
                changelog,
                package_bytes,
                original_filename: filename,
            },
        )
        .await?;

    let item = service(&state).get_mcp(&resource.id).await?;
    Ok(Json(ApiResponse::ok(item)))
}

async fn unpublish_mcp(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<serde_json::Value>>, ApiError> {
    require_permission(&user, UserPermission::Publish)?;

    let removed = service(&state).unpublish(&user, &id).await?;
    Ok(Json(ApiResponse::ok(serde_json::json!({ "removed": removed }))))
}
