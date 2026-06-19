use axum::extract::{Path, Query, State};
use axum::routing::{delete, get};
use axum::{Json, Router};
use serde::Deserialize;

use crate::api::auth::AuthUser;
use crate::api::error::ApiError;
use crate::api::response::ApiResponse;
use crate::domain::InteractionTargetType;
use crate::services::comment_service::{
    CommentCountResult, CommentItem, CommentService, CreateCommentRequest, ListCommentsQuery,
};
use crate::state::AppState;

#[derive(Debug, Deserialize)]
pub struct CommentListParams {
    pub target_type: String,
    pub target_id: String,
    pub parent_id: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct CommentCountParams {
    pub target_type: String,
    pub target_id: String,
    pub parent_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateCommentBody {
    pub target_type: String,
    pub target_id: String,
    pub body: String,
    pub parent_id: Option<String>,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/comments", get(list_comments).post(create_comment))
        .route("/comments/count", get(count_comments))
        .route("/comments/{id}", delete(delete_comment))
}

fn service(state: &AppState) -> CommentService {
    CommentService::new(state.db.clone())
}

fn parse_target_type(value: &str) -> Result<InteractionTargetType, ApiError> {
    InteractionTargetType::parse(value).map_err(|error| ApiError::validation(error.to_string()))
}

async fn list_comments(
    State(state): State<AppState>,
    Query(params): Query<CommentListParams>,
) -> Result<Json<ApiResponse<Vec<CommentItem>>>, ApiError> {
    let target_type = parse_target_type(&params.target_type)?;
    let items = service(&state)
        .list_comments(ListCommentsQuery {
            target_type,
            target_id: params.target_id,
            parent_id: params.parent_id,
            limit: params.limit.unwrap_or(50).clamp(1, 100),
            offset: params.offset.unwrap_or(0).max(0),
        })
        .await
        .map_err(map_error)?;

    Ok(Json(ApiResponse::ok(items)))
}

async fn create_comment(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Json(body): Json<CreateCommentBody>,
) -> Result<Json<ApiResponse<CommentItem>>, ApiError> {
    user.ensure_active().map_err(ApiError::from)?;
    let target_type = parse_target_type(&body.target_type)?;
    let item = service(&state)
        .create_comment(
            &user,
            CreateCommentRequest {
                target_type,
                target_id: body.target_id,
                body: body.body,
                parent_id: body.parent_id,
            },
        )
        .await
        .map_err(map_error)?;

    Ok(Json(ApiResponse::ok(item)))
}

async fn delete_comment(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<serde_json::Value>>, ApiError> {
    user.ensure_active().map_err(ApiError::from)?;
    service(&state)
        .delete_comment(&user, &id)
        .await
        .map_err(map_error)?;

    Ok(Json(ApiResponse::ok(serde_json::json!({ "deleted": true }))))
}

async fn count_comments(
    State(state): State<AppState>,
    Query(params): Query<CommentCountParams>,
) -> Result<Json<ApiResponse<CommentCountResult>>, ApiError> {
    let target_type = parse_target_type(&params.target_type)?;
    let count = service(&state)
        .count_comments(
            target_type,
            &params.target_id,
            params.parent_id.as_deref(),
        )
        .await
        .map_err(map_error)?;

    Ok(Json(ApiResponse::ok(CommentCountResult {
        target_type: params.target_type,
        target_id: params.target_id,
        count,
    })))
}

fn map_error(error: crate::services::comment_service::CommentServiceError) -> ApiError {
    match error {
        crate::services::comment_service::CommentServiceError::Forbidden => {
            ApiError::forbidden("forbidden")
        }
        crate::services::comment_service::CommentServiceError::NotFound(value) => {
            ApiError::not_found(value)
        }
        crate::services::comment_service::CommentServiceError::Validation(value) => {
            ApiError::validation(value)
        }
        other => ApiError::internal(other.to_string()),
    }
}
