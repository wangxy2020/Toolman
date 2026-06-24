use axum::extract::{Multipart, Path, Query, State};
use axum::http::HeaderMap;
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Deserialize;
use std::sync::Arc;

use crate::api::auth::{load_optional_viewer, require_permission, AuthUser};
use crate::api::error::ApiError;
use crate::api::response::ApiResponse;
use crate::domain::{
    CommunityTaskApplication, CommunityTaskDelivery, TaskStatus, TaskType, UserPermission,
};
use crate::services::task_market_service::{
    ApplyTaskRequest, CreateTaskRequest, DeliverTaskRequest, RejectDeliveryRequest,
    TaskListQuery, TaskMarketItem, TaskMarketService, UpdateTaskRequest,
};
use crate::services::task_review_service::{
    CreateTaskReviewRequest, TaskReviewItem, TaskReviewService,
};
use crate::state::AppState;

#[derive(Debug, Deserialize)]
pub struct CreateTaskBody {
    pub title: String,
    pub description: Option<String>,
    pub task_type: String,
    pub budget_amount: Option<f64>,
    pub budget_currency: Option<String>,
    pub deadline_at: Option<i64>,
    pub tags: Option<Vec<String>>,
    pub resource_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct PatchTaskBody {
    pub title: Option<String>,
    pub description: Option<String>,
    pub task_type: Option<String>,
    pub budget_amount: Option<f64>,
    pub budget_currency: Option<String>,
    pub deadline_at: Option<i64>,
    pub tags: Option<Vec<String>>,
    pub resource_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct TaskListParams {
    pub task_type: Option<String>,
    pub status: Option<String>,
    pub publisher_id: Option<String>,
    pub q: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct ApplyTaskBody {
    pub proposal: String,
    pub quoted_amount: f64,
}

#[derive(Debug, Deserialize)]
pub struct RejectDeliveryBody {
    pub reason: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateTaskReviewBody {
    pub rating: i64,
    pub body: String,
    pub reviewee_id: String,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/tasks", get(list_tasks).post(create_task))
        .route(
            "/tasks/{id}",
            get(get_task).patch(patch_task),
        )
        .route("/tasks/{id}/publish", post(publish_task))
        .route("/tasks/{id}/cancel", post(cancel_task))
        .route("/tasks/{id}/apply", post(apply_task))
        .route("/tasks/{id}/applications", get(list_applications))
        .route(
            "/tasks/{id}/applications/{app_id}/accept",
            post(accept_application),
        )
        .route("/tasks/{id}/deliver", post(deliver_task))
        .route("/tasks/{id}/accept-delivery", post(accept_delivery))
        .route("/tasks/{id}/reject-delivery", post(reject_delivery))
        .route("/tasks/{id}/reviews", get(list_task_reviews).post(create_task_review))
}

fn service(state: &AppState) -> TaskMarketService {
    TaskMarketService::new(Arc::clone(&state.config), state.db.clone())
}

fn review_service(state: &AppState) -> TaskReviewService {
    TaskReviewService::new(state.db.clone())
}

async fn list_tasks(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(params): Query<TaskListParams>,
) -> Result<Json<ApiResponse<Vec<TaskMarketItem>>>, ApiError> {
    let task_type = params
        .task_type
        .as_deref()
        .map(TaskType::parse)
        .transpose()
        .map_err(|error| ApiError::validation(error.to_string()))?;
    let status = params
        .status
        .as_deref()
        .map(TaskStatus::parse)
        .transpose()
        .map_err(|error| ApiError::validation(error.to_string()))?;
    let publisher_id = params.publisher_id.clone();
    if let Some(requested_publisher_id) = &publisher_id {
        let viewer = load_optional_viewer(&state, &headers).await?;
        let viewer = viewer.as_ref().ok_or_else(|| ApiError::unauthorized("unauthorized"))?;
        if !viewer.is_moderator() && viewer.id != *requested_publisher_id {
            return Err(ApiError::forbidden("forbidden"));
        }
    }

    let items = service(&state)
        .list_tasks(&TaskListQuery {
            task_type,
            status,
            publisher_id,
            q: params.q,
            limit: params.limit.unwrap_or(20).clamp(1, 100),
            offset: params.offset.unwrap_or(0).max(0),
        })
        .await?;

    Ok(Json(ApiResponse::ok(items)))
}

async fn get_task(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<TaskMarketItem>>, ApiError> {
    let item = service(&state).get_task(&id).await?;
    Ok(Json(ApiResponse::ok(item)))
}

async fn create_task(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Json(body): Json<CreateTaskBody>,
) -> Result<Json<ApiResponse<TaskMarketItem>>, ApiError> {
    require_permission(&user, UserPermission::Publish)?;
    let task_type = TaskType::parse(&body.task_type)
        .map_err(|error| ApiError::validation(error.to_string()))?;

    let item = service(&state)
        .create_task(
            &user,
            CreateTaskRequest {
                title: body.title,
                description: body.description,
                task_type,
                budget_amount: body.budget_amount,
                budget_currency: body.budget_currency,
                deadline_at: body.deadline_at,
                tags: body.tags,
                resource_id: body.resource_id,
            },
        )
        .await?;

    Ok(Json(ApiResponse::ok(item)))
}

async fn patch_task(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    Json(body): Json<PatchTaskBody>,
) -> Result<Json<ApiResponse<TaskMarketItem>>, ApiError> {
    let task_type = body
        .task_type
        .as_deref()
        .map(TaskType::parse)
        .transpose()
        .map_err(|error| ApiError::validation(error.to_string()))?;

    let item = service(&state)
        .update_task(
            &user,
            &id,
            UpdateTaskRequest {
                title: body.title,
                description: body.description,
                task_type,
                budget_amount: body.budget_amount,
                budget_currency: body.budget_currency,
                deadline_at: body.deadline_at.map(Some),
                tags: body.tags,
                resource_id: body.resource_id.map(Some),
            },
        )
        .await?;

    Ok(Json(ApiResponse::ok(item)))
}

async fn publish_task(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<TaskMarketItem>>, ApiError> {
    let item = service(&state).publish_task(&user, &id).await?;
    Ok(Json(ApiResponse::ok(item)))
}

async fn cancel_task(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<TaskMarketItem>>, ApiError> {
    let item = service(&state).cancel_task(&user, &id).await?;
    Ok(Json(ApiResponse::ok(item)))
}

async fn apply_task(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    Json(body): Json<ApplyTaskBody>,
) -> Result<Json<ApiResponse<CommunityTaskApplication>>, ApiError> {
    require_permission(&user, UserPermission::AcceptTask)?;
    let application = service(&state)
        .apply_task(
            &user,
            &id,
            ApplyTaskRequest {
                proposal: body.proposal,
                quoted_amount: body.quoted_amount,
            },
        )
        .await?;
    Ok(Json(ApiResponse::ok(application)))
}

async fn list_applications(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<Vec<CommunityTaskApplication>>>, ApiError> {
    let applications = service(&state).list_applications(&user, &id).await?;
    Ok(Json(ApiResponse::ok(applications)))
}

async fn accept_application(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path((id, app_id)): Path<(String, String)>,
) -> Result<Json<ApiResponse<TaskMarketItem>>, ApiError> {
    let item = service(&state)
        .accept_application(&user, &id, &app_id)
        .await?;
    Ok(Json(ApiResponse::ok(item)))
}

async fn deliver_task(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    mut multipart: Multipart,
) -> Result<Json<ApiResponse<CommunityTaskDelivery>>, ApiError> {
    let mut notes = None;
    let mut package_bytes = None;
    let mut filename = None;

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|error| ApiError::validation(error.to_string()))?
    {
        match field.name() {
            Some("notes") => {
                notes = Some(
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

    let package_bytes =
        package_bytes.ok_or_else(|| ApiError::validation("package file is required"))?;

    let delivery = service(&state)
        .deliver_task(
            &user,
            &id,
            DeliverTaskRequest {
                package_bytes,
                original_filename: filename,
                notes,
            },
        )
        .await?;

    Ok(Json(ApiResponse::ok(delivery)))
}

async fn accept_delivery(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<TaskMarketItem>>, ApiError> {
    let item = service(&state).accept_delivery(&user, &id).await?;
    Ok(Json(ApiResponse::ok(item)))
}

async fn reject_delivery(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    Json(body): Json<RejectDeliveryBody>,
) -> Result<Json<ApiResponse<TaskMarketItem>>, ApiError> {
    let item = service(&state)
        .reject_delivery(
            &user,
            &id,
            RejectDeliveryRequest {
                reason: body.reason,
            },
        )
        .await?;
    Ok(Json(ApiResponse::ok(item)))
}

async fn create_task_review(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    Json(body): Json<CreateTaskReviewBody>,
) -> Result<Json<ApiResponse<TaskReviewItem>>, ApiError> {
    let item = review_service(&state)
        .create_review(
            &user,
            &id,
            CreateTaskReviewRequest {
                rating: body.rating,
                body: body.body,
                reviewee_id: body.reviewee_id,
            },
        )
        .await?;
    Ok(Json(ApiResponse::ok(item)))
}

async fn list_task_reviews(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<Vec<TaskReviewItem>>>, ApiError> {
    let items = review_service(&state).list_reviews(&id).await?;
    Ok(Json(ApiResponse::ok(items)))
}
