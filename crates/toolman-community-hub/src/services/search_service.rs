use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use crate::domain::{
    CommunityResource, ResourceError, ResourceListFilter, ResourceStatus, ResourceType,
    ResourceVisibility,
};
use crate::repositories::resource_repository::{RepositoryError, ResourceRepository};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SearchSort {
    Relevance,
    Newest,
    Rating,
    Downloads,
    Installs,
}

impl Default for SearchSort {
    fn default() -> Self {
        Self::Relevance
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SearchTargetType {
    Resource,
    News,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceSearchFilter {
    pub q: String,
    pub resource_type: Option<ResourceType>,
    pub category: Option<String>,
    pub status: Option<ResourceStatus>,
    pub visibility: Option<ResourceVisibility>,
    pub author_id: Option<String>,
    pub sort: SearchSort,
    pub limit: i64,
    pub offset: i64,
}

impl Default for ResourceSearchFilter {
    fn default() -> Self {
        Self {
            q: String::new(),
            resource_type: None,
            category: None,
            status: Some(ResourceStatus::Published),
            visibility: Some(ResourceVisibility::Public),
            author_id: None,
            sort: SearchSort::Relevance,
            limit: 20,
            offset: 0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewsSearchFilter {
    pub q: String,
    pub source_id: Option<String>,
    pub limit: i64,
    pub offset: i64,
}

impl Default for NewsSearchFilter {
    fn default() -> Self {
        Self {
            q: String::new(),
            source_id: None,
            limit: 20,
            offset: 0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnifiedSearchQuery {
    pub q: String,
    pub include_resources: bool,
    pub include_news: bool,
    pub resource_type: Option<ResourceType>,
    pub category: Option<String>,
    pub limit: i64,
    pub offset: i64,
}

impl Default for UnifiedSearchQuery {
    fn default() -> Self {
        Self {
            q: String::new(),
            include_resources: true,
            include_news: true,
            resource_type: None,
            category: None,
            limit: 20,
            offset: 0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RankedResource {
    pub resource: CommunityResource,
    pub rank: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NewsSearchHit {
    pub id: String,
    pub source_id: String,
    pub title: String,
    pub summary: String,
    pub link: String,
    pub tags: Vec<String>,
    pub published_at: i64,
    pub rank: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchHit {
    pub target_type: SearchTargetType,
    pub target_id: String,
    pub title: String,
    pub snippet: String,
    pub rank: f64,
    pub published_at: Option<i64>,
}

#[derive(Debug, thiserror::Error)]
pub enum SearchError {
    #[error("search query must not be empty")]
    EmptyQuery,
    #[error("invalid fts query")]
    InvalidQuery,
    #[error("resource validation failed: {0}")]
    Resource(#[from] ResourceError),
    #[error("repository error: {0}")]
    Repository(#[from] RepositoryError),
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
    #[error("serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
}

#[derive(Clone)]
pub struct SearchService {
    pool: SqlitePool,
}

impl SearchService {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub fn pool(&self) -> &SqlitePool {
        &self.pool
    }

    pub async fn search_resources(
        &self,
        filter: &ResourceSearchFilter,
    ) -> Result<Vec<RankedResource>, SearchError> {
        let fts_query = match build_fts_match_query(&filter.q) {
            Some(query) => query,
            None => {
                return self
                    .browse_resources_without_query(filter)
                    .await
                    .map(|resources| {
                        resources
                            .into_iter()
                            .map(|resource| RankedResource { resource, rank: 0.0 })
                            .collect()
                    });
            }
        };

        let status = filter
            .status
            .unwrap_or(ResourceStatus::Published)
            .as_str();
        let visibility = filter
            .visibility
            .unwrap_or(ResourceVisibility::Public)
            .as_str();

        let order_clause = match filter.sort {
            SearchSort::Relevance => "rank_score ASC, r.created_at DESC",
            SearchSort::Newest => "r.created_at DESC",
            SearchSort::Rating => "r.rating DESC, r.rating_count DESC",
            SearchSort::Downloads => "r.download_count DESC",
            SearchSort::Installs => "r.install_count DESC",
        };

        let mut builder = sqlx::QueryBuilder::new(
            r#"
            SELECT
              r.id,
              r.title,
              r.description,
              r.author_id,
              r.version,
              r.tags,
              r.category,
              r.rating,
              r.rating_count,
              r.download_count,
              r.install_count,
              r.favorite_count,
              r.resource_type,
              r.cover_path,
              r.license,
              r.visibility,
              r.status,
              r.resource_size,
              r.package_path,
              r.manifest_json,
              r.latest_version_id,
              r.created_at,
              r.updated_at,
              r.published_at,
              r.deleted_at,
              bm25(community_resources_fts) AS rank_score
            FROM community_resources_fts
            JOIN community_resources r ON r.rowid = community_resources_fts.rowid
            WHERE community_resources_fts MATCH "#,
        );
        builder.push_bind(fts_query);
        builder.push(
            " AND r.deleted_at IS NULL AND r.status = ",
        );
        builder.push_bind(status);
        builder.push(" AND r.visibility = ");
        builder.push_bind(visibility);

        if let Some(resource_type) = filter.resource_type {
            builder.push(" AND r.resource_type = ");
            builder.push_bind(resource_type.as_str());
        }
        if let Some(category) = &filter.category {
            builder.push(" AND r.category = ");
            builder.push_bind(category);
        }

        builder.push(" ORDER BY ");
        builder.push(order_clause);
        builder.push(" LIMIT ");
        builder.push_bind(filter.limit);
        builder.push(" OFFSET ");
        builder.push_bind(filter.offset);

        let records = builder
            .build_query_as::<RankedResourceRecord>()
            .fetch_all(&self.pool)
            .await?;

        records.into_iter().map(RankedResource::try_from).collect()
    }

    pub async fn search_news(
        &self,
        filter: &NewsSearchFilter,
    ) -> Result<Vec<NewsSearchHit>, SearchError> {
        let fts_query = build_fts_match_query(&filter.q).ok_or(SearchError::EmptyQuery)?;

        let mut builder = sqlx::QueryBuilder::new(
            r#"
            SELECT
              a.id,
              a.source_id,
              a.title,
              a.summary,
              a.link,
              a.tags,
              a.published_at,
              bm25(community_news_articles_fts) AS rank_score
            FROM community_news_articles_fts
            JOIN community_news_articles a ON a.rowid = community_news_articles_fts.rowid
            WHERE community_news_articles_fts MATCH "#,
        );
        builder.push_bind(fts_query);

        if let Some(source_id) = &filter.source_id {
            builder.push(" AND a.source_id = ");
            builder.push_bind(source_id);
        }

        builder.push(" ORDER BY rank_score ASC, a.published_at DESC LIMIT ");
        builder.push_bind(filter.limit);
        builder.push(" OFFSET ");
        builder.push_bind(filter.offset);

        let records = builder
            .build_query_as::<NewsSearchRecord>()
            .fetch_all(&self.pool)
            .await?;

        records.into_iter().map(NewsSearchHit::try_from).collect()
    }

    pub async fn search_unified(
        &self,
        query: &UnifiedSearchQuery,
    ) -> Result<Vec<SearchHit>, SearchError> {
        if !query.include_resources && !query.include_news {
            return Ok(Vec::new());
        }

        build_fts_match_query(&query.q).ok_or(SearchError::EmptyQuery)?;

        let fetch_limit = query.limit.saturating_add(query.offset).max(query.limit);
        let mut hits = Vec::new();

        if query.include_resources {
            let resources = self
                .search_resources(&ResourceSearchFilter {
                    q: query.q.clone(),
                    resource_type: query.resource_type,
                    category: query.category.clone(),
                    status: Some(ResourceStatus::Published),
                    visibility: Some(ResourceVisibility::Public),
                    author_id: None,
                    sort: SearchSort::Relevance,
                    limit: fetch_limit,
                    offset: 0,
                })
                .await?;

            hits.extend(resources.into_iter().map(|item| SearchHit {
                target_type: SearchTargetType::Resource,
                target_id: item.resource.id,
                title: item.resource.title,
                snippet: item.resource.description,
                rank: item.rank,
                published_at: item.resource.published_at,
            }));
        }

        if query.include_news {
            let articles = self
                .search_news(&NewsSearchFilter {
                    q: query.q.clone(),
                    source_id: None,
                    limit: fetch_limit,
                    offset: 0,
                })
                .await?;

            hits.extend(articles.into_iter().map(|item| SearchHit {
                target_type: SearchTargetType::News,
                target_id: item.id,
                title: item.title,
                snippet: item.summary,
                rank: item.rank,
                published_at: Some(item.published_at),
            }));
        }

        hits.sort_by(|left, right| {
            right
                .rank
                .partial_cmp(&left.rank)
                .unwrap_or(std::cmp::Ordering::Equal)
                .then_with(|| right.published_at.cmp(&left.published_at))
        });

        let start = query.offset.max(0) as usize;
        Ok(hits
            .into_iter()
            .skip(start)
            .take(query.limit.max(0) as usize)
            .collect())
    }

    async fn browse_resources_without_query(
        &self,
        filter: &ResourceSearchFilter,
    ) -> Result<Vec<CommunityResource>, SearchError> {
        let repo = ResourceRepository::new(self.pool.clone());
        let resources = repo
            .list(&ResourceListFilter {
                resource_type: filter.resource_type,
                status: filter.status,
                visibility: filter.visibility,
                author_id: filter.author_id.clone(),
                category: filter.category.clone(),
                tags: None,
                include_deleted: false,
                limit: Some(filter.limit),
                offset: Some(filter.offset),
                ..Default::default()
            })
            .await?;

        let mut sorted = resources;
        match filter.sort {
            SearchSort::Relevance | SearchSort::Newest => {
                sorted.sort_by(|left, right| right.created_at.cmp(&left.created_at));
            }
            SearchSort::Rating => {
                sorted.sort_by(|left, right| {
                    right
                        .rating
                        .partial_cmp(&left.rating)
                        .unwrap_or(std::cmp::Ordering::Equal)
                        .then_with(|| right.rating_count.cmp(&left.rating_count))
                });
            }
            SearchSort::Downloads => {
                sorted.sort_by(|left, right| right.download_count.cmp(&left.download_count));
            }
            SearchSort::Installs => {
                sorted.sort_by(|left, right| right.install_count.cmp(&left.install_count));
            }
        }

        Ok(sorted)
    }
}

#[derive(sqlx::FromRow)]
struct RankedResourceRecord {
    id: String,
    title: String,
    description: String,
    author_id: String,
    version: String,
    tags: String,
    category: String,
    rating: f64,
    rating_count: i64,
    download_count: i64,
    install_count: i64,
    favorite_count: i64,
    resource_type: String,
    cover_path: Option<String>,
    license: String,
    visibility: String,
    status: String,
    resource_size: i64,
    package_path: Option<String>,
    manifest_json: String,
    latest_version_id: Option<String>,
    created_at: i64,
    updated_at: i64,
    published_at: Option<i64>,
    deleted_at: Option<i64>,
    rank_score: f64,
}

#[derive(sqlx::FromRow)]
struct NewsSearchRecord {
    id: String,
    source_id: String,
    title: String,
    summary: String,
    link: String,
    tags: String,
    published_at: i64,
    rank_score: f64,
}

impl TryFrom<RankedResourceRecord> for RankedResource {
    type Error = SearchError;

    fn try_from(record: RankedResourceRecord) -> Result<Self, Self::Error> {
        let resource = CommunityResource {
            id: record.id,
            title: record.title,
            description: record.description,
            author_id: record.author_id,
            version: record.version,
            tags: serde_json::from_str(&record.tags)?,
            category: record.category,
            rating: record.rating,
            rating_count: record.rating_count,
            download_count: record.download_count,
            install_count: record.install_count,
            favorite_count: record.favorite_count,
            like_count: 0,
            dislike_count: 0,
            resource_type: ResourceType::parse(&record.resource_type).map_err(SearchError::Resource)?,
            cover_path: record.cover_path,
            license: record.license,
            visibility: ResourceVisibility::parse(&record.visibility)
                .map_err(SearchError::Resource)?,
            status: ResourceStatus::parse(&record.status).map_err(SearchError::Resource)?,
            resource_size: record.resource_size,
            package_path: record.package_path,
            manifest_json: serde_json::from_str(&record.manifest_json)?,
            latest_version_id: record.latest_version_id,
            created_at: record.created_at,
            updated_at: record.updated_at,
            published_at: record.published_at,
            deleted_at: record.deleted_at,
        };

        Ok(Self {
            resource,
            rank: normalize_rank(record.rank_score),
        })
    }
}

impl TryFrom<NewsSearchRecord> for NewsSearchHit {
    type Error = SearchError;

    fn try_from(record: NewsSearchRecord) -> Result<Self, Self::Error> {
        Ok(Self {
            id: record.id,
            source_id: record.source_id,
            title: record.title,
            summary: record.summary,
            link: record.link,
            tags: serde_json::from_str(&record.tags)?,
            published_at: record.published_at,
            rank: normalize_rank(record.rank_score),
        })
    }
}

fn normalize_rank(bm25_score: f64) -> f64 {
    // FTS5 bm25() returns lower values for better matches; invert for API consumers.
    -bm25_score
}

pub fn build_fts_match_query(raw: &str) -> Option<String> {
    let terms: Vec<String> = raw
        .split_whitespace()
        .map(|term| term.trim_matches('"'))
        .filter(|term| !term.is_empty())
        .map(|term| format!("\"{}\"", term.replace('"', "\"\"")))
        .collect();

    if terms.is_empty() {
        None
    } else {
        Some(terms.join(" "))
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use serde_json::json;
    use uuid::Uuid;

    use super::*;
    use crate::db::{init_pool, seed::DEFAULT_ADMIN_USER_ID};
    use crate::domain::CreateResourceInput;
    use crate::repositories::ResourceRepository;

    fn temp_db_path() -> PathBuf {
        std::env::temp_dir().join(format!("toolman-search-{}.db", Uuid::new_v4()))
    }

    async fn seeded_search() -> (SearchService, ResourceRepository, PathBuf) {
        let db_path = temp_db_path();
        let pool = init_pool(&db_path).await.expect("init pool");
        let repo = ResourceRepository::new(pool.clone());
        let search = SearchService::new(pool);
        (search, repo, db_path)
    }

    fn sample_mcp_manifest() -> serde_json::Value {
        json!({
            "schemaVersion": 1,
            "mcpId": "browser",
            "transport": "stdio",
            "command": "npx"
        })
    }

    async fn seed_news_article(pool: &SqlitePool, title: &str, summary: &str, tags: &str) -> String {
        let source_id = Uuid::new_v4().to_string();
        let article_id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().timestamp_millis();

        sqlx::query(
            r#"
            INSERT INTO community_rss_sources (
              id, title, feed_url, site_url, category, language, enabled,
              fetch_interval_minutes, created_at
            ) VALUES (?1, ?2, ?3, ?4, 'ai', 'en', 1, 60, ?5)
            "#,
        )
        .bind(&source_id)
        .bind("AI News")
        .bind(format!("https://example.com/feed/{source_id}.xml"))
        .bind("https://example.com")
        .bind(now)
        .execute(pool)
        .await
        .expect("insert source");

        sqlx::query(
            r#"
            INSERT INTO community_news_articles (
              id, source_id, guid, title, summary, link, tags, published_at, fetched_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)
            "#,
        )
        .bind(&article_id)
        .bind(&source_id)
        .bind(format!("guid-{article_id}"))
        .bind(title)
        .bind(summary)
        .bind("https://example.com/article")
        .bind(tags)
        .bind(now)
        .execute(pool)
        .await
        .expect("insert article");

        article_id
    }

    #[tokio::test]
    async fn search_resources_by_keyword_orders_by_relevance() {
        let (search, repo, db_path) = seeded_search().await;

        repo.create(CreateResourceInput {
            title: "Filesystem MCP".to_string(),
            description: Some("Local file browsing tools".to_string()),
            author_id: DEFAULT_ADMIN_USER_ID.to_string(),
            resource_type: ResourceType::Mcp,
            version: None,
            tags: Some(vec!["filesystem".to_string()]),
            category: None,
            license: None,
            visibility: None,
            status: Some(ResourceStatus::Published),
            cover_path: None,
            package_path: None,
            resource_size: None,
            manifest: sample_mcp_manifest(),
        })
        .await
        .expect("create filesystem");

        repo.create(CreateResourceInput {
            title: "Browser MCP".to_string(),
            description: Some("Playwright browser automation".to_string()),
            author_id: DEFAULT_ADMIN_USER_ID.to_string(),
            resource_type: ResourceType::Mcp,
            version: None,
            tags: Some(vec!["browser".to_string(), "playwright".to_string()]),
            category: None,
            license: None,
            visibility: None,
            status: Some(ResourceStatus::Published),
            cover_path: None,
            package_path: None,
            resource_size: None,
            manifest: json!({
                "schemaVersion": 1,
                "mcpId": "browser",
                "transport": "stdio",
                "command": "npx"
            }),
        })
        .await
        .expect("create browser");

        let hits = search
            .search_resources(&ResourceSearchFilter {
                q: "Playwright browser".to_string(),
                sort: SearchSort::Relevance,
                ..Default::default()
            })
            .await
            .expect("search resources");

        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].resource.title, "Browser MCP");
        assert!(hits[0].rank > 0.0);

        search.pool().close().await;
        let _ = std::fs::remove_file(db_path);
    }

    #[tokio::test]
    async fn search_resources_supports_rating_sort() {
        let (search, repo, db_path) = seeded_search().await;

        let low = repo
            .create(CreateResourceInput {
                title: "Low Rated Skill".to_string(),
                description: Some("LangGraph helper".to_string()),
                author_id: DEFAULT_ADMIN_USER_ID.to_string(),
                resource_type: ResourceType::Skill,
                version: None,
                tags: None,
                category: None,
                license: None,
                visibility: None,
                status: Some(ResourceStatus::Published),
                cover_path: None,
                package_path: None,
                resource_size: None,
                manifest: json!({
                    "schemaVersion": 1,
                    "skillId": "low",
                    "name": "Low",
                    "description": "Low"
                }),
            })
            .await
            .expect("create low");

        let high = repo
            .create(CreateResourceInput {
                title: "Top Rated Skill".to_string(),
                description: Some("LangGraph helper".to_string()),
                author_id: DEFAULT_ADMIN_USER_ID.to_string(),
                resource_type: ResourceType::Skill,
                version: None,
                tags: None,
                category: None,
                license: None,
                visibility: None,
                status: Some(ResourceStatus::Published),
                cover_path: None,
                package_path: None,
                resource_size: None,
                manifest: json!({
                    "schemaVersion": 1,
                    "skillId": "high",
                    "name": "High",
                    "description": "High"
                }),
            })
            .await
            .expect("create high");

        sqlx::query("UPDATE community_resources SET rating = 2.0, rating_count = 1 WHERE id = ?1")
            .bind(&low.id)
            .execute(search.pool())
            .await
            .expect("rate low");
        sqlx::query("UPDATE community_resources SET rating = 4.8, rating_count = 20 WHERE id = ?1")
            .bind(&high.id)
            .execute(search.pool())
            .await
            .expect("rate high");

        let hits = search
            .search_resources(&ResourceSearchFilter {
                q: "LangGraph".to_string(),
                sort: SearchSort::Rating,
                ..Default::default()
            })
            .await
            .expect("search by rating");

        assert_eq!(hits.len(), 2);
        assert_eq!(hits[0].resource.title, "Top Rated Skill");

        search.pool().close().await;
        let _ = std::fs::remove_file(db_path);
    }

    #[tokio::test]
    async fn unified_search_returns_resources_and_news() {
        let (search, repo, db_path) = seeded_search().await;

        repo.create(CreateResourceInput {
            title: "LangGraph Workflow Pack".to_string(),
            description: Some("Automation templates".to_string()),
            author_id: DEFAULT_ADMIN_USER_ID.to_string(),
            resource_type: ResourceType::Workflow,
            version: None,
            tags: Some(vec!["langgraph".to_string()]),
            category: None,
            license: None,
            visibility: None,
            status: Some(ResourceStatus::Published),
            cover_path: None,
            package_path: None,
            resource_size: None,
            manifest: json!({
                "schemaVersion": 1,
                "workflowId": "pack",
                "engine": "langgraph",
                "graphPath": "workflow.json"
            }),
        })
        .await
        .expect("create workflow");

        seed_news_article(
            search.pool(),
            "LangGraph releases new runtime",
            "Latest LangGraph runtime improvements",
            r#"["langgraph","ai"]"#,
        )
        .await;

        let hits = search
            .search_unified(&UnifiedSearchQuery {
                q: "LangGraph".to_string(),
                ..Default::default()
            })
            .await
            .expect("unified search");

        assert_eq!(hits.len(), 2);
        assert!(hits.iter().any(|hit| hit.target_type == SearchTargetType::Resource));
        assert!(hits.iter().any(|hit| hit.target_type == SearchTargetType::News));

        search.pool().close().await;
        let _ = std::fs::remove_file(db_path);
    }

    #[test]
    fn build_fts_match_query_quotes_terms() {
        let query = build_fts_match_query("playwright browser").expect("query");
        assert_eq!(query, "\"playwright\" \"browser\"");
    }
}
