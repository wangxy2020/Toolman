use sqlx::SqlitePool;
use uuid::Uuid;

use crate::domain::{CommunityFavorite, InteractionTargetType};

#[derive(Debug, Clone)]
pub struct CreateFavoriteInput {
    pub user_id: String,
    pub target_type: InteractionTargetType,
    pub target_id: String,
}

#[derive(Debug, thiserror::Error)]
pub enum FavoriteRepositoryError {
    #[error("favorite not found: {0}")]
    NotFound(String),
    #[error("favorite already exists")]
    Conflict,
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
}

#[derive(Clone)]
pub struct FavoriteRepository {
    pool: SqlitePool,
}

#[derive(sqlx::FromRow)]
struct FavoriteRecord {
    id: String,
    user_id: String,
    target_type: String,
    target_id: String,
    created_at: i64,
}

impl FavoriteRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn create(
        &self,
        input: CreateFavoriteInput,
    ) -> Result<CommunityFavorite, FavoriteRepositoryError> {
        if self
            .find_by_user_and_target(
                &input.user_id,
                input.target_type,
                &input.target_id,
            )
            .await?
            .is_some()
        {
            return Err(FavoriteRepositoryError::Conflict);
        }

        let id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().timestamp_millis();

        let result = sqlx::query(
            r#"
            INSERT INTO community_favorites (id, user_id, target_type, target_id, created_at)
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
            Ok(_) => Ok(CommunityFavorite {
                id,
                user_id: input.user_id,
                target_type: input.target_type,
                target_id: input.target_id,
                created_at: now,
            }),
            Err(error) if is_unique_violation(&error) => Err(FavoriteRepositoryError::Conflict),
            Err(error) => Err(error.into()),
        }
    }

    pub async fn find_by_user_and_target(
        &self,
        user_id: &str,
        target_type: InteractionTargetType,
        target_id: &str,
    ) -> Result<Option<CommunityFavorite>, FavoriteRepositoryError> {
        let record = sqlx::query_as::<_, FavoriteRecord>(
            r#"
            SELECT id, user_id, target_type, target_id, created_at
            FROM community_favorites
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

    pub async fn list_target_ids_for_user(
        &self,
        user_id: &str,
        target_type: InteractionTargetType,
        limit: i64,
    ) -> Result<Vec<String>, FavoriteRepositoryError> {
        let rows: Vec<(String,)> = sqlx::query_as(
            r#"
            SELECT target_id
            FROM community_favorites
            WHERE user_id = ?1 AND target_type = ?2
            ORDER BY created_at DESC
            LIMIT ?3
            "#,
        )
        .bind(user_id)
        .bind(target_type.as_str())
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;

        Ok(rows.into_iter().map(|row| row.0).collect())
    }

    pub async fn delete_by_user_and_target(
        &self,
        user_id: &str,
        target_type: InteractionTargetType,
        target_id: &str,
    ) -> Result<bool, FavoriteRepositoryError> {
        let result = sqlx::query(
            r#"
            DELETE FROM community_favorites
            WHERE user_id = ?1 AND target_type = ?2 AND target_id = ?3
            "#,
        )
        .bind(user_id)
        .bind(target_type.as_str())
        .bind(target_id)
        .execute(&self.pool)
        .await?;

        Ok(result.rows_affected() > 0)
    }

    pub async fn count_by_target(
        &self,
        target_type: InteractionTargetType,
        target_id: &str,
    ) -> Result<i64, FavoriteRepositoryError> {
        let count: (i64,) = sqlx::query_as(
            r#"
            SELECT COUNT(*)
            FROM community_favorites
            WHERE target_type = ?1 AND target_id = ?2
            "#,
        )
        .bind(target_type.as_str())
        .bind(target_id)
        .fetch_one(&self.pool)
        .await?;

        Ok(count.0)
    }
}

impl TryFrom<FavoriteRecord> for CommunityFavorite {
    type Error = FavoriteRepositoryError;

    fn try_from(record: FavoriteRecord) -> Result<Self, Self::Error> {
        Ok(Self {
            id: record.id,
            user_id: record.user_id,
            target_type: InteractionTargetType::parse(&record.target_type)
                .map_err(|_| FavoriteRepositoryError::Database(sqlx::Error::RowNotFound))?,
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
