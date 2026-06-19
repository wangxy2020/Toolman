use sqlx::{QueryBuilder, Sqlite, SqlitePool};
use uuid::Uuid;

use crate::domain::{
    CommunityResource, CreateResourceInput, ResourceCounter, ResourceError, ResourceListFilter,
    ResourceStatus, ResourceType, ResourceVisibility, UpdateResourceInput,
    validate_manifest_for_type,
};

#[derive(Debug, thiserror::Error)]
pub enum RepositoryError {
    #[error("resource not found: {0}")]
    NotFound(String),
    #[error("resource validation failed: {0}")]
    Validation(#[from] ResourceError),
    #[error("counter delta must be positive")]
    InvalidCounterDelta,
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
    #[error("serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
}

#[derive(Clone)]
pub struct ResourceRepository {
    pool: SqlitePool,
}

#[derive(sqlx::FromRow)]
struct ResourceRecord {
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
    like_count: i64,
    dislike_count: i64,
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
}

const RESOURCE_SELECT: &str = r#"
SELECT
  id,
  title,
  description,
  author_id,
  version,
  tags,
  category,
  rating,
  rating_count,
  download_count,
  install_count,
  favorite_count,
  like_count,
  dislike_count,
  resource_type,
  cover_path,
  license,
  visibility,
  status,
  resource_size,
  package_path,
  manifest_json,
  latest_version_id,
  created_at,
  updated_at,
  published_at,
  deleted_at
FROM community_resources
"#;

impl ResourceRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub fn pool(&self) -> &SqlitePool {
        &self.pool
    }

    pub async fn create(&self, input: CreateResourceInput) -> Result<CommunityResource, RepositoryError> {
        input.validate()?;

        let id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().timestamp_millis();
        let description = input.description.unwrap_or_default();
        let version = input.version.unwrap_or_else(|| "1.0.0".to_string());
        let tags = serde_json::to_string(&input.tags.unwrap_or_default())?;
        let category = input.category.unwrap_or_else(|| "general".to_string());
        let license = input.license.unwrap_or_else(|| "MIT".to_string());
        let visibility = input.visibility.unwrap_or(ResourceVisibility::Public);
        let status = input.status.unwrap_or(ResourceStatus::Published);
        let resource_size = input.resource_size.unwrap_or(0);
        let manifest_json = serde_json::to_string(&input.manifest)?;
        let published_at = if status == ResourceStatus::Published {
            Some(now)
        } else {
            None
        };

        sqlx::query(
            r#"
            INSERT INTO community_resources (
              id,
              title,
              description,
              author_id,
              version,
              tags,
              category,
              resource_type,
              cover_path,
              license,
              visibility,
              status,
              resource_size,
              package_path,
              manifest_json,
              created_at,
              updated_at,
              published_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?16, ?17)
            "#,
        )
        .bind(&id)
        .bind(input.title.trim())
        .bind(&description)
        .bind(&input.author_id)
        .bind(&version)
        .bind(&tags)
        .bind(&category)
        .bind(input.resource_type.as_str())
        .bind(&input.cover_path)
        .bind(&license)
        .bind(visibility.as_str())
        .bind(status.as_str())
        .bind(resource_size)
        .bind(&input.package_path)
        .bind(&manifest_json)
        .bind(now)
        .bind(published_at)
        .execute(&self.pool)
        .await?;

        self.find_by_id(&id)
            .await?
            .ok_or_else(|| RepositoryError::NotFound(id))
    }

    pub async fn find_by_id(&self, id: &str) -> Result<Option<CommunityResource>, RepositoryError> {
        let query = format!("{RESOURCE_SELECT} WHERE id = ?1");
        let record = sqlx::query_as::<_, ResourceRecord>(&query)
            .bind(id)
            .fetch_optional(&self.pool)
            .await?;

        record.map(TryInto::try_into).transpose()
    }

    pub async fn list(
        &self,
        filter: &ResourceListFilter,
    ) -> Result<Vec<CommunityResource>, RepositoryError> {
        let mut builder = QueryBuilder::<Sqlite>::new(RESOURCE_SELECT);
        builder.push(" WHERE 1=1");

        if !filter.include_deleted {
            builder.push(" AND deleted_at IS NULL");
        }
        if let Some(resource_type) = filter.resource_type {
            builder.push(" AND resource_type = ");
            builder.push_bind(resource_type.as_str());
        }
        if let Some(status) = filter.status {
            builder.push(" AND status = ");
            builder.push_bind(status.as_str());
        }
        if let Some(author_id) = &filter.author_id {
            builder.push(" AND author_id = ");
            builder.push_bind(author_id);
        }
        if let Some(category) = &filter.category {
            builder.push(" AND category = ");
            builder.push_bind(category);
        }
        if let Some(visibility) = filter.visibility {
            builder.push(" AND visibility = ");
            builder.push_bind(visibility.as_str());
        }
        if let Some(tags) = &filter.tags {
            for tag in tags {
                builder.push(" AND tags LIKE ");
                builder.push_bind(format!("%\"{tag}\"%"));
            }
        }

        builder.push(" ORDER BY created_at DESC");

        if let Some(limit) = filter.limit {
            builder.push(" LIMIT ");
            builder.push_bind(limit);
        }
        if let Some(offset) = filter.offset {
            builder.push(" OFFSET ");
            builder.push_bind(offset);
        }

        let records = builder
            .build_query_as::<ResourceRecord>()
            .fetch_all(&self.pool)
            .await?;

        records.into_iter().map(TryInto::try_into).collect()
    }

    pub async fn count_published_online(
        &self,
        resource_type: ResourceType,
    ) -> Result<i64, RepositoryError> {
        let count: (i64,) = sqlx::query_as(
            r#"
            SELECT COUNT(*)
            FROM community_resources
            WHERE status = 'published'
              AND visibility = 'public'
              AND resource_type = ?1
              AND deleted_at IS NULL
            "#,
        )
        .bind(resource_type.as_str())
        .fetch_one(&self.pool)
        .await?;

        Ok(count.0)
    }

    pub async fn update(
        &self,
        id: &str,
        input: UpdateResourceInput,
    ) -> Result<CommunityResource, RepositoryError> {
        let current = self
            .find_by_id(id)
            .await?
            .ok_or_else(|| RepositoryError::NotFound(id.to_string()))?;

        if current.deleted_at.is_some() {
            return Err(RepositoryError::NotFound(id.to_string()));
        }

        if let Some(manifest) = &input.manifest {
            validate_manifest_for_type(current.resource_type, manifest)
                .map_err(ResourceError::Manifest)?;
        }

        let now = chrono::Utc::now().timestamp_millis();
        let title = input.title.unwrap_or(current.title);
        let description = input.description.unwrap_or(current.description);
        let version = input.version.unwrap_or(current.version);
        let tags = serde_json::to_string(&input.tags.unwrap_or(current.tags))?;
        let category = input.category.unwrap_or(current.category);
        let license = input.license.unwrap_or(current.license);
        let visibility = input.visibility.unwrap_or(current.visibility);
        let status = input.status.unwrap_or(current.status);
        let cover_path = input.cover_path.unwrap_or(current.cover_path);
        let package_path = input.package_path.unwrap_or(current.package_path);
        let resource_size = input.resource_size.unwrap_or(current.resource_size);
        let manifest_json = serde_json::to_string(&input.manifest.unwrap_or(current.manifest_json))?;
        let latest_version_id = input
            .latest_version_id
            .unwrap_or(current.latest_version_id);

        let published_at = match (current.published_at, status) {
            (None, ResourceStatus::Published) => Some(now),
            (Some(value), _) if status == ResourceStatus::Published => Some(value),
            _ if status == ResourceStatus::Published => current.published_at.or(Some(now)),
            _ => current.published_at,
        };

        let rows = sqlx::query(
            r#"
            UPDATE community_resources
            SET
              title = ?1,
              description = ?2,
              version = ?3,
              tags = ?4,
              category = ?5,
              license = ?6,
              visibility = ?7,
              status = ?8,
              cover_path = ?9,
              package_path = ?10,
              resource_size = ?11,
              manifest_json = ?12,
              latest_version_id = ?13,
              updated_at = ?14,
              published_at = ?15
            WHERE id = ?16 AND deleted_at IS NULL
            "#,
        )
        .bind(title.trim())
        .bind(&description)
        .bind(&version)
        .bind(&tags)
        .bind(&category)
        .bind(&license)
        .bind(visibility.as_str())
        .bind(status.as_str())
        .bind(&cover_path)
        .bind(&package_path)
        .bind(resource_size)
        .bind(&manifest_json)
        .bind(&latest_version_id)
        .bind(now)
        .bind(published_at)
        .bind(id)
        .execute(&self.pool)
        .await?
        .rows_affected();

        if rows == 0 {
            return Err(RepositoryError::NotFound(id.to_string()));
        }

        self.find_by_id(id)
            .await?
            .ok_or_else(|| RepositoryError::NotFound(id.to_string()))
    }

    pub async fn soft_delete(&self, id: &str) -> Result<bool, RepositoryError> {
        let now = chrono::Utc::now().timestamp_millis();
        let rows = sqlx::query(
            r#"
            UPDATE community_resources
            SET deleted_at = ?1, updated_at = ?1, status = 'archived'
            WHERE id = ?2 AND deleted_at IS NULL
            "#,
        )
        .bind(now)
        .bind(id)
        .execute(&self.pool)
        .await?
        .rows_affected();

        Ok(rows > 0)
    }

    pub async fn update_rating(
        &self,
        id: &str,
        rating: f64,
        rating_count: i64,
    ) -> Result<(), RepositoryError> {
        let now = chrono::Utc::now().timestamp_millis();
        let rows = sqlx::query(
            r#"
            UPDATE community_resources
            SET rating = ?1, rating_count = ?2, updated_at = ?3
            WHERE id = ?4 AND deleted_at IS NULL
            "#,
        )
        .bind(rating)
        .bind(rating_count)
        .bind(now)
        .bind(id)
        .execute(&self.pool)
        .await?
        .rows_affected();

        if rows == 0 {
            return Err(RepositoryError::NotFound(id.to_string()));
        }

        Ok(())
    }

    pub async fn increment_counter(
        &self,
        id: &str,
        counter: ResourceCounter,
        delta: i64,
    ) -> Result<i64, RepositoryError> {
        if delta <= 0 {
            return Err(RepositoryError::InvalidCounterDelta);
        }

        let column = counter.column();
        let now = chrono::Utc::now().timestamp_millis();
        let query = format!(
            "UPDATE community_resources SET {column} = {column} + ?1, updated_at = ?2 WHERE id = ?3 AND deleted_at IS NULL"
        );

        let rows = sqlx::query(&query)
            .bind(delta)
            .bind(now)
            .bind(id)
            .execute(&self.pool)
            .await?
            .rows_affected();

        if rows == 0 {
            return Err(RepositoryError::NotFound(id.to_string()));
        }

        let count_query = format!("SELECT {column} FROM community_resources WHERE id = ?1");
        let value: (i64,) = sqlx::query_as(&count_query)
            .bind(id)
            .fetch_one(&self.pool)
            .await?;

        Ok(value.0)
    }

    pub async fn decrement_counter(
        &self,
        id: &str,
        counter: ResourceCounter,
    ) -> Result<i64, RepositoryError> {
        let column = counter.column();
        let now = chrono::Utc::now().timestamp_millis();
        let query = format!(
            r#"
            UPDATE community_resources
            SET {column} = CASE WHEN {column} > 0 THEN {column} - 1 ELSE 0 END,
                updated_at = ?1
            WHERE id = ?2 AND deleted_at IS NULL
            "#
        );

        let rows = sqlx::query(&query)
            .bind(now)
            .bind(id)
            .execute(&self.pool)
            .await?
            .rows_affected();

        if rows == 0 {
            return Err(RepositoryError::NotFound(id.to_string()));
        }

        let count_query = format!("SELECT {column} FROM community_resources WHERE id = ?1");
        let value: (i64,) = sqlx::query_as(&count_query)
            .bind(id)
            .fetch_one(&self.pool)
            .await?;

        Ok(value.0)
    }
}

impl TryFrom<ResourceRecord> for CommunityResource {
    type Error = RepositoryError;

    fn try_from(record: ResourceRecord) -> Result<Self, Self::Error> {
        Ok(Self {
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
            like_count: record.like_count,
            dislike_count: record.dislike_count,
            resource_type: ResourceType::parse(&record.resource_type)?,
            cover_path: record.cover_path,
            license: record.license,
            visibility: ResourceVisibility::parse(&record.visibility)?,
            status: ResourceStatus::parse(&record.status)?,
            resource_size: record.resource_size,
            package_path: record.package_path,
            manifest_json: serde_json::from_str(&record.manifest_json)?,
            latest_version_id: record.latest_version_id,
            created_at: record.created_at,
            updated_at: record.updated_at,
            published_at: record.published_at,
            deleted_at: record.deleted_at,
        })
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use serde_json::json;

    use super::*;
    use crate::db::{init_pool, seed::DEFAULT_ADMIN_USER_ID};

    fn temp_db_path() -> PathBuf {
        std::env::temp_dir().join(format!(
            "toolman-community-repo-{}.db",
            Uuid::new_v4()
        ))
    }

    async fn test_repo() -> (ResourceRepository, PathBuf) {
        let db_path = temp_db_path();
        let pool = init_pool(&db_path).await.expect("init pool");
        (ResourceRepository::new(pool), db_path)
    }

    fn sample_mcp_manifest() -> serde_json::Value {
        json!({
            "schemaVersion": 1,
            "mcpId": "filesystem",
            "transport": "stdio",
            "command": "npx",
            "args": ["-y", "@modelcontextprotocol/server-filesystem"]
        })
    }

    #[tokio::test]
    async fn creates_and_finds_resource() {
        let (repo, db_path) = test_repo().await;

        let created = repo
            .create(CreateResourceInput {
                title: "Filesystem MCP".to_string(),
                description: Some("Local file access".to_string()),
                author_id: DEFAULT_ADMIN_USER_ID.to_string(),
                resource_type: ResourceType::Mcp,
                version: None,
                tags: Some(vec!["mcp".to_string(), "filesystem".to_string()]),
                category: None,
                license: None,
                visibility: None,
                status: None,
                cover_path: None,
                package_path: None,
                resource_size: None,
                manifest: sample_mcp_manifest(),
            })
            .await
            .expect("create resource");

        assert_eq!(created.title, "Filesystem MCP");
        assert_eq!(created.resource_type, ResourceType::Mcp);
        assert_eq!(created.status, ResourceStatus::Published);
        assert!(created.published_at.is_some());

        let found = repo
            .find_by_id(&created.id)
            .await
            .expect("find")
            .expect("resource exists");

        assert_eq!(found.id, created.id);
        assert_eq!(found.tags.len(), 2);

        repo.pool().close().await;
        let _ = std::fs::remove_file(db_path);
    }

    #[tokio::test]
    async fn lists_resources_with_filters() {
        let (repo, db_path) = test_repo().await;

        repo.create(CreateResourceInput {
            title: "Skill Alpha".to_string(),
            description: None,
            author_id: DEFAULT_ADMIN_USER_ID.to_string(),
            resource_type: ResourceType::Skill,
            version: None,
            tags: None,
            category: Some("automation".to_string()),
            license: None,
            visibility: None,
            status: Some(ResourceStatus::Published),
            cover_path: None,
            package_path: None,
            resource_size: None,
            manifest: json!({
                "schemaVersion": 1,
                "skillId": "alpha",
                "name": "Alpha",
                "description": "Demo skill"
            }),
        })
        .await
        .expect("create skill");

        let items = repo
            .list(&ResourceListFilter {
                resource_type: Some(ResourceType::Skill),
                status: Some(ResourceStatus::Published),
                author_id: Some(DEFAULT_ADMIN_USER_ID.to_string()),
                category: Some("automation".to_string()),
                include_deleted: false,
                limit: Some(10),
                offset: None,
                ..Default::default()
            })
            .await
            .expect("list");

        assert_eq!(items.len(), 1);
        assert_eq!(items[0].title, "Skill Alpha");

        repo.pool().close().await;
        let _ = std::fs::remove_file(db_path);
    }

    #[tokio::test]
    async fn soft_delete_hides_resource_from_default_list() {
        let (repo, db_path) = test_repo().await;

        let created = repo
            .create(CreateResourceInput {
                title: "Temporary Workflow".to_string(),
                description: None,
                author_id: DEFAULT_ADMIN_USER_ID.to_string(),
                resource_type: ResourceType::Workflow,
                version: None,
                tags: None,
                category: None,
                license: None,
                visibility: None,
                status: None,
                cover_path: None,
                package_path: None,
                resource_size: None,
                manifest: json!({
                    "schemaVersion": 1,
                    "workflowId": "temp",
                    "engine": "langgraph",
                    "graphPath": "workflow.json"
                }),
            })
            .await
            .expect("create workflow");

        assert!(repo.soft_delete(&created.id).await.expect("soft delete"));

        let hidden = repo.find_by_id(&created.id).await.expect("find").expect("row");
        assert!(hidden.deleted_at.is_some());
        assert_eq!(hidden.status, ResourceStatus::Archived);

        let visible = repo
            .list(&ResourceListFilter::default())
            .await
            .expect("list");
        assert!(visible.iter().all(|item| item.id != created.id));

        repo.pool().close().await;
        let _ = std::fs::remove_file(db_path);
    }

    #[tokio::test]
    async fn increments_download_counter() {
        let (repo, db_path) = test_repo().await;

        let created = repo
            .create(CreateResourceInput {
                title: "Downloadable MCP".to_string(),
                description: None,
                author_id: DEFAULT_ADMIN_USER_ID.to_string(),
                resource_type: ResourceType::Mcp,
                version: None,
                tags: None,
                category: None,
                license: None,
                visibility: None,
                status: None,
                cover_path: None,
                package_path: None,
                resource_size: None,
                manifest: sample_mcp_manifest(),
            })
            .await
            .expect("create");

        let count = repo
            .increment_counter(&created.id, ResourceCounter::Download, 2)
            .await
            .expect("increment");

        assert_eq!(count, 2);

        let updated = repo.find_by_id(&created.id).await.expect("find").expect("row");
        assert_eq!(updated.download_count, 2);

        repo.pool().close().await;
        let _ = std::fs::remove_file(db_path);
    }
}
