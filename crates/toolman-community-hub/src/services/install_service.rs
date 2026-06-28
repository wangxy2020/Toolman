use std::path::PathBuf;
use std::sync::Arc;

use serde::Serialize;
use serde_json::Value;
use sqlx::SqlitePool;

use crate::config::HubConfig;
use crate::domain::{
    CommunityInstall, CommunityUser, CreateInstallInput, InstallStatus, ResourceCounter,
    ResourceStatus, ResourceType,
};
use crate::repositories::install_repository::{
    InstallListFilter, InstallRepository, InstallRepositoryError,
};
use crate::repositories::resource_repository::{RepositoryError, ResourceRepository};
use crate::repositories::version_repository::{VersionRepository, VersionRepositoryError};

#[derive(Debug, Clone, Default)]
pub struct StartInstallRequest {
    pub version: Option<String>,
    pub workspace_id: Option<String>,
    pub options: Option<Value>,
}

#[derive(Debug, Clone)]
pub struct CompleteInstallRequest {
    pub status: InstallStatus,
    pub local_ref: Option<String>,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub struct InstallHistoryQuery {
    pub resource_type: Option<ResourceType>,
    pub workspace_id: Option<String>,
    pub limit: i64,
    pub offset: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct StartInstallResponse {
    pub install_id: String,
    pub package_path: String,
    pub manifest: Value,
    pub adapter: String,
    pub instructions: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct InstallItem {
    pub id: String,
    pub user_id: String,
    pub resource_id: String,
    pub version_id: String,
    pub workspace_id: Option<String>,
    pub local_ref: Option<String>,
    pub install_status: String,
    pub error_message: Option<String>,
    pub installed_at: i64,
    pub completed_at: Option<i64>,
}

#[derive(Debug, thiserror::Error)]
pub enum InstallServiceError {
    #[error("forbidden")]
    Forbidden,
    #[error("install not found: {0}")]
    NotFound(String),
    #[error("resource not found: {0}")]
    ResourceNotFound(String),
    #[error("version not found for resource")]
    VersionNotFound,
    #[error("resource is not installable")]
    ResourceNotInstallable,
    #[error("resource type mismatch")]
    ResourceTypeMismatch,
    #[error("install already completed")]
    AlreadyCompleted,
    #[error("package not available")]
    PackageNotAvailable,
    #[error("validation error: {0}")]
    Validation(String),
    #[error("install repository error: {0}")]
    InstallRepository(#[from] InstallRepositoryError),
    #[error("resource repository error: {0}")]
    ResourceRepository(#[from] RepositoryError),
    #[error("version repository error: {0}")]
    VersionRepository(#[from] VersionRepositoryError),
}

pub struct InstallService {
    config: Arc<HubConfig>,
    pool: SqlitePool,
}

impl InstallService {
    pub fn new(config: Arc<HubConfig>, pool: SqlitePool) -> Self {
        Self { config, pool }
    }

    pub async fn start_install(
        &self,
        actor: &CommunityUser,
        resource_type: ResourceType,
        resource_id: &str,
        input: StartInstallRequest,
    ) -> Result<StartInstallResponse, InstallServiceError> {
        actor.ensure_active().map_err(|_| InstallServiceError::Forbidden)?;

        let resource = ResourceRepository::new(self.pool.clone())
            .find_by_id(resource_id)
            .await?
            .ok_or_else(|| InstallServiceError::ResourceNotFound(resource_id.to_string()))?;

        if resource.deleted_at.is_some() || resource.status != ResourceStatus::Published {
            return Err(InstallServiceError::ResourceNotInstallable);
        }
        if resource.resource_type != resource_type {
            return Err(InstallServiceError::ResourceTypeMismatch);
        }

        let version = self.resolve_version(&resource, input.version.as_deref()).await?;
        if version.package_path.trim().is_empty() {
            return Err(InstallServiceError::PackageNotAvailable);
        }

        let package_path = resolve_package_path(&self.config, &version.package_path)?;
        if !package_path.is_dir() {
            return Err(InstallServiceError::PackageNotAvailable);
        }

        let install = InstallRepository::new(self.pool.clone())
            .create(CreateInstallInput {
                user_id: actor.id.clone(),
                resource_id: resource_id.to_string(),
                version_id: version.id.clone(),
                workspace_id: input.workspace_id,
            })
            .await?;

        let _ = input.options;

        Ok(StartInstallResponse {
            install_id: install.id,
            package_path: package_path.to_string_lossy().to_string(),
            manifest: version.manifest_json,
            adapter: adapter_name(resource_type).to_string(),
            instructions: "由 Main 进程完成实际安装".to_string(),
        })
    }

    pub async fn complete_install(
        &self,
        actor: &CommunityUser,
        install_id: &str,
        input: CompleteInstallRequest,
    ) -> Result<InstallItem, InstallServiceError> {
        actor.ensure_active().map_err(|_| InstallServiceError::Forbidden)?;

        let current = InstallRepository::new(self.pool.clone())
            .find_by_id(install_id)
            .await?
            .ok_or_else(|| InstallServiceError::NotFound(install_id.to_string()))?;

        if current.user_id != actor.id {
            return Err(InstallServiceError::Forbidden);
        }

        match input.status {
            InstallStatus::Success | InstallStatus::Failed => {}
            other => {
                return Err(InstallServiceError::Validation(format!(
                    "completion status must be success or failed, got {}",
                    other.as_str()
                )));
            }
        }

        let install = InstallRepository::new(self.pool.clone())
            .complete(
                install_id,
                input.status,
                input.local_ref,
                input.error_message,
            )
            .await
            .map_err(map_install_repo_error)?;

        if input.status == InstallStatus::Success {
            ResourceRepository::new(self.pool.clone())
                .increment_counter(&install.resource_id, ResourceCounter::Install, 1)
                .await?;
        }

        Ok(to_install_item(install))
    }

    pub async fn rollback_install(
        &self,
        actor: &CommunityUser,
        install_id: &str,
    ) -> Result<InstallItem, InstallServiceError> {
        actor.ensure_active().map_err(|_| InstallServiceError::Forbidden)?;

        let current = InstallRepository::new(self.pool.clone())
            .find_by_id(install_id)
            .await?
            .ok_or_else(|| InstallServiceError::NotFound(install_id.to_string()))?;

        if current.user_id != actor.id {
            return Err(InstallServiceError::Forbidden);
        }

        let install = InstallRepository::new(self.pool.clone())
            .rollback(install_id)
            .await
            .map_err(map_install_repo_error)?;

        ResourceRepository::new(self.pool.clone())
            .decrement_counter(&install.resource_id, ResourceCounter::Install)
            .await?;

        Ok(to_install_item(install))
    }

    pub async fn list_history(
        &self,
        actor: &CommunityUser,
        query: &InstallHistoryQuery,
    ) -> Result<Vec<InstallItem>, InstallServiceError> {
        actor.ensure_active().map_err(|_| InstallServiceError::Forbidden)?;

        let installs = InstallRepository::new(self.pool.clone())
            .list(&InstallListFilter {
                user_id: Some(actor.id.clone()),
                resource_id: None,
                workspace_id: query.workspace_id.clone(),
                limit: query.limit,
                offset: query.offset,
            })
            .await?;

        if let Some(resource_type) = query.resource_type {
            let mut items = Vec::new();
            for install in installs {
                let resource = ResourceRepository::new(self.pool.clone())
                    .find_by_id(&install.resource_id)
                    .await?
                    .ok_or_else(|| {
                        InstallServiceError::ResourceNotFound(install.resource_id.clone())
                    })?;
                if resource.resource_type == resource_type {
                    items.push(to_install_item(install));
                }
            }
            Ok(items)
        } else {
            Ok(installs.into_iter().map(to_install_item).collect())
        }
    }

    async fn resolve_version(
        &self,
        resource: &crate::domain::CommunityResource,
        requested_version: Option<&str>,
    ) -> Result<crate::domain::CommunityResourceVersion, InstallServiceError> {
        let version_repo = VersionRepository::new(self.pool.clone());

        if let Some(version) = requested_version {
            return version_repo
                .find_by_resource_and_version(&resource.id, version)
                .await?
                .ok_or(InstallServiceError::VersionNotFound);
        }

        if let Some(version_id) = &resource.latest_version_id {
            if let Some(version) = version_repo.find_by_id(version_id).await? {
                return Ok(version);
            }
        }

        version_repo
            .find_by_resource_and_version(&resource.id, &resource.version)
            .await?
            .ok_or(InstallServiceError::VersionNotFound)
    }
}

fn adapter_name(resource_type: ResourceType) -> &'static str {
    match resource_type {
        ResourceType::Mcp => "mcp",
        ResourceType::Skill => "skill",
        ResourceType::Workflow => "workflow",
        ResourceType::Task => "task",
        ResourceType::Knowledge => "knowledge",
    }
}

fn resolve_package_path(config: &HubConfig, relative_path: &str) -> Result<PathBuf, InstallServiceError> {
    let path = config.data_dir.join(relative_path);
    if path.starts_with(&config.data_dir) {
        Ok(path)
    } else {
        Err(InstallServiceError::PackageNotAvailable)
    }
}

fn to_install_item(install: CommunityInstall) -> InstallItem {
    InstallItem {
        id: install.id,
        user_id: install.user_id,
        resource_id: install.resource_id,
        version_id: install.version_id,
        workspace_id: install.workspace_id,
        local_ref: install.local_ref,
        install_status: install.install_status.as_str().to_string(),
        error_message: install.error_message,
        installed_at: install.installed_at,
        completed_at: install.completed_at,
    }
}

fn map_install_repo_error(error: InstallRepositoryError) -> InstallServiceError {
    match error {
        InstallRepositoryError::NotFound(value) => InstallServiceError::NotFound(value),
        InstallRepositoryError::Validation(install_error) => match install_error {
            crate::domain::InstallError::AlreadyCompleted => InstallServiceError::AlreadyCompleted,
            crate::domain::InstallError::InvalidStatus(message) => {
                InstallServiceError::Validation(message)
            }
            other => InstallServiceError::Validation(other.to_string()),
        },
        InstallRepositoryError::Database(error) => InstallServiceError::Validation(error.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;
    use std::sync::Arc;

    use serde_json::json;
    use uuid::Uuid;

    use crate::config::HubConfig;
    use crate::db::init_pool;
    use crate::db::seed::DEFAULT_ADMIN_USER_ID;
    use crate::repositories::UserRepository;
    use crate::services::mcp_market_service::{
        CreateMcpDraftInput, McpMarketService, PublishMcpPackageInput,
    };
    use crate::testing::build_test_package;

    use super::*;

    fn temp_data_dir() -> PathBuf {
        std::env::temp_dir().join(format!("toolman-install-{}", Uuid::new_v4()))
    }

    fn hub_config(data_dir: &PathBuf) -> Arc<HubConfig> {
        Arc::new(HubConfig::with_data_dir(data_dir.clone()))
    }

    async fn published_mcp(pool: &SqlitePool, data_dir: &PathBuf) -> (String, CommunityUser) {
        let config = hub_config(data_dir);
        config.bootstrap().expect("bootstrap");
        let mcp_service = McpMarketService::new(config, pool.clone());
        let admin = crate::db::seed::admin_user_for_tests(pool)
            .await
            .expect("test admin user");

        let draft = mcp_service
            .create_draft(
                &admin,
                CreateMcpDraftInput {
                    title: "Install MCP".to_string(),
                    description: Some("install test".to_string()),
                    tags: None,
                    category: None,
                    license: None,
                    visibility: None,
                },
            )
            .await
            .expect("draft");

        let manifest = json!({
            "schemaVersion": 1,
            "mcpId": "install-mcp",
            "transport": "stdio",
            "command": "npx",
            "tools": [{ "name": "ping", "description": "Ping" }],
            "templates": [{ "name": "default", "config": {} }],
            "files": ["mcp.manifest.json"]
        })
        .to_string();
        let package_bytes = build_test_package(ResourceType::Mcp, &manifest, &[]);

        mcp_service
            .publish_package(
                &admin,
                PublishMcpPackageInput {
                    resource_id: draft.id.clone(),
                    version: "1.0.0".to_string(),
                    changelog: None,
                    package_bytes,
                    original_filename: Some("install.toolman-mcp".to_string()),
                },
            )
            .await
            .expect("publish");

        (draft.id, admin)
    }

    #[tokio::test]
    async fn successful_install_increments_install_count() {
        let data_dir = temp_data_dir();
        std::fs::create_dir_all(&data_dir).expect("data dir");
        let db_path = data_dir.join("community.db");
        let pool = init_pool(&db_path).await.expect("init pool");
        let service = InstallService::new(hub_config(&data_dir), pool.clone());
        let (resource_id, admin) = published_mcp(&pool, &data_dir).await;

        let started = service
            .start_install(
                &admin,
                ResourceType::Mcp,
                &resource_id,
                StartInstallRequest {
                    version: Some("1.0.0".to_string()),
                    workspace_id: Some("workspace-1".to_string()),
                    options: None,
                },
            )
            .await
            .expect("start");
        assert_eq!(started.adapter, "mcp");
        assert!(std::path::Path::new(&started.package_path).is_dir());

        let before = ResourceRepository::new(pool.clone())
            .find_by_id(&resource_id)
            .await
            .expect("find")
            .expect("resource");
        assert_eq!(before.install_count, 0);

        let completed = service
            .complete_install(
                &admin,
                &started.install_id,
                CompleteInstallRequest {
                    status: InstallStatus::Success,
                    local_ref: Some("local-mcp-id".to_string()),
                    error_message: None,
                },
            )
            .await
            .expect("complete");
        assert_eq!(completed.install_status, "success");
        assert_eq!(completed.local_ref.as_deref(), Some("local-mcp-id"));

        let after = ResourceRepository::new(pool.clone())
            .find_by_id(&resource_id)
            .await
            .expect("find")
            .expect("resource");
        assert_eq!(after.install_count, 1);

        pool.close().await;
        let _ = std::fs::remove_dir_all(data_dir);
    }

    #[tokio::test]
    async fn failed_install_records_error_without_incrementing_count() {
        let data_dir = temp_data_dir();
        std::fs::create_dir_all(&data_dir).expect("data dir");
        let db_path = data_dir.join("community.db");
        let pool = init_pool(&db_path).await.expect("init pool");
        let service = InstallService::new(hub_config(&data_dir), pool.clone());
        let (resource_id, admin) = published_mcp(&pool, &data_dir).await;

        let started = service
            .start_install(
                &admin,
                ResourceType::Mcp,
                &resource_id,
                StartInstallRequest::default(),
            )
            .await
            .expect("start");

        let completed = service
            .complete_install(
                &admin,
                &started.install_id,
                CompleteInstallRequest {
                    status: InstallStatus::Failed,
                    local_ref: None,
                    error_message: Some("adapter error".to_string()),
                },
            )
            .await
            .expect("complete");
        assert_eq!(completed.install_status, "failed");
        assert_eq!(completed.error_message.as_deref(), Some("adapter error"));

        let resource = ResourceRepository::new(pool.clone())
            .find_by_id(&resource_id)
            .await
            .expect("find")
            .expect("resource");
        assert_eq!(resource.install_count, 0);

        pool.close().await;
        let _ = std::fs::remove_dir_all(data_dir);
    }
}
