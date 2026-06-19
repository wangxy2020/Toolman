use sqlx::SqlitePool;

use crate::domain::{
    CommunityTaskDelivery, CreateTaskDeliveryInput, DeliveryStatus, TaskError,
};

#[derive(Debug, thiserror::Error)]
pub enum TaskDeliveryRepositoryError {
    #[error("delivery not found: {0}")]
    NotFound(String),
    #[error("validation error: {0}")]
    Validation(#[from] TaskError),
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
}

#[derive(Clone)]
pub struct TaskDeliveryRepository {
    pool: SqlitePool,
}

#[derive(sqlx::FromRow)]
struct DeliveryRecord {
    id: String,
    task_id: String,
    submitter_id: String,
    package_path: String,
    notes: Option<String>,
    status: String,
    created_at: i64,
}

impl TaskDeliveryRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn create(
        &self,
        input: CreateTaskDeliveryInput,
    ) -> Result<CommunityTaskDelivery, TaskDeliveryRepositoryError> {
        let now = chrono::Utc::now().timestamp_millis();

        sqlx::query(
            r#"
            INSERT INTO community_task_deliveries (
              id, task_id, submitter_id, package_path, notes, status, created_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, 'submitted', ?6)
            "#,
        )
        .bind(&input.id)
        .bind(&input.task_id)
        .bind(&input.submitter_id)
        .bind(&input.package_path)
        .bind(&input.notes)
        .bind(now)
        .execute(&self.pool)
        .await?;

        self.find_by_id(&input.id)
            .await?
            .ok_or_else(|| TaskDeliveryRepositoryError::NotFound(input.id))
    }

    pub async fn find_by_id(
        &self,
        id: &str,
    ) -> Result<Option<CommunityTaskDelivery>, TaskDeliveryRepositoryError> {
        let record = sqlx::query_as::<_, DeliveryRecord>(
            r#"
            SELECT id, task_id, submitter_id, package_path, notes, status, created_at
            FROM community_task_deliveries
            WHERE id = ?1
            "#,
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;

        record.map(TryInto::try_into).transpose()
    }

    pub async fn find_latest_submitted_by_task_id(
        &self,
        task_id: &str,
    ) -> Result<Option<CommunityTaskDelivery>, TaskDeliveryRepositoryError> {
        let record = sqlx::query_as::<_, DeliveryRecord>(
            r#"
            SELECT id, task_id, submitter_id, package_path, notes, status, created_at
            FROM community_task_deliveries
            WHERE task_id = ?1 AND status = 'submitted'
            ORDER BY created_at DESC
            LIMIT 1
            "#,
        )
        .bind(task_id)
        .fetch_optional(&self.pool)
        .await?;

        record.map(TryInto::try_into).transpose()
    }

    pub async fn update_status(
        &self,
        id: &str,
        status: DeliveryStatus,
    ) -> Result<CommunityTaskDelivery, TaskDeliveryRepositoryError> {
        let rows = sqlx::query(
            r#"
            UPDATE community_task_deliveries
            SET status = ?1
            WHERE id = ?2
            "#,
        )
        .bind(status.as_str())
        .bind(id)
        .execute(&self.pool)
        .await?
        .rows_affected();

        if rows == 0 {
            return Err(TaskDeliveryRepositoryError::NotFound(id.to_string()));
        }

        self.find_by_id(id)
            .await?
            .ok_or_else(|| TaskDeliveryRepositoryError::NotFound(id.to_string()))
    }
}

impl TryFrom<DeliveryRecord> for CommunityTaskDelivery {
    type Error = TaskDeliveryRepositoryError;

    fn try_from(record: DeliveryRecord) -> Result<Self, Self::Error> {
        Ok(Self {
            id: record.id,
            task_id: record.task_id,
            submitter_id: record.submitter_id,
            package_path: record.package_path,
            notes: record.notes,
            status: DeliveryStatus::parse(&record.status)?,
            created_at: record.created_at,
        })
    }
}
