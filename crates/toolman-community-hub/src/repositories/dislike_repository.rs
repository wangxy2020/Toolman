use sqlx::SqlitePool;
use uuid::Uuid;

use crate::domain::{CommunityDislike, InteractionTargetType};

#[derive(Debug, Clone)]
pub struct CreateDislikeInput {
    pub user_id: String,
    pub target_type: InteractionTargetType,
    pub target_id: String,
}

#[derive(Debug, thiserror::Error)]
pub enum DislikeRepositoryError {
    #[error("dislike not found: {0}")]
    NotFound(String),
    #[error("dislike already exists")]
    Conflict,
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
}

#[derive(Clone)]
pub struct DislikeRepository {
    pool: SqlitePool,
}

#[derive(sqlx::FromRow)]
struct DislikeRecord {
    id: String,
    user_id: String,
    target_type: String,
    target_id: String,
    created_at: i64,
}

impl DislikeRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn create(
        &self,
        input: CreateDislikeInput,
    ) -> Result<CommunityDislike, DislikeRepositoryError> {
        if self
            .find_by_user_and_target(
                &input.user_id,
                input.target_type,
                &input.target_id,
            )
            .await?
            .is_some()
        {
            return Err(DislikeRepositoryError::Conflict);
        }

        let id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().timestamp_millis();

        let result = sqlx::query(
            r#"
            INSERT INTO community_dislikes (id, user_id, target_type, target_id, created_at)
            VALUES (?1, ?2, ?3, ?4, ?5)
            "#,
        )
        .bind(&id)
        .bind(&input.user_id)
        .bind(input.target_type.as_str())
        .bind(&input.target_id)
        .bind(now)
        .execute(&self.pool)
        .await;

        match result {
            Ok(_) => Ok(CommunityDislike {
                id,
                user_id: input.user_id,
                target_type: input.target_type,
                target_id: input.target_id,
                created_at: now,
            }),
            Err(error) if is_unique_violation(&error) => Err(DislikeRepositoryError::Conflict),
            Err(error) => Err(error.into()),
        }
    }

    pub async fn delete_by_user_and_target(
        &self,
        user_id: &str,
        target_type: InteractionTargetType,
        target_id: &str,
    ) -> Result<bool, DislikeRepositoryError> {
        let rows = sqlx::query(
            r#"
            DELETE FROM community_dislikes
            WHERE user_id = ?1 AND target_type = ?2 AND target_id = ?3
            "#,
        )
        .bind(user_id)
        .bind(target_type.as_str())
        .bind(target_id)
        .execute(&self.pool)
        .await?
        .rows_affected();

        Ok(rows > 0)
    }

    pub async fn find_by_user_and_target(
        &self,
        user_id: &str,
        target_type: InteractionTargetType,
        target_id: &str,
    ) -> Result<Option<CommunityDislike>, DislikeRepositoryError> {
        let record = sqlx::query_as::<_, DislikeRecord>(
            r#"
            SELECT id, user_id, target_type, target_id, created_at
            FROM community_dislikes
            WHERE user_id = ?1 AND target_type = ?2 AND target_id = ?3
            "#,
        )
        .bind(user_id)
        .bind(target_type.as_str())
        .bind(target_id)
        .fetch_optional(&self.pool)
        .await?;

        record.map(TryInto::try_into).transpose()
    }
}

impl TryFrom<DislikeRecord> for CommunityDislike {
    type Error = DislikeRepositoryError;

    fn try_from(record: DislikeRecord) -> Result<Self, Self::Error> {
        Ok(Self {
            id: record.id,
            user_id: record.user_id,
            target_type: InteractionTargetType::parse(&record.target_type)
                .map_err(|_| DislikeRepositoryError::Database(sqlx::Error::RowNotFound))?,
            target_id: record.target_id,
            created_at: record.created_at,
        })
    }
}

fn is_unique_violation(error: &sqlx::Error) -> bool {
    matches!(
        error,
        sqlx::Error::Database(db_error)
            if db_error.code().as_deref() == Some("2067")
                || db_error.message().contains("UNIQUE constraint failed")
    )
}
