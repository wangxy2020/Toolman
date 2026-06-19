use axum::extract::{Path, Query, State};
use axum::routing::{get, patch};
use axum::{Json, Router};
use serde::Deserialize;

use crate::api::auth::AuthUser;
use crate::api::error::ApiError;
use crate::api::response::ApiResponse;
use crate::services::review_service::{
    CreateReviewRequest, ReviewItem, ReviewListQuery, ReviewService, UpdateReviewRequest,
};
use crate::state::AppState;

#[derive(Debug, Deserialize)]
pub struct CreateReviewBody {
    pub resource_id: String,
    pub rating: i64,
    pub title: Option<String>,
    pub body: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ReviewListParams {
    pub resource_id: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct PatchReviewBody {
    pub rating: Option<i64>,
    pub title: Option<String>,
    pub body: Option<String>,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/reviews", get(list_reviews).post(create_review))
        .route(
            "/reviews/{id}",
            patch(update_review).delete(delete_review),
        )
}

fn service(state: &AppState) -> ReviewService {
    ReviewService::new(state.db.clone())
}

async fn create_review(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Json(body): Json<CreateReviewBody>,
) -> Result<Json<ApiResponse<ReviewItem>>, ApiError> {
    let item = service(&state)
        .create_review(
            &user,
            CreateReviewRequest {
                resource_id: body.resource_id,
                rating: body.rating,
                title: body.title,
                body: body.body,
            },
        )
        .await?;

    Ok(Json(ApiResponse::ok(item)))
}

async fn list_reviews(
    State(state): State<AppState>,
    Query(params): Query<ReviewListParams>,
) -> Result<Json<ApiResponse<Vec<ReviewItem>>>, ApiError> {
    let items = service(&state)
        .list_reviews(&ReviewListQuery {
            resource_id: params.resource_id,
            limit: params.limit.unwrap_or(20).clamp(1, 100),
            offset: params.offset.unwrap_or(0).max(0),
        })
        .await?;

    Ok(Json(ApiResponse::ok(items)))
}

async fn update_review(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    Json(body): Json<PatchReviewBody>,
) -> Result<Json<ApiResponse<ReviewItem>>, ApiError> {
    let item = service(&state)
        .update_review(
            &user,
            &id,
            UpdateReviewRequest {
                rating: body.rating,
                title: body.title,
                body: body.body,
            },
        )
        .await?;

    Ok(Json(ApiResponse::ok(item)))
}

async fn delete_review(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<serde_json::Value>>, ApiError> {
    service(&state).delete_review(&user, &id).await?;
    Ok(Json(ApiResponse::ok(serde_json::json!({ "deleted": true }))))
}
