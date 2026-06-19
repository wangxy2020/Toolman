use sqlx::{QueryBuilder, Sqlite, SqlitePool};
use uuid::Uuid;

use crate::domain::{CommunityNewsArticle, NewsArticleListFilter};
use crate::rss::FetchedFeedEntry;

#[derive(Debug, Clone)]
pub struct CreateNewsArticleInput {
    pub source_id: String,
    pub guid: String,
    pub title: String,
    pub summary: String,
    pub content_html: Option<String>,
    pub link: String,
    pub author: Option<String>,
    pub tags: Vec<String>,
    pub cover_url: Option<String>,
    pub published_at: i64,
    pub fetched_at: i64,
}

#[derive(Debug, thiserror::Error)]
pub enum NewsArticleRepositoryError {
    #[error("article not found: {0}")]
    NotFound(String),
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
    #[error("serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
}

#[derive(Clone)]
pub struct NewsArticleRepository {
    pool: SqlitePool,
}

#[derive(sqlx::FromRow)]
struct NewsArticleRecord {
    id: String,
    source_id: String,
    guid: String,
    title: String,
    summary: String,
    content_html: Option<String>,
    link: String,
    author: Option<String>,
    tags: String,
    cover_url: Option<String>,
    published_at: i64,
    fetched_at: i64,
    like_count: i64,
    favorite_count: i64,
    dislike_count: i64,
    view_count: i64,
}

const ARTICLE_SELECT: &str = r#"
SELECT
  id,
  source_id,
  guid,
  title,
  summary,
  content_html,
  link,
  author,
  tags,
  cover_url,
  published_at,
  fetched_at,
  like_count,
  favorite_count,
  dislike_count,
  view_count
FROM community_news_articles
"#;

impl NewsArticleRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn create_if_absent(
        &self,
        input: CreateNewsArticleInput,
    ) -> Result<Option<CommunityNewsArticle>, NewsArticleRepositoryError> {
        let exists: Option<(String,)> = sqlx::query_as(
            "SELECT id FROM community_news_articles WHERE source_id = ?1 AND guid = ?2",
        )
        .bind(&input.source_id)
        .bind(&input.guid)
        .fetch_optional(&self.pool)
        .await?;

        if exists.is_some() {
            return Ok(None);
        }

        let id = Uuid::new_v4().to_string();
        let tags = serde_json::to_string(&input.tags)?;

        let result = sqlx::query(
            r#"
            INSERT INTO community_news_articles (
              id, source_id, guid, title, summary, content_html, link, author, tags,
              cover_url, published_at, fetched_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
            "#,
        )
        .bind(&id)
        .bind(&input.source_id)
        .bind(&input.guid)
        .bind(&input.title)
        .bind(&input.summary)
        .bind(&input.content_html)
        .bind(&input.link)
        .bind(&input.author)
        .bind(&tags)
        .bind(&input.cover_url)
        .bind(input.published_at)
        .bind(input.fetched_at)
        .execute(&self.pool)
        .await;

        match result {
            Ok(_) => Ok(Some(self.find_by_id(&id).await?.expect("inserted article"))),
            Err(error) if is_unique_violation(&error) => Ok(None),
            Err(error) => Err(error.into()),
        }
    }

    pub async fn find_by_id(&self, id: &str) -> Result<Option<CommunityNewsArticle>, NewsArticleRepositoryError> {
        let query = format!("{ARTICLE_SELECT} WHERE id = ?1");
        let record = sqlx::query_as::<_, NewsArticleRecord>(&query)
            .bind(id)
            .fetch_optional(&self.pool)
            .await?;

        record.map(TryInto::try_into).transpose()
    }

    pub async fn update_content_html(
        &self,
        id: &str,
        content_html: &str,
    ) -> Result<CommunityNewsArticle, NewsArticleRepositoryError> {
        let rows = sqlx::query(
            "UPDATE community_news_articles SET content_html = ?1 WHERE id = ?2",
        )
        .bind(content_html)
        .bind(id)
        .execute(&self.pool)
        .await?
        .rows_affected();

        if rows == 0 {
            return Err(NewsArticleRepositoryError::NotFound(id.to_string()));
        }

        self.find_by_id(id)
            .await?
            .ok_or_else(|| NewsArticleRepositoryError::NotFound(id.to_string()))
    }

    pub async fn backfill_content_if_empty(
        &self,
        source_id: &str,
        guid: &str,
        summary: &str,
        content_html: Option<&str>,
    ) -> Result<(), NewsArticleRepositoryError> {
        let Some(content_html) = content_html.filter(|value| !value.trim().is_empty()) else {
            return Ok(());
        };

        sqlx::query(
            r#"
            UPDATE community_news_articles
            SET
              content_html = CASE
                WHEN content_html IS NULL OR TRIM(content_html) = '' THEN ?1
                ELSE content_html
              END,
              summary = CASE
                WHEN summary IS NULL OR TRIM(summary) = '' THEN ?2
                ELSE summary
              END
            WHERE source_id = ?3 AND guid = ?4
            "#,
        )
        .bind(content_html)
        .bind(summary)
        .bind(source_id)
        .bind(guid)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn list(
        &self,
        filter: &NewsArticleListFilter,
    ) -> Result<Vec<CommunityNewsArticle>, NewsArticleRepositoryError> {
        let mut builder = QueryBuilder::<Sqlite>::new(ARTICLE_SELECT);
        builder.push(" WHERE 1=1");

        if let Some(source_id) = &filter.source_id {
            builder.push(" AND source_id = ");
            builder.push_bind(source_id);
        }
        if let Some(category) = &filter.category {
            builder.push(
                " AND source_id IN (SELECT id FROM community_rss_sources WHERE category = ",
            );
            builder.push_bind(category);
            builder.push(")");
        }

        builder.push(" ORDER BY ");
        match filter.sort {
            crate::domain::NewsArticleSort::Newest | crate::domain::NewsArticleSort::Diverse => {
                builder.push("published_at DESC");
            }
            crate::domain::NewsArticleSort::Popular => {
                builder.push("(like_count * 2 + favorite_count * 3 + view_count) DESC, published_at DESC");
            }
        }
        builder.push(" LIMIT ");
        builder.push_bind(filter.limit);
        builder.push(" OFFSET ");
        builder.push_bind(filter.offset);

        let records = builder
            .build_query_as::<NewsArticleRecord>()
            .fetch_all(&self.pool)
            .await?;

        records.into_iter().map(TryInto::try_into).collect()
    }

    pub async fn increment_view_count(&self, id: &str) -> Result<CommunityNewsArticle, NewsArticleRepositoryError> {
        let rows = sqlx::query(
            "UPDATE community_news_articles SET view_count = view_count + 1 WHERE id = ?1",
        )
        .bind(id)
        .execute(&self.pool)
        .await?
        .rows_affected();

        if rows == 0 {
            return Err(NewsArticleRepositoryError::NotFound(id.to_string()));
        }

        self.find_by_id(id)
            .await?
            .ok_or_else(|| NewsArticleRepositoryError::NotFound(id.to_string()))
    }

    pub async fn increment_like_count(
        &self,
        id: &str,
    ) -> Result<CommunityNewsArticle, NewsArticleRepositoryError> {
        self.increment_counter(id, "like_count").await
    }

    pub async fn increment_favorite_count(
        &self,
        id: &str,
    ) -> Result<CommunityNewsArticle, NewsArticleRepositoryError> {
        self.increment_counter(id, "favorite_count").await
    }

    pub async fn increment_dislike_count(
        &self,
        id: &str,
    ) -> Result<CommunityNewsArticle, NewsArticleRepositoryError> {
        self.increment_counter(id, "dislike_count").await
    }

    pub async fn decrement_like_count(
        &self,
        id: &str,
    ) -> Result<CommunityNewsArticle, NewsArticleRepositoryError> {
        self.decrement_counter(id, "like_count").await
    }

    pub async fn decrement_dislike_count(
        &self,
        id: &str,
    ) -> Result<CommunityNewsArticle, NewsArticleRepositoryError> {
        self.decrement_counter(id, "dislike_count").await
    }

    pub async fn decrement_favorite_count(
        &self,
        id: &str,
    ) -> Result<CommunityNewsArticle, NewsArticleRepositoryError> {
        self.decrement_counter(id, "favorite_count").await
    }

    pub async fn find_by_ids(
        &self,
        ids: &[String],
    ) -> Result<Vec<CommunityNewsArticle>, NewsArticleRepositoryError> {
        if ids.is_empty() {
            return Ok(Vec::new());
        }

        let mut builder = QueryBuilder::<Sqlite>::new(ARTICLE_SELECT);
        builder.push(" WHERE id IN (");
        let mut separated = builder.separated(", ");
        for id in ids {
            separated.push_bind(id);
        }
        builder.push(")");

        let records = builder
            .build_query_as::<NewsArticleRecord>()
            .fetch_all(&self.pool)
            .await?;

        let mut articles: Vec<CommunityNewsArticle> = records
            .into_iter()
            .map(TryInto::try_into)
            .collect::<Result<_, _>>()?;

        let order: std::collections::HashMap<&str, usize> = ids
            .iter()
            .enumerate()
            .map(|(index, id)| (id.as_str(), index))
            .collect();
        articles.sort_by_key(|article| order.get(article.id.as_str()).copied().unwrap_or(usize::MAX));

        Ok(articles)
    }

    pub async fn list_by_tags(
        &self,
        tags: &[String],
        limit: i64,
    ) -> Result<Vec<CommunityNewsArticle>, NewsArticleRepositoryError> {
        if tags.is_empty() {
            return Ok(Vec::new());
        }

        let mut builder = QueryBuilder::<Sqlite>::new(ARTICLE_SELECT);
        builder.push(" WHERE 1=1");
        for tag in tags {
            builder.push(" AND tags LIKE ");
            builder.push_bind(format!("%\"{tag}\"%"));
        }
        builder.push(" ORDER BY (like_count * 2 + favorite_count * 3 + view_count) DESC, published_at DESC LIMIT ");
        builder.push_bind(limit);

        let records = builder
            .build_query_as::<NewsArticleRecord>()
            .fetch_all(&self.pool)
            .await?;

        records.into_iter().map(TryInto::try_into).collect()
    }

    async fn increment_counter(
        &self,
        id: &str,
        column: &str,
    ) -> Result<CommunityNewsArticle, NewsArticleRepositoryError> {
        let query = format!(
            "UPDATE community_news_articles SET {column} = {column} + 1 WHERE id = ?1"
        );
        let rows = sqlx::query(&query)
            .bind(id)
            .execute(&self.pool)
            .await?
            .rows_affected();

        if rows == 0 {
            return Err(NewsArticleRepositoryError::NotFound(id.to_string()));
        }

        self.find_by_id(id)
            .await?
            .ok_or_else(|| NewsArticleRepositoryError::NotFound(id.to_string()))
    }

    async fn decrement_counter(
        &self,
        id: &str,
        column: &str,
    ) -> Result<CommunityNewsArticle, NewsArticleRepositoryError> {
        let query = format!(
            "UPDATE community_news_articles SET {column} = CASE WHEN {column} > 0 THEN {column} - 1 ELSE 0 END WHERE id = ?1"
        );
        let rows = sqlx::query(&query)
            .bind(id)
            .execute(&self.pool)
            .await?
            .rows_affected();

        if rows == 0 {
            return Err(NewsArticleRepositoryError::NotFound(id.to_string()));
        }

        self.find_by_id(id)
            .await?
            .ok_or_else(|| NewsArticleRepositoryError::NotFound(id.to_string()))
    }
}

impl From<&FetchedFeedEntry> for CreateNewsArticleInput {
    fn from(entry: &FetchedFeedEntry) -> Self {
        let cover_url = crate::rss::extract_cover_url(
            entry
                .content_html
                .as_deref()
                .or(Some(entry.summary.as_str())),
        );

        Self {
            source_id: String::new(),
            guid: entry.guid.clone(),
            title: entry.title.clone(),
            summary: entry.summary.clone(),
            content_html: entry.content_html.clone(),
            link: entry.link.clone(),
            author: entry.author.clone(),
            tags: Vec::new(),
            cover_url,
            published_at: entry.published_at,
            fetched_at: chrono::Utc::now().timestamp_millis(),
        }
    }
}

impl TryFrom<NewsArticleRecord> for CommunityNewsArticle {
    type Error = NewsArticleRepositoryError;

    fn try_from(record: NewsArticleRecord) -> Result<Self, Self::Error> {
        Ok(Self {
            id: record.id,
            source_id: record.source_id,
            guid: record.guid,
            title: record.title,
            summary: record.summary,
            content_html: record.content_html,
            link: record.link,
            author: record.author,
            tags: serde_json::from_str(&record.tags)?,
            cover_url: record.cover_url,
            published_at: record.published_at,
            fetched_at: record.fetched_at,
            like_count: record.like_count,
            favorite_count: record.favorite_count,
            dislike_count: record.dislike_count,
            view_count: record.view_count,
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
