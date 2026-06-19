use sqlx::SqlitePool;
use uuid::Uuid;

use crate::domain::{CreateModerationLogInput, ModerationLog};

#[derive(Debug, thiserror::Error)]
pub enum ModerationLogRepositoryError {
    #[error("moderation log not found: {0}")]
    NotFound(String),
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
    #[error("serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
}

#[derive(Debug, Clone, Default)]
pub struct ModerationLogListFilter {
    pub limit: i64,
    pub offset: i64,
}

#[derive(Clone)]
pub struct ModerationLogRepository {
    pool: SqlitePool,
}

#[derive(sqlx::FromRow)]
struct ModerationLogRecord {
    id: String,
    moderator_id: String,
    action: String,
    target_type: String,
    target_id: String,
    reason: Option<String>,
    metadata_json: String,
    created_at: i64,
}

impl ModerationLogRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn create(
        &self,
        input: CreateModerationLogInput,
    ) -> Result<ModerationLog, ModerationLogRepositoryError> {
        let id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().timestamp_millis();
        let metadata_json = serde_json::to_string(
            &input
                .metadata_json
                .unwrap_or_else(|| serde_json::json!({})),
        )?;

        sqlx::query(
            r#"
            INSERT INTO community_moderation_logs (
              id, moderator_id, action, target_type, target_id, reason, metadata_json, created_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
            "#,
        )
        .bind(&id)
        .bind(&input.moderator_id)
        .bind(&input.action)
        .bind(&input.target_type)
        .bind(&input.target_id)
        .bind(&input.reason)
        .bind(&metadata_json)
        .bind(now)
        .execute(&self.pool)
        .await?;

        self.find_by_id(&id)
            .await?
            .ok_or_else(|| ModerationLogRepositoryError::NotFound(id))
    }

    pub async fn find_by_id(
        &self,
        id: &str,
    ) -> Result<Option<ModerationLog>, ModerationLogRepositoryError> {
        let record = sqlx::query_as::<_, ModerationLogRecord>(
            r#"
            SELECT
              id, moderator_id, action, target_type, target_id, reason, metadata_json, created_at
            FROM community_moderation_logs
            WHERE id = ?1
            "#,
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;

        record.map(TryInto::try_into).transpose()
    }

    pub async fn list(
        &self,
        filter: &ModerationLogListFilter,
    ) -> Result<Vec<ModerationLog>, ModerationLogRepositoryError> {
        let records = sqlx::query_as::<_, ModerationLogRecord>(
            r#"
            SELECT
              id, moderator_id, action, target_type, target_id, reason, metadata_json, created_at
            FROM community_moderation_logs
            ORDER BY created_at DESC
            LIMIT ?1 OFFSET ?2
            "#,
        )
        .bind(filter.limit)
        .bind(filter.offset)
        .fetch_all(&self.pool)
        .await?;

        records.into_iter().map(TryInto::try_into).collect()
    }
}

impl TryFrom<ModerationLogRecord> for ModerationLog {
    type Error = ModerationLogRepositoryError;

    fn try_from(record: ModerationLogRecord) -> Result<Self, Self::Error> {
        Ok(Self {
            id: record.id,
            moderator_id: record.moderator_id,
            action: record.action,
            target_type: record.target_type,
            target_id: record.target_id,
            reason: record.reason,
            metadata_json: serde_json::from_str(&record.metadata_json)?,
            created_at: record.created_at,
        })
    }
}
