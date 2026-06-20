use serde::Serialize;
use sqlx::SqlitePool;

use crate::domain::{
    CommunityOrder, CommunityUser, CreateOrderInput, OrderStatus, TaskStatus, UserRole,
};
use crate::repositories::order_repository::{OrderRepository, OrderRepositoryError};
use crate::repositories::task_repository::{TaskRepository, TaskRepositoryError};

#[derive(Debug, Clone)]
pub struct CreateOrderRequest {
    pub task_id: String,
    pub amount: f64,
    pub currency: String,
}

#[derive(Debug, Clone)]
pub struct UpdateOrderStatusRequest {
    pub status: OrderStatus,
}

#[derive(Debug, Clone, Serialize)]
pub struct OrderItem {
    pub id: String,
    pub task_id: String,
    pub payer_id: String,
    pub payee_id: String,
    pub amount: f64,
    pub currency: String,
    pub status: String,
    pub payment_provider: Option<String>,
    pub external_order_id: Option<String>,
    pub created_at: i64,
    pub paid_at: Option<i64>,
}

#[derive(Debug, thiserror::Error)]
pub enum OrderServiceError {
    #[error("forbidden")]
    Forbidden,
    #[error("order not found: {0}")]
    NotFound(String),
    #[error("task not found: {0}")]
    TaskNotFound(String),
    #[error("order already exists for this task")]
    OrderConflict,
    #[error("task is not completed")]
    TaskNotCompleted,
    #[error("task has no assignee")]
    TaskMissingAssignee,
    #[error("invalid order status transition: {from} -> {to}")]
    InvalidTransition { from: String, to: String },
    #[error("validation error: {0}")]
    Validation(String),
    #[error("order repository error: {0}")]
    OrderRepository(#[from] OrderRepositoryError),
    #[error("task repository error: {0}")]
    TaskRepository(#[from] TaskRepositoryError),
}

pub struct OrderService {
    pool: SqlitePool,
}

impl OrderService {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn create_order(
        &self,
        actor: &CommunityUser,
        input: CreateOrderRequest,
    ) -> Result<OrderItem, OrderServiceError> {
        let task = TaskRepository::new(self.pool.clone())
            .find_by_id(&input.task_id)
            .await?
            .ok_or_else(|| OrderServiceError::TaskNotFound(input.task_id.clone()))?;

        ensure_publisher_or_admin(actor, &task.publisher_id)?;

        if task.status != TaskStatus::Completed {
            return Err(OrderServiceError::TaskNotCompleted);
        }

        let payee_id = task
            .assignee_id
            .clone()
            .ok_or(OrderServiceError::TaskMissingAssignee)?;

        if input.amount <= 0.0 {
            return Err(OrderServiceError::Validation(
                "amount must be positive".to_string(),
            ));
        }

        let currency = input.currency.trim();
        if currency.is_empty() {
            return Err(OrderServiceError::Validation(
                "currency is required".to_string(),
            ));
        }

        let order = OrderRepository::new(self.pool.clone())
            .create(CreateOrderInput {
                task_id: input.task_id,
                payer_id: task.publisher_id,
                payee_id,
                amount: input.amount,
                currency: currency.to_string(),
            })
            .await
            .map_err(map_order_repo_error)?;

        Ok(to_item(order))
    }

    pub async fn get_order(
        &self,
        actor: &CommunityUser,
        id: &str,
    ) -> Result<OrderItem, OrderServiceError> {
        let order = OrderRepository::new(self.pool.clone())
            .find_by_id(id)
            .await?
            .ok_or_else(|| OrderServiceError::NotFound(id.to_string()))?;

        ensure_order_participant_or_admin(actor, &order)?;

        Ok(to_item(order))
    }

    pub async fn update_order_status(
        &self,
        actor: &CommunityUser,
        id: &str,
        input: UpdateOrderStatusRequest,
    ) -> Result<OrderItem, OrderServiceError> {
        let order = OrderRepository::new(self.pool.clone())
            .find_by_id(id)
            .await?
            .ok_or_else(|| OrderServiceError::NotFound(id.to_string()))?;

        ensure_publisher_or_admin(actor, &order.payer_id)?;

        let order = OrderRepository::new(self.pool.clone())
            .transition_status(id, input.status)
            .await
            .map_err(map_order_repo_error)?;

        Ok(to_item(order))
    }
}

fn to_item(order: CommunityOrder) -> OrderItem {
    OrderItem {
        id: order.id,
        task_id: order.task_id,
        payer_id: order.payer_id,
        payee_id: order.payee_id,
        amount: order.amount,
        currency: order.currency,
        status: order.status.as_str().to_string(),
        payment_provider: order.payment_provider,
        external_order_id: order.external_order_id,
        created_at: order.created_at,
        paid_at: order.paid_at,
    }
}

fn ensure_publisher_or_admin(actor: &CommunityUser, publisher_id: &str) -> Result<(), OrderServiceError> {
    if actor.is_moderator() || actor.id == publisher_id {
        Ok(())
    } else {
        Err(OrderServiceError::Forbidden)
    }
}

fn ensure_order_participant_or_admin(
    actor: &CommunityUser,
    order: &CommunityOrder,
) -> Result<(), OrderServiceError> {
    if actor.is_moderator()
        || actor.id == order.payer_id
        || actor.id == order.payee_id
    {
        Ok(())
    } else {
        Err(OrderServiceError::Forbidden)
    }
}

fn map_order_repo_error(error: OrderRepositoryError) -> OrderServiceError {
    match error {
        OrderRepositoryError::NotFound(value) => OrderServiceError::NotFound(value),
        OrderRepositoryError::Conflict => OrderServiceError::OrderConflict,
        OrderRepositoryError::Validation(order_error) => match order_error {
            crate::domain::OrderError::InvalidStatusTransition { from, to } => {
                OrderServiceError::InvalidTransition { from, to }
            }
            other => OrderServiceError::Validation(other.to_string()),
        },
        OrderRepositoryError::Database(error) => OrderServiceError::Validation(error.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;
    use std::sync::Arc;

    use uuid::Uuid;

    use crate::config::HubConfig;
    use crate::db::init_pool;
    use crate::db::seed::DEFAULT_ADMIN_USER_ID;
    use crate::domain::TaskType;
    use crate::repositories::UserRepository;
    use crate::services::task_market_service::{
        ApplyTaskRequest, CreateTaskRequest, DeliverTaskRequest, TaskMarketService,
    };

    use super::*;

    fn temp_data_dir() -> PathBuf {
        std::env::temp_dir().join(format!("toolman-order-service-{}", Uuid::new_v4()))
    }

    fn hub_config(data_dir: &PathBuf) -> Arc<HubConfig> {
        Arc::new(HubConfig {
            data_dir: data_dir.clone(),
            port: 3721,
            host: "127.0.0.1",
            require_review: false,
            jwt_secret: None,
            packages_dir: data_dir.join("packages"),
            covers_dir: data_dir.join("covers"),
            deliveries_dir: data_dir.join("deliveries"),
            db_path: data_dir.join("community.db"),
            rss_sources_path: data_dir.join("rss-sources.json"),
        })
    }

    async fn admin_user(pool: &SqlitePool) -> CommunityUser {
        UserRepository::new(pool.clone())
            .find_by_id(DEFAULT_ADMIN_USER_ID)
            .await
            .expect("find admin")
            .expect("admin")
    }

    async fn contractor_user(pool: &SqlitePool) -> CommunityUser {
        UserRepository::new(pool.clone())
            .find_or_create_by_identity_id("order-contractor", Some("Contractor"))
            .await
            .expect("contractor")
    }

    async fn completed_task(pool: &SqlitePool, data_dir: &PathBuf) -> String {
        let task_service = TaskMarketService::new(hub_config(data_dir), pool.clone());
        let admin = admin_user(pool).await;
        let contractor = contractor_user(pool).await;

        let draft = task_service
            .create_task(
                &admin,
                CreateTaskRequest {
                    title: "Paid task".to_string(),
                    description: None,
                    task_type: TaskType::Other,
                    budget_amount: Some(500.0),
                    budget_currency: Some("CNY".to_string()),
                    deadline_at: None,
                    tags: None,
                    resource_id: None,
                },
            )
            .await
            .expect("create");

        let open = task_service.publish_task(&admin, &draft.id).await.expect("publish");
        assert_eq!(open.status, "open");

        let application = task_service
            .apply_task(
                &contractor,
                &draft.id,
                ApplyTaskRequest {
                    proposal: "ok".to_string(),
                    quoted_amount: 500.0,
                },
            )
            .await
            .expect("apply");

        task_service
            .accept_application(&admin, &draft.id, &application.id)
            .await
            .expect("accept");

        task_service
            .deliver_task(
                &contractor,
                &draft.id,
                DeliverTaskRequest {
                    package_bytes: b"done".to_vec(),
                    original_filename: None,
                    notes: None,
                },
            )
            .await
            .expect("deliver");

        task_service
            .accept_delivery(&admin, &draft.id)
            .await
            .expect("complete");

        draft.id
    }

    #[tokio::test]
    async fn creates_order_and_advances_status_manually() {
        let data_dir = temp_data_dir();
        std::fs::create_dir_all(&data_dir).expect("data dir");
        let db_path = data_dir.join("community.db");
        let pool = init_pool(&db_path).await.expect("init pool");
        let service = OrderService::new(pool.clone());
        let admin = admin_user(&pool).await;
        let task_id = completed_task(&pool, &data_dir).await;

        let order = service
            .create_order(
                &admin,
                CreateOrderRequest {
                    task_id: task_id.clone(),
                    amount: 500.0,
                    currency: "CNY".to_string(),
                },
            )
            .await
            .expect("create order");
        assert_eq!(order.status, "pending");
        assert_eq!(order.payer_id, admin.id);

        let escrow = service
            .update_order_status(
                &admin,
                &order.id,
                UpdateOrderStatusRequest {
                    status: OrderStatus::Escrow,
                },
            )
            .await
            .expect("escrow");
        assert_eq!(escrow.status, "escrow");

        let paid = service
            .update_order_status(
                &admin,
                &order.id,
                UpdateOrderStatusRequest {
                    status: OrderStatus::Paid,
                },
            )
            .await
            .expect("paid");
        assert_eq!(paid.status, "paid");
        assert!(paid.paid_at.is_some());

        pool.close().await;
        let _ = std::fs::remove_dir_all(data_dir);
    }
}
