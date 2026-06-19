use axum::extract::{Path, Query, State};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Deserialize;
use std::sync::Arc;

use crate::api::auth::AuthUser;
use crate::api::error::ApiError;
use crate::api::response::ApiResponse;
use crate::domain::{InstallStatus, ResourceType};
use crate::services::install_service::{
    CompleteInstallRequest, InstallHistoryQuery, InstallItem, InstallService, StartInstallRequest,
    StartInstallResponse,
};
use crate::state::AppState;

#[derive(Debug, Deserialize)]
pub struct StartInstallBody {
    pub version: Option<String>,
    pub workspace_id: Option<String>,
    pub options: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
pub struct CompleteInstallBody {
    pub status: String,
    pub local_ref: Option<String>,
    pub error_message: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct InstallHistoryParams {
    pub resource_type: Option<String>,
    pub workspace_id: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/install/history", get(list_install_history))
        .route(
            "/install/{resource_type}/{resource_id}",
            post(start_install),
        )
        .route("/install/{install_id}/complete", post(complete_install))
        .route("/install/{install_id}/rollback", post(rollback_install))
}

fn service(state: &AppState) -> InstallService {
    InstallService::new(Arc::clone(&state.config), state.db.clone())
}

async fn start_install(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path((resource_type, resource_id)): Path<(String, String)>,
    Json(body): Json<StartInstallBody>,
) -> Result<Json<ApiResponse<StartInstallResponse>>, ApiError> {
    let resource_type = ResourceType::parse(&resource_type)
        .map_err(|error| ApiError::validation(error.to_string()))?;

    let response = service(&state)
        .start_install(
            &user,
            resource_type,
            &resource_id,
            StartInstallRequest {
                version: body.version,
                workspace_id: body.workspace_id,
                options: body.options,
            },
        )
        .await?;

    Ok(Json(ApiResponse::ok(response)))
}

async fn complete_install(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(install_id): Path<String>,
    Json(body): Json<CompleteInstallBody>,
) -> Result<Json<ApiResponse<InstallItem>>, ApiError> {
    let status = InstallStatus::parse(&body.status)
        .map_err(|error| ApiError::validation(error.to_string()))?;

    let item = service(&state)
        .complete_install(
            &user,
            &install_id,
            CompleteInstallRequest {
                status,
                local_ref: body.local_ref,
                error_message: body.error_message,
            },
        )
        .await?;

    Ok(Json(ApiResponse::ok(item)))
}

async fn rollback_install(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(install_id): Path<String>,
) -> Result<Json<ApiResponse<InstallItem>>, ApiError> {
    let item = service(&state)
        .rollback_install(&user, &install_id)
        .await?;
    Ok(Json(ApiResponse::ok(item)))
}

async fn list_install_history(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Query(params): Query<InstallHistoryParams>,
) -> Result<Json<ApiResponse<Vec<InstallItem>>>, ApiError> {
    let resource_type = params
        .resource_type
        .as_deref()
        .map(ResourceType::parse)
        .transpose()
        .map_err(|error| ApiError::validation(error.to_string()))?;

    let items = service(&state)
        .list_history(
            &user,
            &InstallHistoryQuery {
                resource_type,
                workspace_id: params.workspace_id,
                limit: params.limit.unwrap_or(20).clamp(1, 100),
                offset: params.offset.unwrap_or(0).max(0),
            },
        )
        .await?;

    Ok(Json(ApiResponse::ok(items)))
}
