use axum::extract::{Path, State};
use axum::routing::{get, patch, post};
use axum::{Json, Router};
use serde::Deserialize;

use crate::api::auth::AuthUser;
use crate::api::error::ApiError;
use crate::api::response::ApiResponse;
use crate::domain::OrderStatus;
use crate::services::order_service::{
    CreateOrderRequest, OrderItem, OrderService, UpdateOrderStatusRequest,
};
use crate::state::AppState;

#[derive(Debug, Deserialize)]
pub struct CreateOrderBody {
    pub task_id: String,
    pub amount: f64,
    pub currency: String,
}

#[derive(Debug, Deserialize)]
pub struct PatchOrderStatusBody {
    pub status: String,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/orders", post(create_order))
        .route("/orders/{id}", get(get_order))
        .route("/orders/{id}/status", patch(update_order_status))
}

fn service(state: &AppState) -> OrderService {
    OrderService::new(state.db.clone())
}

async fn create_order(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Json(body): Json<CreateOrderBody>,
) -> Result<Json<ApiResponse<OrderItem>>, ApiError> {
    let item = service(&state)
        .create_order(
            &user,
            CreateOrderRequest {
                task_id: body.task_id,
                amount: body.amount,
                currency: body.currency,
            },
        )
        .await?;

    Ok(Json(ApiResponse::ok(item)))
}

async fn get_order(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<OrderItem>>, ApiError> {
    let item = service(&state).get_order(&user, &id).await?;
    Ok(Json(ApiResponse::ok(item)))
}

async fn update_order_status(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
    Json(body): Json<PatchOrderStatusBody>,
) -> Result<Json<ApiResponse<OrderItem>>, ApiError> {
    let status = OrderStatus::parse(&body.status)
        .map_err(|error| ApiError::validation(error.to_string()))?;

    let item = service(&state)
        .update_order_status(
            &user,
            &id,
            UpdateOrderStatusRequest { status },
        )
        .await?;

    Ok(Json(ApiResponse::ok(item)))
}
