use sqlx::SqlitePool;
use uuid::Uuid;

use crate::domain::{
    CommunityTaskReview, CreateTaskReviewInput, TaskError,
};

#[derive(Debug, thiserror::Error)]
pub enum TaskReviewRepositoryError {
    #[error("task review not found: {0}")]
    NotFound(String),
    #[error("task review already exists for this task")]
    Conflict,
    #[error("invalid rating: must be between 1 and 5")]
    InvalidRating,
    #[error("validation error: {0}")]
    Validation(#[from] TaskError),
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
}

#[derive(Clone)]
pub struct TaskReviewRepository {
    pool: SqlitePool,
}

#[derive(sqlx::FromRow)]
struct TaskReviewRecord {
    id: String,
    task_id: String,
    reviewer_id: String,
    reviewee_id: String,
    rating: i64,
    body: String,
    created_at: i64,
    updated_at: i64,
}

impl TaskReviewRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn create(
        &self,
        input: CreateTaskReviewInput,
    ) -> Result<CommunityTaskReview, TaskReviewRepositoryError> {
        if !(1..=5).contains(&input.rating) {
            return Err(TaskReviewRepositoryError::InvalidRating);
        }

        let id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().timestamp_millis();

        let result = sqlx::query(
            r#"
            INSERT INTO community_task_reviews (
              id, task_id, reviewer_id, reviewee_id, rating, body, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
            "#,
        )
        .bind(&id)
        .bind(&input.task_id)
        .bind(&input.reviewer_id)
        .bind(&input.reviewee_id)
        .bind(input.rating)
        .bind(&input.body)
        .bind(now)
        .execute(&self.pool)
        .await;

        match result {
            Ok(_) => {}
            Err(sqlx::Error::Database(error)) if error.is_unique_violation() => {
                return Err(TaskReviewRepositoryError::Conflict);
            }
            Err(error) => return Err(error.into()),
        }

        self.find_by_id(&id)
            .await?
            .ok_or_else(|| TaskReviewRepositoryError::NotFound(id))
    }

    pub async fn find_by_id(
        &self,
        id: &str,
    ) -> Result<Option<CommunityTaskReview>, TaskReviewRepositoryError> {
        let record = sqlx::query_as::<_, TaskReviewRecord>(
            r#"
            SELECT id, task_id, reviewer_id, reviewee_id, rating, body, created_at, updated_at
            FROM community_task_reviews
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
    ) -> Result<Vec<CommunityTaskReview>, TaskReviewRepositoryError> {
        let records = sqlx::query_as::<_, TaskReviewRecord>(
            r#"
            SELECT id, task_id, reviewer_id, reviewee_id, rating, body, created_at, updated_at
            FROM community_task_reviews
            WHERE task_id = ?1
            ORDER BY created_at ASC
            "#,
        )
        .bind(task_id)
        .fetch_all(&self.pool)
        .await?;

        records.into_iter().map(TryInto::try_into).collect()
    }
}

impl TryFrom<TaskReviewRecord> for CommunityTaskReview {
    type Error = TaskReviewRepositoryError;

    fn try_from(record: TaskReviewRecord) -> Result<Self, Self::Error> {
        Ok(Self {
            id: record.id,
            task_id: record.task_id,
            reviewer_id: record.reviewer_id,
            reviewee_id: record.reviewee_id,
            rating: record.rating,
            body: record.body,
            created_at: record.created_at,
            updated_at: record.updated_at,
        })
    }
}
