use axum::extract::{Multipart, Path, State};
use axum::routing::post;
use axum::{Json, Router};
use serde::Deserialize;

use crate::api::auth::{require_permission, AuthUser};
use crate::api::error::ApiError;
use crate::api::response::ApiResponse;
use crate::domain::{ResourceVisibility, UserPermission};
use crate::services::knowledge_market_service::{
    CreateKnowledgeDraftInput, KnowledgeMarketService, PublishKnowledgePackageInput,
};
use crate::state::AppState;

#[derive(Debug, Deserialize)]
pub struct CreateKnowledgeDraftRequest {
    pub title: String,
    pub description: Option<String>,
    pub tags: Option<Vec<String>>,
    pub category: Option<String>,
    pub license: Option<String>,
    pub visibility: Option<String>,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/marketplace/knowledge", post(create_draft))
        .route("/marketplace/knowledge/{id}/publish", post(publish_knowledge))
}

fn service(state: &AppState) -> KnowledgeMarketService {
    KnowledgeMarketService::new(state.config.clone(), state.db.clone())
}

async fn create_draft(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Json(body): Json<CreateKnowledgeDraftRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, ApiError> {
    require_permission(&user, UserPermission::CreateResource)?;
    let visibility = body
        .visibility
        .as_deref()
        .map(ResourceVisibility::parse)
        .transpose()
        .map_err(|error| ApiError::validation(error.to_string()))?;

    let resource = service(&state)
        .create_draft(
            &user,
            CreateKnowledgeDraftInput {
                title: body.title,
                description: body.description,
                tags: body.tags,
                category: body.category,
                license: body.license,
                visibility,
            },
        )
        .await?;

    Ok(Json(ApiResponse::ok(serde_json::json!({
        "id": resource.id,
        "resource_type": resource.resource_type.as_str(),
        "status": resource.status.as_str(),
    }))))
}

async fn publish_knowledge(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    mut multipart: Multipart,
) -> Result<Json<ApiResponse<serde_json::Value>>, ApiError> {
    require_permission(&user, UserPermission::Publish)?;

    let mut version = None;
    let mut changelog = None;
    let mut package_bytes = None;
    let mut original_filename = None;

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
                original_filename = field.file_name().map(str::to_string);
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

    let version = version.ok_or_else(|| ApiError::validation("version is required".to_string()))?;
    let package_bytes =
        package_bytes.ok_or_else(|| ApiError::validation("package is required".to_string()))?;

    let resource = service(&state)
        .publish_package(
            &user,
            PublishKnowledgePackageInput {
                resource_id: id,
                version,
                changelog,
                package_bytes,
                original_filename,
            },
        )
        .await?;

    Ok(Json(ApiResponse::ok(serde_json::json!({
        "id": resource.id,
        "version": resource.version,
        "status": resource.status.as_str(),
    }))))
}
