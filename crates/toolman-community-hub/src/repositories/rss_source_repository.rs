use sqlx::SqlitePool;
use uuid::Uuid;

use crate::domain::{CommunityRssSource, CreateRssSourceInput, NewsError};

#[derive(Debug, thiserror::Error)]
pub enum RssSourceRepositoryError {
    #[error("rss source not found: {0}")]
    NotFound(String),
    #[error("feed_url already exists: {0}")]
    FeedUrlConflict(String),
    #[error("validation error: {0}")]
    Validation(#[from] NewsError),
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
}

#[derive(Clone)]
pub struct RssSourceRepository {
    pool: SqlitePool,
}

#[derive(sqlx::FromRow)]
struct RssSourceRecord {
    id: String,
    title: String,
    feed_url: String,
    site_url: String,
    category: String,
    language: String,
    enabled: i64,
    fetch_interval_minutes: i64,
    last_fetched_at: Option<i64>,
    last_error: Option<String>,
    created_at: i64,
}

const RSS_SOURCE_SELECT: &str = r#"
SELECT
  id,
  title,
  feed_url,
  site_url,
  category,
  language,
  enabled,
  fetch_interval_minutes,
  last_fetched_at,
  last_error,
  created_at
FROM community_rss_sources
"#;

impl RssSourceRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn list(&self) -> Result<Vec<CommunityRssSource>, RssSourceRepositoryError> {
        let query = format!("{RSS_SOURCE_SELECT} ORDER BY created_at ASC");
        let records = sqlx::query_as::<_, RssSourceRecord>(&query)
            .fetch_all(&self.pool)
            .await?;

        records.into_iter().map(TryInto::try_into).collect()
    }

    pub async fn find_by_id(&self, id: &str) -> Result<Option<CommunityRssSource>, RssSourceRepositoryError> {
        let query = format!("{RSS_SOURCE_SELECT} WHERE id = ?1");
        let record = sqlx::query_as::<_, RssSourceRecord>(&query)
            .bind(id)
            .fetch_optional(&self.pool)
            .await?;

        record.map(TryInto::try_into).transpose()
    }

    pub async fn create(
        &self,
        input: CreateRssSourceInput,
    ) -> Result<CommunityRssSource, RssSourceRepositoryError> {
        input.validate()?;

        let id = input
            .id
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| Uuid::new_v4().to_string());
        let now = chrono::Utc::now().timestamp_millis();
        let site_url = input.site_url.unwrap_or_default();
        let category = input.category.unwrap_or_else(|| "ai".to_string());
        let language = input.language.unwrap_or_else(|| "zh".to_string());
        let enabled = if input.enabled.unwrap_or(true) { 1 } else { 0 };
        let fetch_interval_minutes = input.fetch_interval_minutes.unwrap_or(60);

        let result = sqlx::query(
            r#"
            INSERT INTO community_rss_sources (
              id, title, feed_url, site_url, category, language, enabled,
              fetch_interval_minutes, created_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
            "#,
        )
        .bind(&id)
        .bind(input.title.trim())
        .bind(input.feed_url.trim())
        .bind(site_url)
        .bind(category)
        .bind(language)
        .bind(enabled)
        .bind(fetch_interval_minutes)
        .bind(now)
        .execute(&self.pool)
        .await;

        match result {
            Ok(_) => self
                .find_by_id(&id)
                .await?
                .ok_or_else(|| RssSourceRepositoryError::NotFound(id)),
            Err(error) if is_unique_violation(&error) => {
                Err(RssSourceRepositoryError::FeedUrlConflict(input.feed_url))
            }
            Err(error) => Err(error.into()),
        }
    }

    pub async fn upsert_seed(
        &self,
        seed: &crate::config::RssSourceSeed,
    ) -> Result<CommunityRssSource, RssSourceRepositoryError> {
        let now = chrono::Utc::now().timestamp_millis();
        sqlx::query(
            r#"
            INSERT INTO community_rss_sources (
              id, title, feed_url, site_url, category, language, enabled,
              fetch_interval_minutes, created_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
            ON CONFLICT(feed_url) DO UPDATE SET
              title = excluded.title,
              site_url = excluded.site_url,
              category = excluded.category,
              language = excluded.language,
              enabled = excluded.enabled,
              fetch_interval_minutes = excluded.fetch_interval_minutes
            "#,
        )
        .bind(&seed.id)
        .bind(&seed.title)
        .bind(&seed.feed_url)
        .bind(&seed.site_url)
        .bind(&seed.category)
        .bind(&seed.language)
        .bind(if seed.enabled { 1 } else { 0 })
        .bind(i64::from(seed.fetch_interval_minutes))
        .bind(now)
        .execute(&self.pool)
        .await?;

        let source = sqlx::query_as::<_, RssSourceRecord>(&format!(
            "{RSS_SOURCE_SELECT} WHERE feed_url = ?1"
        ))
        .bind(&seed.feed_url)
        .fetch_one(&self.pool)
        .await?;

        source.try_into()
    }

    pub async fn delete(&self, id: &str) -> Result<bool, RssSourceRepositoryError> {
        let rows = sqlx::query("DELETE FROM community_rss_sources WHERE id = ?1")
            .bind(id)
            .execute(&self.pool)
            .await?
            .rows_affected();

        Ok(rows > 0)
    }

    pub async fn mark_fetch_success(
        &self,
        id: &str,
        fetched_at: i64,
    ) -> Result<(), RssSourceRepositoryError> {
        let rows = sqlx::query(
            r#"
            UPDATE community_rss_sources
            SET last_fetched_at = ?1, last_error = NULL
            WHERE id = ?2
            "#,
        )
        .bind(fetched_at)
        .bind(id)
        .execute(&self.pool)
        .await?
        .rows_affected();

        if rows == 0 {
            return Err(RssSourceRepositoryError::NotFound(id.to_string()));
        }

        Ok(())
    }

    pub async fn mark_fetch_error(
        &self,
        id: &str,
        fetched_at: i64,
        error_message: &str,
    ) -> Result<(), RssSourceRepositoryError> {
        let rows = sqlx::query(
            r#"
            UPDATE community_rss_sources
            SET last_fetched_at = ?1, last_error = ?2
            WHERE id = ?3
            "#,
        )
        .bind(fetched_at)
        .bind(error_message)
        .bind(id)
        .execute(&self.pool)
        .await?
        .rows_affected();

        if rows == 0 {
            return Err(RssSourceRepositoryError::NotFound(id.to_string()));
        }

        Ok(())
    }
}

impl TryFrom<RssSourceRecord> for CommunityRssSource {
    type Error = RssSourceRepositoryError;

    fn try_from(record: RssSourceRecord) -> Result<Self, Self::Error> {
        Ok(Self {
            id: record.id,
            title: record.title,
            feed_url: record.feed_url,
            site_url: record.site_url,
            category: record.category,
            language: record.language,
            enabled: record.enabled != 0,
            fetch_interval_minutes: record.fetch_interval_minutes,
            last_fetched_at: record.last_fetched_at,
            last_error: record.last_error,
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
