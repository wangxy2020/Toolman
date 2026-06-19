use sqlx::SqlitePool;
use uuid::Uuid;

use serde::Serialize;
use serde_json::{json, Value};

use crate::domain::{
    CommunityResource, CommunityUser, CreateResourceInput, ResourceStatus, ResourceType,
    ResourceVisibility, UpdateResourceInput, UserPermission, UserRole,
};
use crate::repositories::resource_repository::{RepositoryError, ResourceRepository};
use crate::repositories::user_repository::UserRepositoryError;
use crate::repositories::version_repository::VersionRepositoryError;
use crate::repositories::{UserRepository, VersionRepository};
use crate::services::search_service::{ResourceSearchFilter, SearchService, SearchSort};

#[derive(Debug, Clone, Default)]
pub struct MarketplaceListQuery {
    pub resource_type: Option<ResourceType>,
    pub category: Option<String>,
    pub tags: Option<Vec<String>>,
    pub q: Option<String>,
    pub sort: SearchSort,
    pub visibility: Option<ResourceVisibility>,
    pub status: Option<ResourceStatus>,
    pub limit: i64,
    pub offset: i64,
}

#[derive(Debug, Clone)]
pub struct CreateMarketplaceDraftInput {
    pub title: String,
    pub description: Option<String>,
    pub resource_type: ResourceType,
    pub tags: Option<Vec<String>>,
    pub category: Option<String>,
    pub license: Option<String>,
    pub visibility: Option<ResourceVisibility>,
}

#[derive(Debug, Clone)]
pub struct UpdateMarketplaceResourceInput {
    pub title: Option<String>,
    pub description: Option<String>,
    pub tags: Option<Vec<String>>,
    pub category: Option<String>,
    pub license: Option<String>,
    pub visibility: Option<ResourceVisibility>,
    pub status: Option<ResourceStatus>,
}

#[derive(Debug, Clone, Serialize)]
pub struct MarketplaceAuthorSummary {
    pub id: String,
    pub display_name: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct MarketplaceResourceItem {
    pub id: String,
    pub title: String,
    pub description: String,
    pub author: MarketplaceAuthorSummary,
    pub version: String,
    pub tags: Vec<String>,
    pub category: String,
    pub rating: f64,
    pub rating_count: i64,
    pub download_count: i64,
    pub install_count: i64,
    pub favorite_count: i64,
    pub like_count: i64,
    pub dislike_count: i64,
    pub resource_type: String,
    pub cover_url: Option<String>,
    pub license: String,
    pub visibility: String,
    pub status: String,
    pub resource_size: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct MarketplaceVersionSummary {
    pub id: String,
    pub version: String,
    pub changelog: Option<String>,
    pub resource_size: i64,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct MarketplaceResourceDetail {
    #[serde(flatten)]
    pub item: MarketplaceResourceItem,
    pub manifest_json: Value,
    pub versions: Vec<MarketplaceVersionSummary>,
}

#[derive(Debug, Clone, Serialize)]
pub struct MarketplaceVersionDetail {
    pub id: String,
    pub resource_id: String,
    pub version: String,
    pub changelog: Option<String>,
    pub package_path: String,
    pub manifest_json: Value,
    pub resource_size: i64,
    pub sha256: String,
    pub created_at: i64,
}

#[derive(Debug, thiserror::Error)]
pub enum MarketplaceError {
    #[error("forbidden")]
    Forbidden,
    #[error("resource not found: {0}")]
    NotFound(String),
    #[error("validation error: {0}")]
    Validation(String),
    #[error("repository error: {0}")]
    Repository(#[from] RepositoryError),
    #[error("version repository error: {0}")]
    VersionRepository(#[from] VersionRepositoryError),
    #[error("user repository error: {0}")]
    UserRepository(#[from] UserRepositoryError),
    #[error("search error: {0}")]
    Search(#[from] crate::services::SearchError),
}

pub struct MarketplaceService {
    pool: SqlitePool,
}

impl MarketplaceService {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn list_resources(
        &self,
        query: &MarketplaceListQuery,
    ) -> Result<Vec<MarketplaceResourceItem>, MarketplaceError> {
        let q = query.q.clone().unwrap_or_default();
        let search = SearchService::new(self.pool.clone());
        let ranked = search
            .search_resources(&ResourceSearchFilter {
                q,
                resource_type: query.resource_type,
                category: query.category.clone(),
                status: query.status.or(Some(ResourceStatus::Published)),
                visibility: query.visibility.or(Some(ResourceVisibility::Public)),
                sort: query.sort,
                limit: query.limit,
                offset: query.offset,
            })
            .await?;

        let mut resources: Vec<CommunityResource> =
            ranked.into_iter().map(|hit| hit.resource).collect();

        if let Some(tags) = &query.tags {
            resources.retain(|resource| {
                tags.iter()
                    .all(|tag| resource.tags.iter().any(|value| value == tag))
            });
        }

        let mut items = Vec::with_capacity(resources.len());
        for resource in resources {
            items.push(self.to_list_item(resource).await?);
        }
        Ok(items)
    }

    pub async fn get_resource(&self, id: &str) -> Result<MarketplaceResourceDetail, MarketplaceError> {
        let resource = self.require_visible_resource(id).await?;
        let item = self.to_list_item(resource.clone()).await?;
        let versions = VersionRepository::new(self.pool.clone())
            .list_for_resource(id)
            .await?
            .into_iter()
            .map(|version| MarketplaceVersionSummary {
                id: version.id,
                version: version.version,
                changelog: version.changelog,
                resource_size: version.resource_size,
                created_at: version.created_at,
            })
            .collect();

        Ok(MarketplaceResourceDetail {
            item,
            manifest_json: resource.manifest_json,
            versions,
        })
    }

    pub async fn list_versions(
        &self,
        resource_id: &str,
    ) -> Result<Vec<MarketplaceVersionSummary>, MarketplaceError> {
        self.require_visible_resource(resource_id).await?;
        let versions = VersionRepository::new(self.pool.clone())
            .list_for_resource(resource_id)
            .await?;

        Ok(versions
            .into_iter()
            .map(|version| MarketplaceVersionSummary {
                id: version.id,
                version: version.version,
                changelog: version.changelog,
                resource_size: version.resource_size,
                created_at: version.created_at,
            })
            .collect())
    }

    pub async fn get_version(
        &self,
        resource_id: &str,
        version: &str,
    ) -> Result<MarketplaceVersionDetail, MarketplaceError> {
        self.require_visible_resource(resource_id).await?;
        let record = VersionRepository::new(self.pool.clone())
            .find_by_resource_and_version(resource_id, version)
            .await?
            .ok_or_else(|| MarketplaceError::NotFound(format!("{resource_id}@{version}")))?;

        Ok(MarketplaceVersionDetail {
            id: record.id,
            resource_id: record.resource_id,
            version: record.version,
            changelog: record.changelog,
            package_path: record.package_path,
            manifest_json: record.manifest_json,
            resource_size: record.resource_size,
            sha256: record.sha256,
            created_at: record.created_at,
        })
    }

    pub async fn create_draft(
        &self,
        actor: &CommunityUser,
        input: CreateMarketplaceDraftInput,
    ) -> Result<MarketplaceResourceItem, MarketplaceError> {
        actor
            .ensure_permission(UserPermission::CreateResource)
            .map_err(|_| MarketplaceError::Forbidden)?;
        ensure_not_banned(actor)?;

        if input.title.trim().is_empty() {
            return Err(MarketplaceError::Validation("title must not be empty".into()));
        }

        let manifest = draft_manifest_for_type(input.resource_type);
        let resource = ResourceRepository::new(self.pool.clone())
            .create(CreateResourceInput {
                title: input.title,
                description: input.description,
                author_id: actor.id.clone(),
                resource_type: input.resource_type,
                version: Some("0.0.0".to_string()),
                tags: input.tags,
                category: input.category,
                license: input.license,
                visibility: input.visibility,
                status: Some(ResourceStatus::Draft),
                cover_path: None,
                package_path: None,
                resource_size: None,
                manifest,
            })
            .await?;

        self.to_list_item(resource).await
    }

    pub async fn update_resource(
        &self,
        actor: &CommunityUser,
        id: &str,
        input: UpdateMarketplaceResourceInput,
    ) -> Result<MarketplaceResourceItem, MarketplaceError> {
        ensure_not_banned(actor)?;
        let current = self.require_resource(id).await?;
        ensure_author_or_admin(actor, &current.author_id)?;

        let resource = ResourceRepository::new(self.pool.clone())
            .update(
                id,
                UpdateResourceInput {
                    title: input.title,
                    description: input.description,
                    tags: input.tags,
                    category: input.category,
                    license: input.license,
                    visibility: input.visibility,
                    status: input.status,
                    ..Default::default()
                },
            )
            .await?;

        self.to_list_item(resource).await
    }

    pub async fn delete_resource(&self, actor: &CommunityUser, id: &str) -> Result<(), MarketplaceError> {
        ensure_not_banned(actor)?;
        let resource = self.require_resource(id).await?;
        ensure_author_or_admin(actor, &resource.author_id)?;

        let deleted = ResourceRepository::new(self.pool.clone())
            .soft_delete(id)
            .await?;

        if deleted {
            Ok(())
        } else {
            Err(MarketplaceError::NotFound(id.to_string()))
        }
    }

    async fn require_resource(&self, id: &str) -> Result<CommunityResource, MarketplaceError> {
        let resource = ResourceRepository::new(self.pool.clone())
            .find_by_id(id)
            .await?
            .ok_or_else(|| MarketplaceError::NotFound(id.to_string()))?;

        if resource.deleted_at.is_some() {
            return Err(MarketplaceError::NotFound(id.to_string()));
        }

        Ok(resource)
    }

    async fn require_visible_resource(&self, id: &str) -> Result<CommunityResource, MarketplaceError> {
        let resource = self.require_resource(id).await?;
        if resource.status != ResourceStatus::Published
            || resource.visibility != ResourceVisibility::Public
        {
            return Err(MarketplaceError::NotFound(id.to_string()));
        }
        Ok(resource)
    }

    async fn to_list_item(
        &self,
        resource: CommunityResource,
    ) -> Result<MarketplaceResourceItem, MarketplaceError> {
        let author = UserRepository::new(self.pool.clone())
            .find_by_id(&resource.author_id)
            .await?
            .ok_or_else(|| MarketplaceError::NotFound(resource.author_id.clone()))?;

        Ok(MarketplaceResourceItem {
            id: resource.id,
            title: resource.title,
            description: resource.description,
            author: MarketplaceAuthorSummary {
                id: author.id,
                display_name: author.display_name,
            },
            version: resource.version,
            tags: resource.tags,
            category: resource.category,
            rating: resource.rating,
            rating_count: resource.rating_count,
            download_count: resource.download_count,
            install_count: resource.install_count,
            favorite_count: resource.favorite_count,
            like_count: resource.like_count,
            dislike_count: resource.dislike_count,
            resource_type: resource.resource_type.as_str().to_string(),
            cover_url: cover_url_from_path(resource.cover_path),
            license: resource.license,
            visibility: resource.visibility.as_str().to_string(),
            status: resource.status.as_str().to_string(),
            resource_size: resource.resource_size,
            created_at: resource.created_at,
            updated_at: resource.updated_at,
        })
    }
}

fn cover_url_from_path(cover_path: Option<String>) -> Option<String> {
    cover_path.map(|path| {
        if path.starts_with('/') {
            path
        } else {
            format!("/assets/{path}")
        }
    })
}

fn draft_manifest_for_type(resource_type: ResourceType) -> Value {
    match resource_type {
        ResourceType::Mcp => json!({
            "schemaVersion": 1,
            "mcpId": format!("draft-{}", Uuid::new_v4()),
            "transport": "stdio",
            "command": "echo",
            "tools": []
        }),
        ResourceType::Skill => json!({
            "schemaVersion": 1,
            "skillId": format!("draft-{}", Uuid::new_v4()),
            "name": "Draft Skill",
            "description": "Draft"
        }),
        ResourceType::Workflow => json!({
            "schemaVersion": 1,
            "workflowId": format!("draft-{}", Uuid::new_v4()),
            "name": "Draft Workflow",
            "description": "Draft",
            "graph": { "nodes": [], "edges": [] }
        }),
        ResourceType::Task => json!({
            "schemaVersion": 1,
            "taskId": format!("draft-{}", Uuid::new_v4()),
            "name": "Draft Task",
            "description": "Draft"
        }),
        ResourceType::Knowledge => json!({
            "schemaVersion": 1,
            "name": "Draft Knowledge",
            "description": "Draft",
            "files": []
        }),
    }
}

fn ensure_author_or_admin(actor: &CommunityUser, author_id: &str) -> Result<(), MarketplaceError> {
    if actor.is_moderator() || actor.id == author_id {
        Ok(())
    } else {
        Err(MarketplaceError::Forbidden)
    }
}

fn ensure_not_banned(actor: &CommunityUser) -> Result<(), MarketplaceError> {
    actor.ensure_active().map_err(|_| MarketplaceError::Forbidden)
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use serde_json::json;
    use uuid::Uuid;

    use crate::db::init_pool;
    use crate::db::seed::DEFAULT_ADMIN_USER_ID;
    use crate::domain::{CreateResourceInput, ResourceStatus, ResourceType};
    use crate::repositories::{
        ResourceRepository, ReviewRepository, CreateReviewInput, UserRepository,
    };
    use crate::services::rating_service::RatingService;
    use crate::services::SearchSort;

    use super::*;

    fn temp_db_path() -> PathBuf {
        std::env::temp_dir().join(format!("toolman-marketplace-{}", Uuid::new_v4()))
    }

    #[tokio::test]
    async fn list_resources_filters_by_type_and_sorts_by_rating() {
        let db_path = temp_db_path();
        let pool = init_pool(&db_path).await.expect("init pool");
        let repo = ResourceRepository::new(pool.clone());
        let service = MarketplaceService::new(pool.clone());

        let low = repo
            .create(CreateResourceInput {
                title: "Low MCP".to_string(),
                description: Some("browser automation".to_string()),
                author_id: DEFAULT_ADMIN_USER_ID.to_string(),
                resource_type: ResourceType::Mcp,
                version: None,
                tags: Some(vec!["browser".to_string()]),
                category: Some("automation".to_string()),
                license: None,
                visibility: None,
                status: Some(ResourceStatus::Published),
                cover_path: None,
                package_path: None,
                resource_size: None,
                manifest: json!({
                    "schemaVersion": 1,
                    "mcpId": "low",
                    "transport": "stdio",
                    "command": "echo",
                    "tools": []
                }),
            })
            .await
            .expect("create low");

        let high = repo
            .create(CreateResourceInput {
                title: "High MCP".to_string(),
                description: Some("browser automation".to_string()),
                author_id: DEFAULT_ADMIN_USER_ID.to_string(),
                resource_type: ResourceType::Mcp,
                version: None,
                tags: Some(vec!["browser".to_string(), "mcp".to_string()]),
                category: Some("automation".to_string()),
                license: None,
                visibility: None,
                status: Some(ResourceStatus::Published),
                cover_path: None,
                package_path: None,
                resource_size: None,
                manifest: json!({
                    "schemaVersion": 1,
                    "mcpId": "high",
                    "transport": "stdio",
                    "command": "echo",
                    "tools": []
                }),
            })
            .await
            .expect("create high");

        sqlx::query("UPDATE community_resources SET rating = 2.0, rating_count = 1 WHERE id = ?1")
            .bind(&low.id)
            .execute(&pool)
            .await
            .expect("rate low");
        sqlx::query("UPDATE community_resources SET rating = 4.8, rating_count = 20 WHERE id = ?1")
            .bind(&high.id)
            .execute(&pool)
            .await
            .expect("rate high");

        let items = service
            .list_resources(&MarketplaceListQuery {
                resource_type: Some(ResourceType::Mcp),
                tags: Some(vec!["browser".to_string()]),
                sort: SearchSort::Rating,
                limit: 20,
                offset: 0,
                ..Default::default()
            })
            .await
            .expect("list");

        assert_eq!(items.len(), 2);
        assert_eq!(items[0].title, "High MCP");
        assert_eq!(items[0].resource_type, "mcp");

        pool.close().await;
        let _ = std::fs::remove_file(db_path);
    }

    #[tokio::test]
    async fn rating_service_refreshes_after_review_upsert() {
        let db_path = temp_db_path();
        let pool = init_pool(&db_path).await.expect("init pool");
        let repo = ResourceRepository::new(pool.clone());
        let review_repo = ReviewRepository::new(pool.clone());
        let rating = RatingService::new(pool.clone());

        let resource = repo
            .create(CreateResourceInput {
                title: "Reviewed Skill".to_string(),
                description: Some("skill".to_string()),
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
                    "skillId": "reviewed",
                    "name": "Reviewed",
                    "description": "Reviewed"
                }),
            })
            .await
            .expect("create");

        let user = UserRepository::new(pool.clone())
            .find_or_create_by_identity_id(&Uuid::new_v4().to_string(), Some("Reviewer"))
            .await
            .expect("user");

        review_repo
            .create(CreateReviewInput {
                resource_id: resource.id.clone(),
                user_id: user.id,
                rating: 5,
                title: None,
                body: Some("Excellent".into()),
            })
            .await
            .expect("review");

        let summary = rating
            .refresh_resource_rating(&resource.id)
            .await
            .expect("refresh");
        assert!((summary.rating - 5.0).abs() < f64::EPSILON);
        assert_eq!(summary.rating_count, 1);

        pool.close().await;
        let _ = std::fs::remove_file(db_path);
    }
}
