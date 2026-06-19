use sqlx::SqlitePool;
use uuid::Uuid;

use crate::domain::{
    CommunityOrder, CreateOrderInput, OrderError, OrderStatus,
};

#[derive(Debug, thiserror::Error)]
pub enum OrderRepositoryError {
    #[error("order not found: {0}")]
    NotFound(String),
    #[error("order already exists for this task")]
    Conflict,
    #[error("validation error: {0}")]
    Validation(#[from] OrderError),
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
}

#[derive(Clone)]
pub struct OrderRepository {
    pool: SqlitePool,
}

#[derive(sqlx::FromRow)]
struct OrderRecord {
    id: String,
    task_id: String,
    payer_id: String,
    payee_id: String,
    amount: f64,
    currency: String,
    status: String,
    payment_provider: Option<String>,
    external_order_id: Option<String>,
    created_at: i64,
    paid_at: Option<i64>,
}

impl OrderRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn create(
        &self,
        input: CreateOrderInput,
    ) -> Result<CommunityOrder, OrderRepositoryError> {
        let id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().timestamp_millis();

        let result = sqlx::query(
            r#"
            INSERT INTO community_orders (
              id, task_id, payer_id, payee_id, amount, currency, status, created_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'pending', ?7)
            "#,
        )
        .bind(&id)
        .bind(&input.task_id)
        .bind(&input.payer_id)
        .bind(&input.payee_id)
        .bind(input.amount)
        .bind(&input.currency)
        .bind(now)
        .execute(&self.pool)
        .await;

        match result {
            Ok(_) => {}
            Err(sqlx::Error::Database(error)) if error.is_unique_violation() => {
                return Err(OrderRepositoryError::Conflict);
            }
            Err(error) => return Err(error.into()),
        }

        self.find_by_id(&id)
            .await?
            .ok_or_else(|| OrderRepositoryError::NotFound(id))
    }

    pub async fn find_by_id(&self, id: &str) -> Result<Option<CommunityOrder>, OrderRepositoryError> {
        let record = sqlx::query_as::<_, OrderRecord>(
            r#"
            SELECT
              id, task_id, payer_id, payee_id, amount, currency, status,
              payment_provider, external_order_id, created_at, paid_at
            FROM community_orders
            WHERE id = ?1
            "#,
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;

        record.map(TryInto::try_into).transpose()
    }

    pub async fn find_by_task_id(
        &self,
        task_id: &str,
    ) -> Result<Option<CommunityOrder>, OrderRepositoryError> {
        let record = sqlx::query_as::<_, OrderRecord>(
            r#"
            SELECT
              id, task_id, payer_id, payee_id, amount, currency, status,
              payment_provider, external_order_id, created_at, paid_at
            FROM community_orders
            WHERE task_id = ?1
            "#,
        )
        .bind(task_id)
        .fetch_optional(&self.pool)
        .await?;

        record.map(TryInto::try_into).transpose()
    }

    pub async fn transition_status(
        &self,
        id: &str,
        next_status: OrderStatus,
    ) -> Result<CommunityOrder, OrderRepositoryError> {
        let current = self
            .find_by_id(id)
            .await?
            .ok_or_else(|| OrderRepositoryError::NotFound(id.to_string()))?;

        OrderStatus::validate_transition(current.status, next_status)?;

        let paid_at = if next_status == OrderStatus::Paid {
            Some(chrono::Utc::now().timestamp_millis())
        } else {
            current.paid_at
        };

        let rows = sqlx::query(
            r#"
            UPDATE community_orders
            SET status = ?1, paid_at = ?2
            WHERE id = ?3
            "#,
        )
        .bind(next_status.as_str())
        .bind(paid_at)
        .bind(id)
        .execute(&self.pool)
        .await?
        .rows_affected();

        if rows == 0 {
            return Err(OrderRepositoryError::NotFound(id.to_string()));
        }

        self.find_by_id(id)
            .await?
            .ok_or_else(|| OrderRepositoryError::NotFound(id.to_string()))
    }
}

impl TryFrom<OrderRecord> for CommunityOrder {
    type Error = OrderRepositoryError;

    fn try_from(record: OrderRecord) -> Result<Self, Self::Error> {
        Ok(Self {
            id: record.id,
            task_id: record.task_id,
            payer_id: record.payer_id,
            payee_id: record.payee_id,
            amount: record.amount,
            currency: record.currency,
            status: OrderStatus::parse(&record.status)?,
            payment_provider: record.payment_provider,
            external_order_id: record.external_order_id,
            created_at: record.created_at,
            paid_at: record.paid_at,
        })
    }
}
