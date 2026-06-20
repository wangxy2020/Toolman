use std::sync::Arc;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::SqlitePool;
use uuid::Uuid;

use crate::config::HubConfig;
use crate::domain::{
    CommunityResource, CommunityUser, CreateResourceInput, McpManifest, ResourceListFilter,
    ResourceManifest, ResourceStatus, ResourceType, ResourceVisibility, UpdateResourceInput,
    UserPermission, UserRole,
};
use crate::repositories::resource_repository::{RepositoryError, ResourceRepository};
use crate::repositories::version_repository::{
    CreateVersionInput, VersionRepository, VersionRepositoryError,
};
use crate::repositories::UserRepository;
use crate::services::storage_service::{StorageService, StorePackageInput};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateMcpDraftInput {
    pub title: String,
    pub description: Option<String>,
    pub tags: Option<Vec<String>>,
    pub category: Option<String>,
    pub license: Option<String>,
    pub visibility: Option<ResourceVisibility>,
}

#[derive(Debug, Clone)]
pub struct PublishMcpPackageInput {
    pub resource_id: String,
    pub version: String,
    pub changelog: Option<String>,
    pub package_bytes: Vec<u8>,
    pub original_filename: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct McpListQuery {
    pub category: Option<String>,
    pub status: Option<ResourceStatus>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct McpAuthorSummary {
    pub id: String,
    pub display_name: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct McpMarketListItem {
    pub id: String,
    pub title: String,
    pub description: String,
    pub author: McpAuthorSummary,
    pub version: String,
    pub tags: Vec<String>,
    pub category: String,
    pub rating: f64,
    pub rating_count: i64,
    pub download_count: i64,
    pub install_count: i64,
    pub favorite_count: i64,
    pub license: String,
    pub visibility: String,
    pub status: String,
    pub resource_size: i64,
    pub tools_count: usize,
    pub created_at: i64,
    pub updated_at: i64,
    pub published_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct McpManifestResponse {
    pub schema_version: u32,
    pub mcp_id: String,
    pub transport: String,
    pub command: Option<String>,
    pub args: Vec<String>,
    pub env: Value,
    pub tools: Vec<crate::domain::McpToolManifest>,
    pub templates: Vec<Value>,
    pub config_schema: Value,
}

impl From<McpManifest> for McpManifestResponse {
    fn from(manifest: McpManifest) -> Self {
        Self {
            schema_version: manifest.schema_version,
            mcp_id: manifest.mcp_id,
            transport: manifest.transport,
            command: manifest.command,
            args: manifest.args,
            env: manifest.env,
            tools: manifest.tools,
            templates: manifest.templates,
            config_schema: manifest.config_schema,
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum McpMarketError {
    #[error("forbidden")]
    Forbidden,
    #[error("resource not found: {0}")]
    NotFound(String),
    #[error("resource is not an MCP package")]
    NotMcpResource,
    #[error("version conflict: {resource_id}@{version}")]
    VersionConflict { resource_id: String, version: String },
    #[error("validation error: {0}")]
    Validation(String),
    #[error("repository error: {0}")]
    Repository(#[from] RepositoryError),
    #[error("version repository error: {0}")]
    VersionRepository(#[from] VersionRepositoryError),
    #[error("storage error: {0}")]
    Storage(#[from] crate::services::StorageError),
    #[error("user repository error: {0}")]
    UserRepository(#[from] crate::repositories::UserRepositoryError),
}

pub struct McpMarketService {
    pool: SqlitePool,
    storage: StorageService,
    config: Arc<HubConfig>,
}

impl McpMarketService {
    pub fn new(config: Arc<HubConfig>, pool: SqlitePool) -> Self {
        let storage = StorageService::new(&config);
        Self {
            pool,
            storage,
            config,
        }
    }

    pub async fn list_mcps(
        &self,
        query: &McpListQuery,
    ) -> Result<Vec<McpMarketListItem>, McpMarketError> {
        let resources = ResourceRepository::new(self.pool.clone())
            .list(&ResourceListFilter {
                resource_type: Some(ResourceType::Mcp),
                status: query.status.or(Some(ResourceStatus::Published)),
                author_id: None,
                category: query.category.clone(),
                include_deleted: false,
                limit: query.limit.or(Some(20)),
                offset: query.offset.or(Some(0)),
                ..Default::default()
            })
            .await?;

        let mut items = Vec::with_capacity(resources.len());
        for resource in resources {
            items.push(self.to_list_item(resource).await?);
        }
        Ok(items)
    }

    pub async fn get_mcp(&self, id: &str) -> Result<McpMarketListItem, McpMarketError> {
        let resource = self.require_mcp_resource(id).await?;
        self.to_list_item(resource).await
    }

    pub async fn get_manifest(&self, id: &str) -> Result<McpManifestResponse, McpMarketError> {
        let resource = self.require_mcp_resource(id).await?;
        let manifest = parse_mcp_manifest(&resource.manifest_json)?;
        Ok(manifest.into())
    }

    pub async fn get_templates(&self, id: &str) -> Result<Vec<Value>, McpMarketError> {
        let manifest = self.get_manifest(id).await?;
        Ok(manifest.templates)
    }

    pub async fn create_draft(
        &self,
        actor: &CommunityUser,
        input: CreateMcpDraftInput,
    ) -> Result<CommunityResource, McpMarketError> {
        actor
            .ensure_permission(UserPermission::CreateResource)
            .map_err(|_| McpMarketError::Forbidden)?;
        ensure_not_banned(actor)?;

        if input.title.trim().is_empty() {
            return Err(McpMarketError::Validation("title must not be empty".into()));
        }

        let draft_mcp_id = format!("draft-{}", Uuid::new_v4());
        let manifest = json!({
            "schemaVersion": 1,
            "mcpId": draft_mcp_id,
            "transport": "stdio",
            "command": "echo",
            "tools": []
        });

        ResourceRepository::new(self.pool.clone())
            .create(CreateResourceInput {
                title: input.title,
                description: input.description,
                author_id: actor.id.clone(),
                resource_type: ResourceType::Mcp,
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
            .await
            .map_err(Into::into)
    }

    pub async fn publish_package(
        &self,
        actor: &CommunityUser,
        input: PublishMcpPackageInput,
    ) -> Result<CommunityResource, McpMarketError> {
        actor
            .ensure_permission(UserPermission::Publish)
            .map_err(|_| McpMarketError::Forbidden)?;
        ensure_not_banned(actor)?;

        let resource = self.require_mcp_resource(&input.resource_id).await?;
        ensure_author_or_admin(actor, &resource.author_id)?;

        let stored = self
            .storage
            .store_package(StorePackageInput {
                resource_id: &input.resource_id,
                resource_type: ResourceType::Mcp,
                version: &input.version,
                package_bytes: &input.package_bytes,
                original_filename: input.original_filename.as_deref(),
            })?;

        let manifest = parse_mcp_manifest(&stored.manifest)?;
        self.validate_published_manifest(&resource, &manifest)?;

        let version = VersionRepository::new(self.pool.clone())
            .create(CreateVersionInput {
                resource_id: input.resource_id.clone(),
                version: input.version.clone(),
                changelog: input.changelog,
                package_path: stored.package_path.clone(),
                manifest_json: stored.manifest.clone(),
                resource_size: stored.resource_size,
                sha256: stored.archive_sha256,
            })
            .await
            .map_err(|error| match error {
                VersionRepositoryError::Conflict {
                    resource_id,
                    version,
                } => McpMarketError::VersionConflict {
                    resource_id,
                    version,
                },
                other => other.into(),
            })?;

        let status = if self.config.require_review {
            ResourceStatus::PendingReview
        } else {
            ResourceStatus::Published
        };

        ResourceRepository::new(self.pool.clone())
            .update(
                &input.resource_id,
                UpdateResourceInput {
                    version: Some(input.version),
                    status: Some(status),
                    package_path: Some(Some(stored.package_path)),
                    resource_size: Some(stored.resource_size),
                    manifest: Some(stored.manifest),
                    latest_version_id: Some(Some(version.id)),
                    ..Default::default()
                },
            )
            .await
            .map_err(Into::into)
    }

    pub async fn unpublish(&self, actor: &CommunityUser, id: &str) -> Result<bool, McpMarketError> {
        actor
            .ensure_permission(UserPermission::Publish)
            .map_err(|_| McpMarketError::Forbidden)?;
        ensure_not_banned(actor)?;

        let resource = self.require_mcp_resource(id).await?;
        ensure_author_or_admin(actor, &resource.author_id)?;

        ResourceRepository::new(self.pool.clone())
            .soft_delete(id)
            .await
            .map_err(Into::into)
    }

    async fn require_mcp_resource(&self, id: &str) -> Result<CommunityResource, McpMarketError> {
        let resource = ResourceRepository::new(self.pool.clone())
            .find_by_id(id)
            .await?
            .ok_or_else(|| McpMarketError::NotFound(id.to_string()))?;

        if resource.deleted_at.is_some() {
            return Err(McpMarketError::NotFound(id.to_string()));
        }
        if resource.resource_type != ResourceType::Mcp {
            return Err(McpMarketError::NotMcpResource);
        }

        Ok(resource)
    }

    async fn to_list_item(&self, resource: CommunityResource) -> Result<McpMarketListItem, McpMarketError> {
        let manifest = parse_mcp_manifest(&resource.manifest_json).unwrap_or_else(|_| McpManifest {
            schema_version: 1,
            mcp_id: "unknown".to_string(),
            transport: "stdio".to_string(),
            command: None,
            args: Vec::new(),
            env: Value::Null,
            tools: Vec::new(),
            templates: Vec::new(),
            config_schema: Value::Null,
        });

        let author = UserRepository::new(self.pool.clone())
            .find_by_id(&resource.author_id)
            .await?
            .ok_or_else(|| McpMarketError::NotFound(resource.author_id.clone()))?;

        Ok(McpMarketListItem {
            id: resource.id,
            title: resource.title,
            description: resource.description,
            author: McpAuthorSummary {
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
            license: resource.license,
            visibility: resource.visibility.as_str().to_string(),
            status: resource.status.as_str().to_string(),
            resource_size: resource.resource_size,
            tools_count: manifest.tools.len(),
            created_at: resource.created_at,
            updated_at: resource.updated_at,
            published_at: resource.published_at,
        })
    }

    fn validate_published_manifest(
        &self,
        resource: &CommunityResource,
        manifest: &McpManifest,
    ) -> Result<(), McpMarketError> {
        if manifest.mcp_id.starts_with("draft-") {
            return Err(McpMarketError::Validation(
                "published MCP manifest must use a real mcpId".into(),
            ));
        }

        if resource.title.trim().is_empty() {
            return Err(McpMarketError::Validation("resource title is empty".into()));
        }

        Ok(())
    }
}

pub fn parse_mcp_manifest(value: &Value) -> Result<McpManifest, McpMarketError> {
    let manifest: McpManifest = serde_json::from_value(value.clone())
        .map_err(|error| McpMarketError::Validation(error.to_string()))?;
    manifest
        .validate()
        .map_err(|error| McpMarketError::Validation(error.to_string()))?;
    Ok(manifest)
}

fn ensure_author_or_admin(actor: &CommunityUser, author_id: &str) -> Result<(), McpMarketError> {
    if actor.is_moderator() || actor.id == author_id {
        Ok(())
    } else {
        Err(McpMarketError::Forbidden)
    }
}

fn ensure_not_banned(actor: &CommunityUser) -> Result<(), McpMarketError> {
    actor.ensure_active().map_err(|_| McpMarketError::Forbidden)
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;
    use std::sync::Arc;

    use super::*;
    use crate::db::{init_pool, DEFAULT_IDENTITY_ID};
    use crate::repositories::UserRepository;
    use crate::testing::build_test_package;

    fn temp_data_dir() -> PathBuf {
        std::env::temp_dir().join(format!("toolman-mcp-market-{}", Uuid::new_v4()))
    }

    fn hub_config(data_dir: &PathBuf) -> Arc<HubConfig> {
        Arc::new(HubConfig {
            data_dir: data_dir.clone(),
            port: 3721,
            host: "127.0.0.1",
            require_review: false,
            jwt_secret: None,
            packages_dir: data_dir.join("packages"),
            covers_dir: data_dir.join("covers"),
            deliveries_dir: data_dir.join("deliveries"),
            db_path: data_dir.join("community.db"),
            rss_sources_path: data_dir.join("rss-sources.json"),
        })
    }

    async fn test_service() -> (McpMarketService, CommunityUser, PathBuf) {
        let data_dir = temp_data_dir();
        std::fs::create_dir_all(&data_dir).expect("data dir");
        let config = hub_config(&data_dir);
        config.bootstrap().expect("bootstrap");
        let pool = init_pool(&config.db_path).await.expect("init");
        let user = UserRepository::new(pool.clone())
            .find_by_identity_id(DEFAULT_IDENTITY_ID)
            .await
            .expect("user")
            .expect("seeded admin");
        let service = McpMarketService::new(config, pool);
        (service, user, data_dir)
    }

    fn sample_manifest_json() -> String {
        json!({
            "schemaVersion": 1,
            "mcpId": "filesystem",
            "transport": "stdio",
            "command": "npx",
            "tools": [
                { "name": "read_file", "description": "Read a file" },
                { "name": "write_file", "description": "Write a file" }
            ],
            "templates": [{ "name": "default", "config": {} }]
        })
        .to_string()
    }

    #[tokio::test]
    async fn publishes_mcp_package_and_lists_it() {
        let (service, user, data_dir) = test_service().await;

        let draft = service
            .create_draft(
                &user,
                CreateMcpDraftInput {
                    title: "Filesystem MCP".to_string(),
                    description: Some("Local file tools".to_string()),
                    tags: Some(vec!["mcp".to_string(), "filesystem".to_string()]),
                    category: Some("automation".to_string()),
                    license: None,
                    visibility: None,
                },
            )
            .await
            .expect("create draft");

        let package_bytes =
            build_test_package(ResourceType::Mcp, &sample_manifest_json(), &[]);

        let published = service
            .publish_package(
                &user,
                PublishMcpPackageInput {
                    resource_id: draft.id.clone(),
                    version: "1.0.0".to_string(),
                    changelog: Some("Initial release".to_string()),
                    package_bytes,
                    original_filename: Some("filesystem.toolman-mcp".to_string()),
                },
            )
            .await
            .expect("publish");

        assert_eq!(published.status, ResourceStatus::Published);
        assert!(published.package_path.is_some());

        let items = service
            .list_mcps(&McpListQuery::default())
            .await
            .expect("list");

        assert_eq!(items.len(), 1);
        assert_eq!(items[0].title, "Filesystem MCP");
        assert_eq!(items[0].tools_count, 2);

        let manifest = service
            .get_manifest(&draft.id)
            .await
            .expect("manifest");
        assert_eq!(manifest.mcp_id, "filesystem");
        assert_eq!(manifest.tools.len(), 2);

        let templates = service.get_templates(&draft.id).await.expect("templates");
        assert_eq!(templates.len(), 1);

        let _ = std::fs::remove_dir_all(data_dir);
    }
}
