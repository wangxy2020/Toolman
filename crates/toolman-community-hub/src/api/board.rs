use axum::extract::{Path, Query, State};
use axum::http::HeaderMap;
use axum::routing::delete;
use axum::routing::get;
use axum::routing::patch;
use axum::routing::post;
use axum::{Json, Router};
use serde::Deserialize;

use crate::api::auth::{load_optional_viewer, AuthUser};
use crate::api::error::ApiError;
use crate::api::response::ApiResponse;
use crate::services::board_service::{
    BoardMessageItem, BoardService, CreateBoardMessageRequest, UpdateBoardMessageRequest,
};
use crate::state::AppState;

#[derive(Debug, Deserialize)]
pub struct BoardMessageListParams {
    pub user_id: Option<String>,
    pub parent_id: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct CreateBoardMessageBody {
    pub body: String,
    pub parent_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateBoardMessageBody {
    pub body: String,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/board/messages", get(list_messages).post(create_message))
        .route("/board/messages/{id}", patch(update_message).delete(delete_message))
        .route("/board/messages/{id}/like", post(like_message))
        .route("/board/messages/{id}/dislike", post(dislike_message))
        .route("/board/messages/{id}/favorite", post(favorite_message))
}

fn service(state: &AppState) -> BoardService {
    BoardService::new(state.db.clone())
}

async fn list_messages(
    State(state): State<AppState>,
    headers: HeaderMap,
    Query(params): Query<BoardMessageListParams>,
) -> Result<Json<ApiResponse<Vec<BoardMessageItem>>>, ApiError> {
    let viewer = load_optional_viewer(&state, &headers).await?;
    let parent_filter = if params.user_id.is_some() {
        None
    } else if params.parent_id.is_some() {
        Some(Some(params.parent_id.unwrap()))
    } else {
        Some(None)
    };

    let messages = service(&state)
        .list_messages(
            params.user_id,
            parent_filter,
            params.limit.unwrap_or(50).clamp(1, 100),
            params.offset.unwrap_or(0).max(0),
            viewer.as_ref(),
        )
        .await?;

    Ok(Json(ApiResponse::ok(messages)))
}

async fn create_message(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Json(body): Json<CreateBoardMessageBody>,
) -> Result<Json<ApiResponse<BoardMessageItem>>, ApiError> {
    let message = service(&state)
        .create_message(
            &user,
            CreateBoardMessageRequest {
                body: body.body,
                parent_id: body.parent_id,
            },
        )
        .await?;

    Ok(Json(ApiResponse::ok(message)))
}

async fn like_message(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<BoardMessageItem>>, ApiError> {
    let message = service(&state).like_message(&user, &id).await?;
    Ok(Json(ApiResponse::ok(message)))
}

async fn dislike_message(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<BoardMessageItem>>, ApiError> {
    let message = service(&state).dislike_message(&user, &id).await?;
    Ok(Json(ApiResponse::ok(message)))
}

async fn favorite_message(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<BoardMessageItem>>, ApiError> {
    let message = service(&state).favorite_message(&user, &id).await?;
    Ok(Json(ApiResponse::ok(message)))
}

async fn update_message(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    Json(body): Json<UpdateBoardMessageBody>,
) -> Result<Json<ApiResponse<BoardMessageItem>>, ApiError> {
    let message = service(&state)
        .update_message(
            &user,
            &id,
            UpdateBoardMessageRequest {
                body: body.body,
            },
        )
        .await?;

    Ok(Json(ApiResponse::ok(message)))
}

async fn delete_message(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<serde_json::Value>>, ApiError> {
    service(&state).delete_message(&user, &id).await?;
    Ok(Json(ApiResponse::ok(serde_json::json!({ "deleted": true }))))
}
