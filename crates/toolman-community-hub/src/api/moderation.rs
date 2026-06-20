use axum::extract::{Path, Query, State};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Deserialize;

use crate::api::auth::AuthUser;
use crate::api::error::ApiError;
use crate::api::response::ApiResponse;
use crate::domain::{ReportReason, ReportStatus, ReportTargetType};
use crate::services::moderation_service::{
    BanDeviceRequest, BanUserRequest, CreateReportRequest, ModerationLogItem, ModerationLogListQuery,
    ModerationScanResult, ModerationService, ReportItem, ReportListQuery, ResolveReportRequest,
    ResourceModerationItem, SuspendResourceRequest,
};
use crate::state::AppState;

#[derive(Debug, Deserialize)]
pub struct CreateReportBody {
    pub target_type: String,
    pub target_id: String,
    pub reason: String,
    pub description: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ReportListParams {
    pub status: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct ResolveReportBody {
    pub action: String,
    pub note: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SuspendResourceBody {
    pub reason: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct BanUserBody {
    pub duration_hours: Option<i64>,
    pub reason: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct BanDeviceBody {
    pub user_id: String,
    pub device_name: String,
    pub duration_hours: Option<i64>,
    pub reason: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ApproveResourceBody {
    pub note: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ModerationLogListParams {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/moderation/reports", get(list_reports).post(create_report))
        .route("/moderation/reports/{id}/resolve", post(resolve_report))
        .route("/moderation/resources/{id}/suspend", post(suspend_resource))
        .route("/moderation/resources/{id}/approve", post(approve_resource))
        .route("/moderation/users/{id}/ban", post(ban_user))
        .route("/moderation/users/{id}/unban", post(unban_user))
        .route("/moderation/devices/{id}/ban", post(ban_device))
        .route("/moderation/devices/{id}/unban", post(unban_device))
        .route("/moderation/scan", get(scan_online_content))
        .route("/moderation/logs", get(list_logs))
}

fn service(state: &AppState) -> ModerationService {
    ModerationService::new(state.db.clone())
}

async fn create_report(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Json(body): Json<CreateReportBody>,
) -> Result<Json<ApiResponse<ReportItem>>, ApiError> {
    let target_type = ReportTargetType::parse(&body.target_type)
        .map_err(|error| ApiError::validation(error.to_string()))?;
    let reason = ReportReason::parse(&body.reason)
        .map_err(|error| ApiError::validation(error.to_string()))?;

    let item = service(&state)
        .create_report(
            &user,
            CreateReportRequest {
                target_type,
                target_id: body.target_id,
                reason,
                description: body.description,
            },
        )
        .await?;

    Ok(Json(ApiResponse::ok(item)))
}

async fn list_reports(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Query(params): Query<ReportListParams>,
) -> Result<Json<ApiResponse<Vec<ReportItem>>>, ApiError> {
    let status = params
        .status
        .as_deref()
        .map(ReportStatus::parse)
        .transpose()
        .map_err(|error| ApiError::validation(error.to_string()))?;

    let items = service(&state)
        .list_reports(
            &user,
            &ReportListQuery {
                status,
                limit: params.limit.unwrap_or(20).clamp(1, 100),
                offset: params.offset.unwrap_or(0).max(0),
            },
        )
        .await?;

    Ok(Json(ApiResponse::ok(items)))
}

async fn resolve_report(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    Json(body): Json<ResolveReportBody>,
) -> Result<Json<ApiResponse<ReportItem>>, ApiError> {
    let item = service(&state)
        .resolve_report(
            &user,
            &id,
            ResolveReportRequest {
                action: body.action,
                note: body.note,
            },
        )
        .await?;

    Ok(Json(ApiResponse::ok(item)))
}

async fn suspend_resource(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    Json(body): Json<SuspendResourceBody>,
) -> Result<Json<ApiResponse<ResourceModerationItem>>, ApiError> {
    let item = service(&state)
        .suspend_resource(
            &user,
            &id,
            SuspendResourceRequest {
                reason: body.reason,
            },
        )
        .await?;

    Ok(Json(ApiResponse::ok(item)))
}

async fn approve_resource(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    Json(body): Json<ApproveResourceBody>,
) -> Result<Json<ApiResponse<ResourceModerationItem>>, ApiError> {
    let item = service(&state)
        .approve_resource(&user, &id, body.note)
        .await?;

    Ok(Json(ApiResponse::ok(item)))
}

async fn ban_user(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    Json(body): Json<BanUserBody>,
) -> Result<Json<ApiResponse<serde_json::Value>>, ApiError> {
    service(&state)
        .ban_user(
            &user,
            &id,
            BanUserRequest {
                duration_hours: body.duration_hours,
                reason: body.reason,
            },
        )
        .await?;

    Ok(Json(ApiResponse::ok(serde_json::json!({ "ok": true }))))
}

async fn unban_user(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<serde_json::Value>>, ApiError> {
    service(&state).unban_user(&user, &id).await?;
    Ok(Json(ApiResponse::ok(serde_json::json!({ "ok": true }))))
}

async fn ban_device(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    Json(body): Json<BanDeviceBody>,
) -> Result<Json<ApiResponse<serde_json::Value>>, ApiError> {
    service(&state)
        .ban_device(
            &user,
            &id,
            BanDeviceRequest {
                user_id: body.user_id,
                device_name: body.device_name,
                duration_hours: body.duration_hours,
                reason: body.reason,
            },
        )
        .await?;

    Ok(Json(ApiResponse::ok(serde_json::json!({ "ok": true }))))
}

async fn unban_device(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<serde_json::Value>>, ApiError> {
    service(&state).unban_device(&user, &id).await?;
    Ok(Json(ApiResponse::ok(serde_json::json!({ "ok": true }))))
}

async fn list_logs(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Query(params): Query<ModerationLogListParams>,
) -> Result<Json<ApiResponse<Vec<ModerationLogItem>>>, ApiError> {
    let items = service(&state)
        .list_logs(
            &user,
            &ModerationLogListQuery {
                limit: params.limit.unwrap_or(50).clamp(1, 200),
                offset: params.offset.unwrap_or(0).max(0),
            },
        )
        .await?;

    Ok(Json(ApiResponse::ok(items)))
}

async fn scan_online_content(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> Result<Json<ApiResponse<ModerationScanResult>>, ApiError> {
    let result = service(&state).scan_online_content(&user).await?;
    Ok(Json(ApiResponse::ok(result)))
}
