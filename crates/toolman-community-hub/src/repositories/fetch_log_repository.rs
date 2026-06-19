use sqlx::SqlitePool;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FetchLogStatus {
    Success,
    Error,
}

impl FetchLogStatus {
    fn as_str(self) -> &'static str {
        match self {
            Self::Success => "success",
            Self::Error => "error",
        }
    }
}

#[derive(Debug, Clone)]
pub struct FetchLogEntry {
    pub id: String,
    pub source_id: String,
    pub status: FetchLogStatus,
    pub articles_added: i64,
    pub error_message: Option<String>,
    pub fetched_at: i64,
}

#[derive(Debug, thiserror::Error)]
pub enum FetchLogRepositoryError {
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
}

#[derive(Clone)]
pub struct FetchLogRepository {
    pool: SqlitePool,
}

impl FetchLogRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn append(
        &self,
        source_id: &str,
        status: FetchLogStatus,
        articles_added: i64,
        error_message: Option<&str>,
    ) -> Result<FetchLogEntry, FetchLogRepositoryError> {
        let id = Uuid::new_v4().to_string();
        let fetched_at = chrono::Utc::now().timestamp_millis();

        sqlx::query(
            r#"
            INSERT INTO community_rss_fetch_logs (
              id, source_id, status, articles_added, error_message, fetched_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
            "#,
        )
        .bind(&id)
        .bind(source_id)
        .bind(status.as_str())
        .bind(articles_added)
        .bind(error_message)
        .bind(fetched_at)
        .execute(&self.pool)
        .await?;

        Ok(FetchLogEntry {
            id,
            source_id: source_id.to_string(),
            status,
            articles_added,
            error_message: error_message.map(str::to_string),
            fetched_at,
        })
    }
}
