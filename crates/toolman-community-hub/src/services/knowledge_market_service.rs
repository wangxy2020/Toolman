use std::sync::Arc;

use serde_json::json;
use sqlx::SqlitePool;

use crate::config::HubConfig;
use crate::domain::{
    CommunityResource, CommunityUser, CreateResourceInput, KnowledgeManifest, ManifestError,
    ResourceManifest, ResourceStatus, ResourceType, ResourceVisibility, UpdateResourceInput,
    UserPermission, UserRole,
};
use crate::repositories::resource_repository::{RepositoryError, ResourceRepository};
use crate::repositories::version_repository::{
    CreateVersionInput, VersionRepository, VersionRepositoryError,
};
use crate::services::storage_service::{StorageService, StorePackageInput};

#[derive(Debug, Clone)]
pub struct CreateKnowledgeDraftInput {
    pub title: String,
    pub description: Option<String>,
    pub tags: Option<Vec<String>>,
    pub category: Option<String>,
    pub license: Option<String>,
    pub visibility: Option<ResourceVisibility>,
}

#[derive(Debug, Clone)]
pub struct PublishKnowledgePackageInput {
    pub resource_id: String,
    pub version: String,
    pub changelog: Option<String>,
    pub package_bytes: Vec<u8>,
    pub original_filename: Option<String>,
}

#[derive(Debug, thiserror::Error)]
pub enum KnowledgeMarketError {
    #[error("forbidden")]
    Forbidden,
    #[error("resource not found: {0}")]
    NotFound(String),
    #[error("not a knowledge resource")]
    NotKnowledgeResource,
    #[error("validation error: {0}")]
    Validation(String),
    #[error("version conflict: {resource_id}@{version}")]
    VersionConflict { resource_id: String, version: String },
    #[error("repository error: {0}")]
    Repository(#[from] RepositoryError),
    #[error("version repository error: {0}")]
    Version(#[from] VersionRepositoryError),
    #[error("storage error: {0}")]
    Storage(#[from] crate::services::storage_service::StorageError),
}

#[derive(Clone)]
pub struct KnowledgeMarketService {
    config: Arc<HubConfig>,
    pool: SqlitePool,
    storage: StorageService,
}

impl KnowledgeMarketService {
    pub fn new(config: Arc<HubConfig>, pool: SqlitePool) -> Self {
        let storage = StorageService::new(config.as_ref());
        Self {
            config,
            pool,
            storage,
        }
    }

    pub async fn create_draft(
        &self,
        actor: &CommunityUser,
        input: CreateKnowledgeDraftInput,
    ) -> Result<CommunityResource, KnowledgeMarketError> {
        actor
            .ensure_permission(UserPermission::CreateResource)
            .map_err(|_| KnowledgeMarketError::Forbidden)?;
        ensure_not_banned(actor)?;

        if input.title.trim().is_empty() {
            return Err(KnowledgeMarketError::Validation("title must not be empty".into()));
        }

        let manifest = json!({
            "schemaVersion": 1,
            "name": input.title,
            "description": input.description.clone().unwrap_or_default(),
            "files": []
        });

        ResourceRepository::new(self.pool.clone())
            .create(CreateResourceInput {
                title: input.title,
                description: input.description,
                author_id: actor.id.clone(),
                resource_type: ResourceType::Knowledge,
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
        input: PublishKnowledgePackageInput,
    ) -> Result<CommunityResource, KnowledgeMarketError> {
        actor
            .ensure_permission(UserPermission::Publish)
            .map_err(|_| KnowledgeMarketError::Forbidden)?;
        ensure_not_banned(actor)?;

        let resource = self.require_knowledge_resource(&input.resource_id).await?;
        ensure_author_or_admin(actor, &resource.author_id)?;

        let stored = self.storage.store_package(StorePackageInput {
            resource_id: &input.resource_id,
            resource_type: ResourceType::Knowledge,
            version: &input.version,
            package_bytes: &input.package_bytes,
            original_filename: input.original_filename.as_deref(),
        })?;

        let manifest: KnowledgeManifest = serde_json::from_value(stored.manifest.clone())
            .map_err(|error| KnowledgeMarketError::Validation(error.to_string()))?;
        manifest
            .validate()
            .map_err(|error: ManifestError| KnowledgeMarketError::Validation(error.to_string()))?;

        if manifest.name.trim().is_empty() {
            return Err(KnowledgeMarketError::Validation(
                "knowledge manifest name must not be empty".into(),
            ));
        }

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
                } => KnowledgeMarketError::VersionConflict {
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
                    title: Some(manifest.name.clone()),
                    description: Some(manifest.description.clone()),
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

    async fn require_knowledge_resource(
        &self,
        id: &str,
    ) -> Result<CommunityResource, KnowledgeMarketError> {
        let resource = ResourceRepository::new(self.pool.clone())
            .find_by_id(id)
            .await?
            .ok_or_else(|| KnowledgeMarketError::NotFound(id.to_string()))?;

        if resource.deleted_at.is_some() {
            return Err(KnowledgeMarketError::NotFound(id.to_string()));
        }
        if resource.resource_type != ResourceType::Knowledge {
            return Err(KnowledgeMarketError::NotKnowledgeResource);
        }

        Ok(resource)
    }
}

fn ensure_author_or_admin(actor: &CommunityUser, author_id: &str) -> Result<(), KnowledgeMarketError> {
    if actor.is_moderator() || actor.id == author_id {
        Ok(())
    } else {
        Err(KnowledgeMarketError::Forbidden)
    }
}

fn ensure_not_banned(actor: &CommunityUser) -> Result<(), KnowledgeMarketError> {
    actor.ensure_active().map_err(|_| KnowledgeMarketError::Forbidden)
}
