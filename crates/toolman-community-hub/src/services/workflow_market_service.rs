use std::sync::Arc;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::SqlitePool;
use uuid::Uuid;

use crate::config::HubConfig;
use crate::domain::{
    CommunityResource, CommunityUser, CreateResourceInput, ResourceListFilter, ResourceManifest,
    ResourceStatus, ResourceType, ResourceVisibility, UpdateResourceInput, UserPermission,
    UserRole, WorkflowManifest,
};
use crate::repositories::resource_repository::{RepositoryError, ResourceRepository};
use crate::repositories::version_repository::{
    CreateVersionInput, VersionRepository, VersionRepositoryError,
};
use crate::repositories::UserRepository;
use crate::services::storage_service::{StorageService, StorePackageInput};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateWorkflowDraftInput {
    pub title: String,
    pub description: Option<String>,
    pub tags: Option<Vec<String>>,
    pub category: Option<String>,
    pub license: Option<String>,
    pub visibility: Option<ResourceVisibility>,
}

#[derive(Debug, Clone)]
pub struct PublishWorkflowPackageInput {
    pub resource_id: String,
    pub version: String,
    pub changelog: Option<String>,
    pub package_bytes: Vec<u8>,
    pub original_filename: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct WorkflowListQuery {
    pub category: Option<String>,
    pub status: Option<ResourceStatus>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct WorkflowAuthorSummary {
    pub id: String,
    pub display_name: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct WorkflowMarketListItem {
    pub id: String,
    pub title: String,
    pub description: String,
    pub author: WorkflowAuthorSummary,
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
    pub workflow_id: String,
    pub engine: String,
    pub graph_path: String,
    pub node_count: usize,
    pub created_at: i64,
    pub updated_at: i64,
    pub published_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct WorkflowManifestResponse {
    pub schema_version: u32,
    pub workflow_id: String,
    pub engine: String,
    pub graph_path: String,
    pub required_mcp_ids: Vec<String>,
    pub required_skill_ids: Vec<String>,
}

#[derive(Debug, thiserror::Error)]
pub enum WorkflowMarketError {
    #[error("forbidden")]
    Forbidden,
    #[error("resource not found: {0}")]
    NotFound(String),
    #[error("resource is not a Workflow package")]
    NotWorkflowResource,
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

pub struct WorkflowMarketService {
    pool: SqlitePool,
    storage: StorageService,
    config: Arc<HubConfig>,
}

impl WorkflowMarketService {
    pub fn new(config: Arc<HubConfig>, pool: SqlitePool) -> Self {
        let storage = StorageService::new(&config);
        Self {
            pool,
            storage,
            config,
        }
    }

    pub async fn list_workflows(
        &self,
        query: &WorkflowListQuery,
    ) -> Result<Vec<WorkflowMarketListItem>, WorkflowMarketError> {
        let resources = ResourceRepository::new(self.pool.clone())
            .list(&ResourceListFilter {
                resource_type: Some(ResourceType::Workflow),
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

    pub async fn get_workflow(&self, id: &str) -> Result<WorkflowMarketListItem, WorkflowMarketError> {
        let resource = self.require_workflow_resource(id).await?;
        self.to_list_item(resource).await
    }

    pub async fn get_manifest(&self, id: &str) -> Result<WorkflowManifestResponse, WorkflowMarketError> {
        let resource = self.require_workflow_resource(id).await?;
        let manifest = parse_workflow_manifest(&resource.manifest_json)?;
        Ok(manifest.into())
    }

    pub async fn get_graph(&self, id: &str) -> Result<Value, WorkflowMarketError> {
        let resource = self.require_workflow_resource(id).await?;
        let manifest = parse_workflow_manifest(&resource.manifest_json)?;
        let package_path = resource
            .package_path
            .as_deref()
            .ok_or_else(|| WorkflowMarketError::Validation("workflow package is not published".into()))?;

        let graph_bytes = self
            .storage
            .read_package_file(package_path, &manifest.graph_path)?;
        let graph: Value = serde_json::from_slice(&graph_bytes)
            .map_err(|error| WorkflowMarketError::Validation(error.to_string()))?;

        validate_langgraph_json(&manifest, &graph)?;
        Ok(graph)
    }

    pub async fn create_draft(
        &self,
        actor: &CommunityUser,
        input: CreateWorkflowDraftInput,
    ) -> Result<CommunityResource, WorkflowMarketError> {
        actor
            .ensure_permission(UserPermission::CreateResource)
            .map_err(|_| WorkflowMarketError::Forbidden)?;
        ensure_not_banned(actor)?;

        if input.title.trim().is_empty() {
            return Err(WorkflowMarketError::Validation("title must not be empty".into()));
        }

        let draft_workflow_id = format!("draft-{}", Uuid::new_v4());
        let manifest = json!({
            "schemaVersion": 1,
            "workflowId": draft_workflow_id,
            "engine": "langgraph",
            "graphPath": "workflow.json",
            "requiredMcpIds": [],
            "requiredSkillIds": []
        });

        ResourceRepository::new(self.pool.clone())
            .create(CreateResourceInput {
                title: input.title,
                description: input.description,
                author_id: actor.id.clone(),
                resource_type: ResourceType::Workflow,
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
        input: PublishWorkflowPackageInput,
    ) -> Result<CommunityResource, WorkflowMarketError> {
        actor
            .ensure_permission(UserPermission::Publish)
            .map_err(|_| WorkflowMarketError::Forbidden)?;
        ensure_not_banned(actor)?;

        let resource = self.require_workflow_resource(&input.resource_id).await?;
        ensure_author_or_admin(actor, &resource.author_id)?;

        let stored = self.storage.store_package(StorePackageInput {
            resource_id: &input.resource_id,
            resource_type: ResourceType::Workflow,
            version: &input.version,
            package_bytes: &input.package_bytes,
            original_filename: input.original_filename.as_deref(),
        })?;

        let manifest = parse_workflow_manifest(&stored.manifest)?;
        self.validate_published_manifest(&resource, &manifest)?;

        let graph_bytes = self
            .storage
            .read_package_file(&stored.package_path, &manifest.graph_path)?;
        let graph: Value = serde_json::from_slice(&graph_bytes)
            .map_err(|error| WorkflowMarketError::Validation(error.to_string()))?;
        validate_langgraph_json(&manifest, &graph)?;

        let allow_replace = resource.status.allows_version_replace_on_publish();
        let version = VersionRepository::new(self.pool.clone())
            .create_or_replace(
                CreateVersionInput {
                resource_id: input.resource_id.clone(),
                version: input.version.clone(),
                changelog: input.changelog,
                package_path: stored.package_path.clone(),
                manifest_json: stored.manifest.clone(),
                resource_size: stored.resource_size,
                sha256: stored.archive_sha256,
            },
                allow_replace,
            )
            .await
            .map_err(|error| match error {
                VersionRepositoryError::Conflict {
                    resource_id,
                    version,
                } => WorkflowMarketError::VersionConflict {
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

    pub async fn unpublish(
        &self,
        actor: &CommunityUser,
        id: &str,
    ) -> Result<bool, WorkflowMarketError> {
        actor
            .ensure_permission(UserPermission::Publish)
            .map_err(|_| WorkflowMarketError::Forbidden)?;
        ensure_not_banned(actor)?;

        let resource = self.require_workflow_resource(id).await?;
        ensure_author_or_admin(actor, &resource.author_id)?;

        ResourceRepository::new(self.pool.clone())
            .soft_delete(id)
            .await
            .map_err(Into::into)
    }

    async fn require_workflow_resource(
        &self,
        id: &str,
    ) -> Result<CommunityResource, WorkflowMarketError> {
        let resource = ResourceRepository::new(self.pool.clone())
            .find_by_id(id)
            .await?
            .ok_or_else(|| WorkflowMarketError::NotFound(id.to_string()))?;

        if resource.deleted_at.is_some() {
            return Err(WorkflowMarketError::NotFound(id.to_string()));
        }
        if resource.resource_type != ResourceType::Workflow {
            return Err(WorkflowMarketError::NotWorkflowResource);
        }

        Ok(resource)
    }

    async fn to_list_item(
        &self,
        resource: CommunityResource,
    ) -> Result<WorkflowMarketListItem, WorkflowMarketError> {
        let manifest =
            parse_workflow_manifest(&resource.manifest_json).unwrap_or_else(|_| WorkflowManifest {
                schema_version: 1,
                workflow_id: "unknown".to_string(),
                engine: "langgraph".to_string(),
                graph_path: "workflow.json".to_string(),
                required_mcp_ids: Vec::new(),
                required_skill_ids: Vec::new(),
            });

        let node_count = if let Some(package_path) = &resource.package_path {
            self.storage
                .read_package_file(package_path, &manifest.graph_path)
                .ok()
                .and_then(|bytes| serde_json::from_slice::<Value>(&bytes).ok())
                .map(|graph| count_langgraph_nodes(&graph))
                .unwrap_or(0)
        } else {
            0
        };

        let author = UserRepository::new(self.pool.clone())
            .find_by_id(&resource.author_id)
            .await?
            .ok_or_else(|| WorkflowMarketError::NotFound(resource.author_id.clone()))?;

        Ok(WorkflowMarketListItem {
            id: resource.id,
            title: resource.title,
            description: resource.description,
            author: WorkflowAuthorSummary {
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
            workflow_id: manifest.workflow_id,
            engine: manifest.engine,
            graph_path: manifest.graph_path,
            node_count,
            created_at: resource.created_at,
            updated_at: resource.updated_at,
            published_at: resource.published_at,
        })
    }

    fn validate_published_manifest(
        &self,
        resource: &CommunityResource,
        manifest: &WorkflowManifest,
    ) -> Result<(), WorkflowMarketError> {
        if manifest.workflow_id.starts_with("draft-") {
            return Err(WorkflowMarketError::Validation(
                "published Workflow manifest must use a real workflowId".into(),
            ));
        }

        if resource.title.trim().is_empty() {
            return Err(WorkflowMarketError::Validation("resource title is empty".into()));
        }

        Ok(())
    }
}

impl From<WorkflowManifest> for WorkflowManifestResponse {
    fn from(manifest: WorkflowManifest) -> Self {
        Self {
            schema_version: manifest.schema_version,
            workflow_id: manifest.workflow_id,
            engine: manifest.engine,
            graph_path: manifest.graph_path,
            required_mcp_ids: manifest.required_mcp_ids,
            required_skill_ids: manifest.required_skill_ids,
        }
    }
}

pub fn parse_workflow_manifest(value: &Value) -> Result<WorkflowManifest, WorkflowMarketError> {
    let manifest: WorkflowManifest = serde_json::from_value(value.clone())
        .map_err(|error| WorkflowMarketError::Validation(error.to_string()))?;
    manifest
        .validate()
        .map_err(|error| WorkflowMarketError::Validation(error.to_string()))?;
    Ok(manifest)
}

pub fn validate_langgraph_json(
    manifest: &WorkflowManifest,
    graph: &Value,
) -> Result<(), WorkflowMarketError> {
    if manifest.engine != "langgraph" {
        return Err(WorkflowMarketError::Validation(format!(
            "unsupported workflow engine: {}",
            manifest.engine
        )));
    }

    let object = graph
        .as_object()
        .ok_or_else(|| WorkflowMarketError::Validation("workflow graph must be a JSON object".into()))?;

    if let Some(nodes) = object.get("nodes") {
        let nodes = nodes
            .as_array()
            .ok_or_else(|| WorkflowMarketError::Validation("workflow graph nodes must be an array".into()))?;
        if nodes.is_empty() {
            return Err(WorkflowMarketError::Validation(
                "workflow graph must contain at least one node".into(),
            ));
        }
        for node in nodes {
            if !node.is_object() {
                return Err(WorkflowMarketError::Validation(
                    "workflow graph nodes must be objects".into(),
                ));
            }
        }
    } else if let Some(graph_def) = object.get("graph") {
        if !graph_def.is_object() {
            return Err(WorkflowMarketError::Validation(
                "workflow graph.graph must be an object".into(),
            ));
        }
    } else {
        return Err(WorkflowMarketError::Validation(
            "workflow graph must include nodes or graph".into(),
        ));
    }

    if let Some(edges) = object.get("edges") {
        if !edges.is_array() {
            return Err(WorkflowMarketError::Validation(
                "workflow graph edges must be an array".into(),
            ));
        }
    }

    Ok(())
}

pub fn count_langgraph_nodes(graph: &Value) -> usize {
    graph
        .get("nodes")
        .and_then(|value| value.as_array())
        .map(|nodes| nodes.len())
        .unwrap_or(0)
}

fn ensure_author_or_admin(
    actor: &CommunityUser,
    author_id: &str,
) -> Result<(), WorkflowMarketError> {
    if actor.is_moderator() || actor.id == author_id {
        Ok(())
    } else {
        Err(WorkflowMarketError::Forbidden)
    }
}

fn ensure_not_banned(actor: &CommunityUser) -> Result<(), WorkflowMarketError> {
    actor.ensure_active().map_err(|_| WorkflowMarketError::Forbidden)
}

#[cfg(test)]
mod tests {
    use std::io::{Cursor, Write};
    use std::path::PathBuf;
    use std::sync::Arc;

    use sha2::{Digest, Sha256};
    use zip::write::SimpleFileOptions;
    use zip::ZipWriter;

    use super::*;
    use crate::db::{init_pool, DEFAULT_IDENTITY_ID};
    use crate::repositories::UserRepository;

    fn temp_data_dir() -> PathBuf {
        std::env::temp_dir().join(format!("toolman-workflow-market-{}", Uuid::new_v4()))
    }

    fn hub_config(data_dir: &PathBuf) -> Arc<HubConfig> {
        Arc::new(HubConfig::with_data_dir(data_dir.clone()))
    }

    async fn test_service() -> (WorkflowMarketService, CommunityUser, PathBuf) {
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
        let service = WorkflowMarketService::new(config, pool);
        (service, user, data_dir)
    }

    fn workflow_manifest_json() -> String {
        json!({
            "schemaVersion": 1,
            "workflowId": "agent-flow",
            "engine": "langgraph",
            "graphPath": "workflow.json",
            "requiredMcpIds": ["browser"],
            "requiredSkillIds": []
        })
        .to_string()
    }

    fn workflow_graph_json() -> String {
        json!({
            "nodes": [
                { "id": "start", "type": "start" },
                { "id": "agent", "type": "agent" }
            ],
            "edges": [
                { "from": "start", "to": "agent" }
            ]
        })
        .to_string()
    }

    fn invalid_workflow_graph_json() -> String {
        json!({ "edges": [] }).to_string()
    }

    fn build_workflow_package(graph_json: &str) -> Vec<u8> {
        let manifest = workflow_manifest_json();
        let entries = vec![
            ("workflow.manifest.json".to_string(), manifest.into_bytes()),
            ("workflow.json".to_string(), graph_json.as_bytes().to_vec()),
        ];

        let mut sums = String::new();
        for (name, content) in &entries {
            let hash = hex::encode(Sha256::digest(content));
            sums.push_str(&format!("{hash}  {name}\n"));
        }

        let mut file_entries = entries;
        file_entries.push(("SHA256SUMS".to_string(), sums.into_bytes()));

        let mut buffer = Cursor::new(Vec::new());
        let options =
            SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
        let mut writer = ZipWriter::new(&mut buffer);
        for (name, content) in file_entries {
            writer.start_file(name, options).expect("zip file");
            writer.write_all(&content).expect("zip write");
        }
        writer.finish().expect("zip finish");
        buffer.into_inner()
    }

    #[test]
    fn validates_langgraph_structure() {
        let manifest = parse_workflow_manifest(&json!({
            "schemaVersion": 1,
            "workflowId": "agent-flow",
            "engine": "langgraph",
            "graphPath": "workflow.json"
        }))
        .expect("manifest");

        let graph: Value = serde_json::from_str(&workflow_graph_json()).expect("graph");
        validate_langgraph_json(&manifest, &graph).expect("valid graph");

        let invalid: Value = serde_json::from_str(&invalid_workflow_graph_json()).expect("invalid");
        let error = validate_langgraph_json(&manifest, &invalid).expect_err("invalid graph");
        assert!(matches!(error, WorkflowMarketError::Validation(_)));
    }

    #[tokio::test]
    async fn publishes_workflow_and_reads_graph() {
        let (service, user, data_dir) = test_service().await;

        let draft = service
            .create_draft(
                &user,
                CreateWorkflowDraftInput {
                    title: "Agent Flow".to_string(),
                    description: Some("LangGraph automation".to_string()),
                    tags: Some(vec!["workflow".to_string(), "langgraph".to_string()]),
                    category: Some("automation".to_string()),
                    license: None,
                    visibility: None,
                },
            )
            .await
            .expect("draft");

        let invalid = service
            .publish_package(
                &user,
                PublishWorkflowPackageInput {
                    resource_id: draft.id.clone(),
                    version: "0.1.0".to_string(),
                    changelog: None,
                    package_bytes: build_workflow_package(&invalid_workflow_graph_json()),
                    original_filename: Some("broken.toolman-workflow".to_string()),
                },
            )
            .await;
        assert!(invalid.is_err());

        let published = service
            .publish_package(
                &user,
                PublishWorkflowPackageInput {
                    resource_id: draft.id.clone(),
                    version: "1.0.0".to_string(),
                    changelog: Some("Initial workflow".to_string()),
                    package_bytes: build_workflow_package(&workflow_graph_json()),
                    original_filename: Some("agent-flow.toolman-workflow".to_string()),
                },
            )
            .await
            .expect("publish");

        assert_eq!(published.status, ResourceStatus::Published);

        let items = service
            .list_workflows(&WorkflowListQuery::default())
            .await
            .expect("list");
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].node_count, 2);

        let graph = service.get_graph(&draft.id).await.expect("graph");
        assert_eq!(graph["nodes"].as_array().map(|nodes| nodes.len()), Some(2));

        let _ = std::fs::remove_dir_all(data_dir);
    }
}
