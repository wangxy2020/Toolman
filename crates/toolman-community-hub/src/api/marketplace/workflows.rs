use axum::extract::{Multipart, Path, Query, State};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Deserialize;
use serde_json::Value;

use crate::api::auth::{require_permission, AuthUser};
use crate::api::error::ApiError;
use crate::api::response::ApiResponse;
use crate::domain::{ResourceStatus, UserPermission};
use crate::services::workflow_market_service::{
    CreateWorkflowDraftInput, PublishWorkflowPackageInput, WorkflowListQuery,
    WorkflowManifestResponse, WorkflowMarketListItem, WorkflowMarketService,
};
use crate::state::AppState;

#[derive(Debug, Deserialize)]
pub struct CreateWorkflowDraftRequest {
    pub title: String,
    pub description: Option<String>,
    pub tags: Option<Vec<String>>,
    pub category: Option<String>,
    pub license: Option<String>,
    pub visibility: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct WorkflowListParams {
    pub category: Option<String>,
    pub status: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/marketplace/workflows", get(list_workflows).post(create_draft))
        .route(
            "/marketplace/workflows/{id}",
            get(get_workflow).delete(unpublish_workflow),
        )
        .route("/marketplace/workflows/{id}/publish", post(publish_workflow))
        .route("/marketplace/workflows/{id}/manifest", get(get_manifest))
        .route("/marketplace/workflows/{id}/graph", get(get_graph))
}

fn service(state: &AppState) -> WorkflowMarketService {
    WorkflowMarketService::new(state.config.clone(), state.db.clone())
}

async fn list_workflows(
    State(state): State<AppState>,
    Query(params): Query<WorkflowListParams>,
) -> Result<Json<ApiResponse<Vec<WorkflowMarketListItem>>>, ApiError> {
    let status = params
        .status
        .as_deref()
        .map(ResourceStatus::parse)
        .transpose()
        .map_err(|error| ApiError::validation(error.to_string()))?;

    let items = service(&state)
        .list_workflows(&WorkflowListQuery {
            category: params.category,
            status,
            limit: params.limit,
            offset: params.offset,
        })
        .await?;

    Ok(Json(ApiResponse::ok(items)))
}

async fn get_workflow(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<WorkflowMarketListItem>>, ApiError> {
    let item = service(&state).get_workflow(&id).await?;
    Ok(Json(ApiResponse::ok(item)))
}

async fn get_manifest(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<WorkflowManifestResponse>>, ApiError> {
    let manifest = service(&state).get_manifest(&id).await?;
    Ok(Json(ApiResponse::ok(manifest)))
}

async fn get_graph(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<Value>>, ApiError> {
    let graph = service(&state).get_graph(&id).await?;
    Ok(Json(ApiResponse::ok(graph)))
}

async fn create_draft(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Json(body): Json<CreateWorkflowDraftRequest>,
) -> Result<Json<ApiResponse<WorkflowMarketListItem>>, ApiError> {
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
            CreateWorkflowDraftInput {
                title: body.title,
                description: body.description,
                tags: body.tags,
                category: body.category,
                license: body.license,
                visibility,
            },
        )
        .await?;

    let item = service(&state).get_workflow(&resource.id).await?;
    Ok(Json(ApiResponse::ok(item)))
}

async fn publish_workflow(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    mut multipart: Multipart,
) -> Result<Json<ApiResponse<WorkflowMarketListItem>>, ApiError> {
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
            PublishWorkflowPackageInput {
                resource_id: id.clone(),
                version,
                changelog,
                package_bytes,
                original_filename: filename,
            },
        )
        .await?;

    let item = service(&state).get_workflow(&resource.id).await?;
    Ok(Json(ApiResponse::ok(item)))
}

async fn unpublish_workflow(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<serde_json::Value>>, ApiError> {
    require_permission(&user, UserPermission::Publish)?;

    let removed = service(&state).unpublish(&user, &id).await?;
    Ok(Json(ApiResponse::ok(serde_json::json!({ "removed": removed }))))
}
