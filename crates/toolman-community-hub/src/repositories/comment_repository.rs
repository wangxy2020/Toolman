use sqlx::SqlitePool;
use uuid::Uuid;

use crate::domain::{CommentStatus, CommunityComment, InteractionTargetType, SocialError};

#[derive(Debug, Clone)]
pub struct CreateCommentInput {
    pub target_type: InteractionTargetType,
    pub target_id: String,
    pub user_id: String,
    pub parent_id: Option<String>,
    pub body: String,
}

#[derive(Debug, Clone)]
pub struct CommentListFilter {
    pub target_type: InteractionTargetType,
    pub target_id: String,
    pub user_id: Option<String>,
    pub parent_id: Option<Option<String>>,
    pub limit: i64,
    pub offset: i64,
}

#[derive(Debug, thiserror::Error)]
pub enum CommentRepositoryError {
    #[error("comment not found: {0}")]
    NotFound(String),
    #[error("validation error: {0}")]
    Validation(#[from] SocialError),
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
}

#[derive(Clone)]
pub struct CommentRepository {
    pool: SqlitePool,
}

#[derive(sqlx::FromRow)]
struct CommentRecord {
    id: String,
    target_type: String,
    target_id: String,
    user_id: String,
    parent_id: Option<String>,
    body: String,
    like_count: i64,
    dislike_count: i64,
    status: String,
    created_at: i64,
    updated_at: i64,
}

impl CommentRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn create(
        &self,
        input: CreateCommentInput,
    ) -> Result<CommunityComment, CommentRepositoryError> {
        if input.body.trim().is_empty() {
            return Err(CommentRepositoryError::Validation(SocialError::EmptyCommentBody));
        }

        let id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().timestamp_millis();

        sqlx::query(
            r#"
            INSERT INTO community_comments (
              id, target_type, target_id, user_id, parent_id, body, status, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'visible', ?7, ?7)
            "#,
        )
        .bind(&id)
        .bind(input.target_type.as_str())
        .bind(&input.target_id)
        .bind(&input.user_id)
        .bind(&input.parent_id)
        .bind(input.body.trim())
        .bind(now)
        .execute(&self.pool)
        .await?;

        Ok(CommunityComment {
            id,
            target_type: input.target_type,
            target_id: input.target_id,
            user_id: input.user_id,
            parent_id: input.parent_id,
            body: input.body.trim().to_string(),
            like_count: 0,
            dislike_count: 0,
            status: CommentStatus::Visible,
            created_at: now,
            updated_at: now,
        })
    }

    pub async fn find_by_id(
        &self,
        id: &str,
    ) -> Result<Option<CommunityComment>, CommentRepositoryError> {
        let record = sqlx::query_as::<_, CommentRecord>(
            r#"
            SELECT id, target_type, target_id, user_id, parent_id, body, like_count, dislike_count, status,
                   created_at, updated_at
            FROM community_comments
            WHERE id = ?1 AND status = 'visible'
            "#,
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;

        record.map(TryInto::try_into).transpose()
    }

    pub async fn list(
        &self,
        filter: &CommentListFilter,
    ) -> Result<Vec<CommunityComment>, CommentRepositoryError> {
        if let Some(user_id) = &filter.user_id {
            let records = sqlx::query_as::<_, CommentRecord>(
                r#"
                SELECT id, target_type, target_id, user_id, parent_id, body, like_count, dislike_count, status,
                       created_at, updated_at
                FROM community_comments
                WHERE target_type = ?1 AND target_id = ?2 AND user_id = ?3
                  AND parent_id IS NULL AND status = 'visible'
                ORDER BY created_at DESC
                LIMIT ?4 OFFSET ?5
                "#,
            )
            .bind(filter.target_type.as_str())
            .bind(&filter.target_id)
            .bind(user_id)
            .bind(filter.limit)
            .bind(filter.offset)
            .fetch_all(&self.pool)
            .await?;

            return records.into_iter().map(TryInto::try_into).collect();
        }

        let records = match &filter.parent_id {
            None => {
                sqlx::query_as::<_, CommentRecord>(
                    r#"
                    SELECT id, target_type, target_id, user_id, parent_id, body, like_count, dislike_count, status,
                           created_at, updated_at
                    FROM community_comments
                    WHERE target_type = ?1 AND target_id = ?2 AND status = 'visible'
                    ORDER BY created_at DESC
                    LIMIT ?3 OFFSET ?4
                    "#,
                )
                .bind(filter.target_type.as_str())
                .bind(&filter.target_id)
                .bind(filter.limit)
                .bind(filter.offset)
                .fetch_all(&self.pool)
                .await?
            }
            Some(parent_id) => {
                let query = if parent_id.is_none() {
                    r#"
                    SELECT id, target_type, target_id, user_id, parent_id, body, like_count, dislike_count, status,
                           created_at, updated_at
                    FROM community_comments
                    WHERE target_type = ?1 AND target_id = ?2 AND parent_id IS NULL AND status = 'visible'
                    ORDER BY created_at DESC
                    LIMIT ?3 OFFSET ?4
                    "#
                } else {
                    r#"
                    SELECT id, target_type, target_id, user_id, parent_id, body, like_count, dislike_count, status,
                           created_at, updated_at
                    FROM community_comments
                    WHERE target_type = ?1 AND target_id = ?2 AND parent_id = ?3 AND status = 'visible'
                    ORDER BY created_at ASC
                    LIMIT ?4 OFFSET ?5
                    "#
                };

                if let Some(parent_id) = parent_id {
                    sqlx::query_as::<_, CommentRecord>(query)
                        .bind(filter.target_type.as_str())
                        .bind(&filter.target_id)
                        .bind(parent_id)
                        .bind(filter.limit)
                        .bind(filter.offset)
                        .fetch_all(&self.pool)
                        .await?
                } else {
                    sqlx::query_as::<_, CommentRecord>(query)
                        .bind(filter.target_type.as_str())
                        .bind(&filter.target_id)
                        .bind(filter.limit)
                        .bind(filter.offset)
                        .fetch_all(&self.pool)
                        .await?
                }
            }
        };

        records.into_iter().map(TryInto::try_into).collect()
    }

    pub async fn count_board_root_messages(
        &self,
        board_id: &str,
    ) -> Result<i64, CommentRepositoryError> {
        let count: (i64,) = sqlx::query_as(
            r#"
            SELECT COUNT(*)
            FROM community_comments
            WHERE target_type = 'board'
              AND target_id = ?1
              AND parent_id IS NULL
              AND status = 'visible'
            "#,
        )
        .bind(board_id)
        .fetch_one(&self.pool)
        .await?;

        Ok(count.0)
    }

    pub async fn count_replies(&self, parent_id: &str) -> Result<i64, CommentRepositoryError> {
        let count = sqlx::query_scalar::<_, i64>(
            r#"
            SELECT COUNT(*)
            FROM community_comments
            WHERE parent_id = ?1 AND status = 'visible'
            "#,
        )
        .bind(parent_id)
        .fetch_one(&self.pool)
        .await?;

        Ok(count)
    }

    pub async fn count_top_level_comments(
        &self,
        target_type: InteractionTargetType,
        target_id: &str,
    ) -> Result<i64, CommentRepositoryError> {
        let count: (i64,) = sqlx::query_as(
            r#"
            SELECT COUNT(*)
            FROM community_comments
            WHERE target_type = ?1
              AND target_id = ?2
              AND parent_id IS NULL
              AND status = 'visible'
            "#,
        )
        .bind(target_type.as_str())
        .bind(target_id)
        .fetch_one(&self.pool)
        .await?;

        Ok(count.0)
    }

    pub async fn increment_like_count(
        &self,
        id: &str,
    ) -> Result<CommunityComment, CommentRepositoryError> {
        let now = chrono::Utc::now().timestamp_millis();
        sqlx::query(
            r#"
            UPDATE community_comments
            SET like_count = like_count + 1, updated_at = ?2
            WHERE id = ?1 AND status = 'visible'
            "#,
        )
        .bind(id)
        .bind(now)
        .execute(&self.pool)
        .await?;

        self.find_by_id(id)
            .await?
            .ok_or_else(|| CommentRepositoryError::NotFound(id.to_string()))
    }

    pub async fn increment_dislike_count(
        &self,
        id: &str,
    ) -> Result<CommunityComment, CommentRepositoryError> {
        let now = chrono::Utc::now().timestamp_millis();
        sqlx::query(
            r#"
            UPDATE community_comments
            SET dislike_count = dislike_count + 1, updated_at = ?2
            WHERE id = ?1 AND status = 'visible'
            "#,
        )
        .bind(id)
        .bind(now)
        .execute(&self.pool)
        .await?;

        self.find_by_id(id)
            .await?
            .ok_or_else(|| CommentRepositoryError::NotFound(id.to_string()))
    }

    pub async fn decrement_like_count(
        &self,
        id: &str,
    ) -> Result<CommunityComment, CommentRepositoryError> {
        let now = chrono::Utc::now().timestamp_millis();
        sqlx::query(
            r#"
            UPDATE community_comments
            SET like_count = CASE WHEN like_count > 0 THEN like_count - 1 ELSE 0 END,
                updated_at = ?2
            WHERE id = ?1 AND status = 'visible'
            "#,
        )
        .bind(id)
        .bind(now)
        .execute(&self.pool)
        .await?;

        self.find_by_id(id)
            .await?
            .ok_or_else(|| CommentRepositoryError::NotFound(id.to_string()))
    }

    pub async fn decrement_dislike_count(
        &self,
        id: &str,
    ) -> Result<CommunityComment, CommentRepositoryError> {
        let now = chrono::Utc::now().timestamp_millis();
        sqlx::query(
            r#"
            UPDATE community_comments
            SET dislike_count = CASE WHEN dislike_count > 0 THEN dislike_count - 1 ELSE 0 END,
                updated_at = ?2
            WHERE id = ?1 AND status = 'visible'
            "#,
        )
        .bind(id)
        .bind(now)
        .execute(&self.pool)
        .await?;

        self.find_by_id(id)
            .await?
            .ok_or_else(|| CommentRepositoryError::NotFound(id.to_string()))
    }

    pub async fn update_body(
        &self,
        id: &str,
        body: &str,
    ) -> Result<CommunityComment, CommentRepositoryError> {
        if body.trim().is_empty() {
            return Err(CommentRepositoryError::Validation(SocialError::EmptyCommentBody));
        }

        let now = chrono::Utc::now().timestamp_millis();
        let result = sqlx::query(
            r#"
            UPDATE community_comments
            SET body = ?1, updated_at = ?2
            WHERE id = ?3 AND status = 'visible'
            "#,
        )
        .bind(body.trim())
        .bind(now)
        .bind(id)
        .execute(&self.pool)
        .await?;

        if result.rows_affected() == 0 {
            return Err(CommentRepositoryError::NotFound(id.to_string()));
        }

        self.find_by_id(id)
            .await?
            .ok_or_else(|| CommentRepositoryError::NotFound(id.to_string()))
    }

    pub async fn soft_delete(&self, id: &str) -> Result<bool, CommentRepositoryError> {
        let now = chrono::Utc::now().timestamp_millis();
        let result = sqlx::query(
            r#"
            UPDATE community_comments
            SET status = 'deleted', updated_at = ?2
            WHERE (id = ?1 OR parent_id = ?1) AND status = 'visible'
            "#,
        )
        .bind(id)
        .bind(now)
        .execute(&self.pool)
        .await?;

        Ok(result.rows_affected() > 0)
    }
}

impl TryFrom<CommentRecord> for CommunityComment {
    type Error = CommentRepositoryError;

    fn try_from(record: CommentRecord) -> Result<Self, Self::Error> {
        Ok(Self {
            id: record.id,
            target_type: InteractionTargetType::parse(&record.target_type)
                .map_err(CommentRepositoryError::Validation)?,
            target_id: record.target_id,
            user_id: record.user_id,
            parent_id: record.parent_id,
            body: record.body,
            like_count: record.like_count,
            dislike_count: record.dislike_count,
            status: match record.status.as_str() {
                "visible" => CommentStatus::Visible,
                "hidden" => CommentStatus::Hidden,
                "deleted" => CommentStatus::Deleted,
                _ => CommentStatus::Visible,
            },
            created_at: record.created_at,
            updated_at: record.updated_at,
        })
    }
}
