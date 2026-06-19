use sqlx::SqlitePool;
use uuid::Uuid;

use crate::domain::{
    ApplicationStatus, CommunityTaskApplication, CreateTaskApplicationInput, TaskError,
};

#[derive(Debug, thiserror::Error)]
pub enum TaskApplicationRepositoryError {
    #[error("application not found: {0}")]
    NotFound(String),
    #[error("application already exists for this task")]
    Conflict,
    #[error("validation error: {0}")]
    Validation(#[from] TaskError),
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
}

#[derive(Clone)]
pub struct TaskApplicationRepository {
    pool: SqlitePool,
}

#[derive(sqlx::FromRow)]
struct ApplicationRecord {
    id: String,
    task_id: String,
    applicant_id: String,
    proposal: String,
    quoted_amount: f64,
    status: String,
    created_at: i64,
}

impl TaskApplicationRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn create(
        &self,
        input: CreateTaskApplicationInput,
    ) -> Result<CommunityTaskApplication, TaskApplicationRepositoryError> {
        let id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().timestamp_millis();

        let result = sqlx::query(
            r#"
            INSERT INTO community_task_applications (
              id, task_id, applicant_id, proposal, quoted_amount, status, created_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, 'pending', ?6)
            "#,
        )
        .bind(&id)
        .bind(&input.task_id)
        .bind(&input.applicant_id)
        .bind(&input.proposal)
        .bind(input.quoted_amount)
        .bind(now)
        .execute(&self.pool)
        .await;

        match result {
            Ok(_) => {}
            Err(sqlx::Error::Database(error)) if error.is_unique_violation() => {
                return Err(TaskApplicationRepositoryError::Conflict);
            }
            Err(error) => return Err(error.into()),
        }

        self.find_by_id(&id)
            .await?
            .ok_or_else(|| TaskApplicationRepositoryError::NotFound(id))
    }

    pub async fn find_by_id(
        &self,
        id: &str,
    ) -> Result<Option<CommunityTaskApplication>, TaskApplicationRepositoryError> {
        let record = sqlx::query_as::<_, ApplicationRecord>(
            r#"
            SELECT id, task_id, applicant_id, proposal, quoted_amount, status, created_at
            FROM community_task_applications
            WHERE id = ?1
            "#,
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;

        record.map(TryInto::try_into).transpose()
    }

    pub async fn list_by_task_id(
        &self,
        task_id: &str,
    ) -> Result<Vec<CommunityTaskApplication>, TaskApplicationRepositoryError> {
        let records = sqlx::query_as::<_, ApplicationRecord>(
            r#"
            SELECT id, task_id, applicant_id, proposal, quoted_amount, status, created_at
            FROM community_task_applications
            WHERE task_id = ?1
            ORDER BY created_at DESC
            "#,
        )
        .bind(task_id)
        .fetch_all(&self.pool)
        .await?;

        records.into_iter().map(TryInto::try_into).collect()
    }

    pub async fn update_status(
        &self,
        id: &str,
        status: ApplicationStatus,
    ) -> Result<CommunityTaskApplication, TaskApplicationRepositoryError> {
        let rows = sqlx::query(
            r#"
            UPDATE community_task_applications
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
            return Err(TaskApplicationRepositoryError::NotFound(id.to_string()));
        }

        self.find_by_id(id)
            .await?
            .ok_or_else(|| TaskApplicationRepositoryError::NotFound(id.to_string()))
    }

    pub async fn reject_pending_for_task_except(
        &self,
        task_id: &str,
        except_id: &str,
    ) -> Result<(), TaskApplicationRepositoryError> {
        sqlx::query(
            r#"
            UPDATE community_task_applications
            SET status = 'rejected'
            WHERE task_id = ?1 AND id != ?2 AND status = 'pending'
            "#,
        )
        .bind(task_id)
        .bind(except_id)
        .execute(&self.pool)
        .await?;

        Ok(())
    }
}

impl TryFrom<ApplicationRecord> for CommunityTaskApplication {
    type Error = TaskApplicationRepositoryError;

    fn try_from(record: ApplicationRecord) -> Result<Self, Self::Error> {
        Ok(Self {
            id: record.id,
            task_id: record.task_id,
            applicant_id: record.applicant_id,
            proposal: record.proposal,
            quoted_amount: record.quoted_amount,
            status: ApplicationStatus::parse(&record.status)?,
            created_at: record.created_at,
        })
    }
}
