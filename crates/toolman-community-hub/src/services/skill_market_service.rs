use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::path::Path;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::SqlitePool;
use uuid::Uuid;
use zip::read::ZipArchive;

use crate::config::HubConfig;
use crate::domain::{
    CommunityResource, CommunityUser, CreateResourceInput, ResourceListFilter, ResourceManifest,
    ResourceStatus, ResourceType, ResourceVisibility, SkillManifest, UpdateResourceInput,
    UserPermission, UserRole,
};
use crate::repositories::resource_repository::{RepositoryError, ResourceRepository};
use crate::repositories::version_repository::{
    CreateVersionInput, VersionRepository, VersionRepositoryError,
};
use crate::repositories::UserRepository;
use crate::services::storage_service::{manifest_filename, StorageService, StorePackageInput};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateSkillDraftInput {
    pub title: String,
    pub description: Option<String>,
    pub tags: Option<Vec<String>>,
    pub category: Option<String>,
    pub license: Option<String>,
    pub visibility: Option<ResourceVisibility>,
}

#[derive(Debug, Clone)]
pub struct PublishSkillPackageInput {
    pub resource_id: String,
    pub version: String,
    pub changelog: Option<String>,
    pub package_bytes: Vec<u8>,
    pub original_filename: Option<String>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct SkillListQuery {
    pub category: Option<String>,
    pub status: Option<ResourceStatus>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SkillAuthorSummary {
    pub id: String,
    pub display_name: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct SkillMarketListItem {
    pub id: String,
    pub title: String,
    pub description: String,
    pub author: SkillAuthorSummary,
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
    pub skill_id: String,
    pub includes_prompt: bool,
    pub files_count: usize,
    pub created_at: i64,
    pub updated_at: i64,
    pub published_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SkillManifestResponse {
    pub schema_version: u32,
    pub skill_id: String,
    pub name: String,
    pub description: String,
    pub includes_prompt: bool,
    pub files: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SkillFrontmatter {
    pub name: String,
    pub description: String,
    #[serde(skip_serializing_if = "HashMap::is_empty", default)]
    pub extra: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SkillValidationResult {
    pub valid: bool,
    pub skill_id: String,
    pub name: String,
    pub description: String,
    pub includes_prompt: bool,
    pub package_path: String,
}

#[derive(Debug, thiserror::Error)]
pub enum SkillMarketError {
    #[error("forbidden")]
    Forbidden,
    #[error("resource not found: {0}")]
    NotFound(String),
    #[error("resource is not a Skill package")]
    NotSkillResource,
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
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("zip error: {0}")]
    Zip(#[from] zip::result::ZipError),
}

pub struct SkillMarketService {
    pool: SqlitePool,
    storage: StorageService,
    config: Arc<HubConfig>,
}

impl SkillMarketService {
    pub fn new(config: Arc<HubConfig>, pool: SqlitePool) -> Self {
        let storage = StorageService::new(&config);
        Self {
            pool,
            storage,
            config,
        }
    }

    pub async fn list_skills(
        &self,
        query: &SkillListQuery,
    ) -> Result<Vec<SkillMarketListItem>, SkillMarketError> {
        let resources = ResourceRepository::new(self.pool.clone())
            .list(&ResourceListFilter {
                resource_type: Some(ResourceType::Skill),
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

    pub async fn get_skill(&self, id: &str) -> Result<SkillMarketListItem, SkillMarketError> {
        let resource = self.require_skill_resource(id).await?;
        self.to_list_item(resource).await
    }

    pub async fn get_manifest(&self, id: &str) -> Result<SkillManifestResponse, SkillMarketError> {
        let resource = self.require_skill_resource(id).await?;
        let manifest = parse_skill_manifest(&resource.manifest_json)?;
        Ok(manifest.into())
    }

    pub async fn validate_local_package(
        &self,
        package_path: &str,
    ) -> Result<SkillValidationResult, SkillMarketError> {
        let path = Path::new(package_path);
        if !path.exists() {
            return Err(SkillMarketError::NotFound(package_path.to_string()));
        }

        let (skill_md, manifest_raw) = if path.is_dir() {
            read_skill_files_from_dir(path)?
        } else {
            read_skill_files_from_archive(path)?
        };

        let (frontmatter, manifest) = validate_skill_contents(&skill_md, &manifest_raw)?;

        Ok(SkillValidationResult {
            valid: true,
            skill_id: manifest.skill_id,
            name: frontmatter.name,
            description: frontmatter.description,
            includes_prompt: manifest.includes_prompt,
            package_path: package_path.to_string(),
        })
    }

    pub async fn create_draft(
        &self,
        actor: &CommunityUser,
        input: CreateSkillDraftInput,
    ) -> Result<CommunityResource, SkillMarketError> {
        actor
            .ensure_permission(UserPermission::CreateResource)
            .map_err(|_| SkillMarketError::Forbidden)?;
        ensure_not_banned(actor)?;

        if input.title.trim().is_empty() {
            return Err(SkillMarketError::Validation("title must not be empty".into()));
        }

        let draft_skill_id = format!("draft-{}", Uuid::new_v4());
        let manifest = json!({
            "schemaVersion": 1,
            "skillId": draft_skill_id,
            "name": input.title,
            "description": input.description.clone().unwrap_or_default(),
            "files": ["SKILL.md"]
        });

        ResourceRepository::new(self.pool.clone())
            .create(CreateResourceInput {
                title: input.title,
                description: input.description,
                author_id: actor.id.clone(),
                resource_type: ResourceType::Skill,
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
        input: PublishSkillPackageInput,
    ) -> Result<CommunityResource, SkillMarketError> {
        actor
            .ensure_permission(UserPermission::Publish)
            .map_err(|_| SkillMarketError::Forbidden)?;
        ensure_not_banned(actor)?;

        let resource = self.require_skill_resource(&input.resource_id).await?;
        ensure_author_or_admin(actor, &resource.author_id)?;

        let stored = self.storage.store_package(StorePackageInput {
            resource_id: &input.resource_id,
            resource_type: ResourceType::Skill,
            version: &input.version,
            package_bytes: &input.package_bytes,
            original_filename: input.original_filename.as_deref(),
        })?;

        let skill_md = String::from_utf8(
            self.storage
                .read_package_file(&stored.package_path, "SKILL.md")?,
        )
        .map_err(|error| SkillMarketError::Validation(error.to_string()))?;

        let (_, manifest) = validate_skill_contents(&skill_md, &stored.manifest)?;
        self.validate_published_manifest(&resource, &manifest)?;

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
                } => SkillMarketError::VersionConflict {
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
    ) -> Result<bool, SkillMarketError> {
        actor
            .ensure_permission(UserPermission::Publish)
            .map_err(|_| SkillMarketError::Forbidden)?;
        ensure_not_banned(actor)?;

        let resource = self.require_skill_resource(id).await?;
        ensure_author_or_admin(actor, &resource.author_id)?;

        ResourceRepository::new(self.pool.clone())
            .soft_delete(id)
            .await
            .map_err(Into::into)
    }

    async fn require_skill_resource(&self, id: &str) -> Result<CommunityResource, SkillMarketError> {
        let resource = ResourceRepository::new(self.pool.clone())
            .find_by_id(id)
            .await?
            .ok_or_else(|| SkillMarketError::NotFound(id.to_string()))?;

        if resource.deleted_at.is_some() {
            return Err(SkillMarketError::NotFound(id.to_string()));
        }
        if resource.resource_type != ResourceType::Skill {
            return Err(SkillMarketError::NotSkillResource);
        }

        Ok(resource)
    }

    async fn to_list_item(
        &self,
        resource: CommunityResource,
    ) -> Result<SkillMarketListItem, SkillMarketError> {
        let manifest = parse_skill_manifest(&resource.manifest_json).unwrap_or_else(|_| SkillManifest {
            schema_version: 1,
            skill_id: "unknown".to_string(),
            name: resource.title.clone(),
            description: resource.description.clone(),
            includes_prompt: false,
            files: vec!["SKILL.md".to_string()],
        });

        let author = UserRepository::new(self.pool.clone())
            .find_by_id(&resource.author_id)
            .await?
            .ok_or_else(|| SkillMarketError::NotFound(resource.author_id.clone()))?;

        Ok(SkillMarketListItem {
            id: resource.id,
            title: resource.title,
            description: resource.description,
            author: SkillAuthorSummary {
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
            skill_id: manifest.skill_id,
            includes_prompt: manifest.includes_prompt,
            files_count: manifest.files.len(),
            created_at: resource.created_at,
            updated_at: resource.updated_at,
            published_at: resource.published_at,
        })
    }

    fn validate_published_manifest(
        &self,
        resource: &CommunityResource,
        manifest: &SkillManifest,
    ) -> Result<(), SkillMarketError> {
        if manifest.skill_id.starts_with("draft-") {
            return Err(SkillMarketError::Validation(
                "published Skill manifest must use a real skillId".into(),
            ));
        }

        if resource.title.trim().is_empty() {
            return Err(SkillMarketError::Validation("resource title is empty".into()));
        }

        Ok(())
    }
}

impl From<SkillManifest> for SkillManifestResponse {
    fn from(manifest: SkillManifest) -> Self {
        Self {
            schema_version: manifest.schema_version,
            skill_id: manifest.skill_id,
            name: manifest.name,
            description: manifest.description,
            includes_prompt: manifest.includes_prompt,
            files: manifest.files,
        }
    }
}

pub fn parse_skill_manifest(value: &Value) -> Result<SkillManifest, SkillMarketError> {
    let manifest: SkillManifest = serde_json::from_value(value.clone())
        .map_err(|error| SkillMarketError::Validation(error.to_string()))?;
    manifest
        .validate()
        .map_err(|error| SkillMarketError::Validation(error.to_string()))?;
    Ok(manifest)
}

pub fn parse_skill_frontmatter(content: &str) -> Result<SkillFrontmatter, SkillMarketError> {
    let content = content.trim();
    let Some(captures) = parse_frontmatter_block(content) else {
        return Err(SkillMarketError::Validation(
            "SKILL.md must include YAML frontmatter with name and description".into(),
        ));
    };

    let name = captures
        .get("name")
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| SkillMarketError::Validation("SKILL.md frontmatter missing name".into()))?;
    let description = captures
        .get("description")
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            SkillMarketError::Validation("SKILL.md frontmatter missing description".into())
        })?;

    let mut extra = captures;
    extra.remove("name");
    extra.remove("description");

    Ok(SkillFrontmatter {
        name,
        description,
        extra,
    })
}

pub fn validate_skill_contents(
    skill_md: &str,
    manifest_source: &Value,
) -> Result<(SkillFrontmatter, SkillManifest), SkillMarketError> {
    let frontmatter = parse_skill_frontmatter(skill_md)?;
    let manifest = parse_skill_manifest(manifest_source)?;

    if manifest.name.trim() != frontmatter.name {
        return Err(SkillMarketError::Validation(
            "skill.manifest.json name must match SKILL.md frontmatter name".into(),
        ));
    }

    if manifest.description.trim() != frontmatter.description {
        return Err(SkillMarketError::Validation(
            "skill.manifest.json description must match SKILL.md frontmatter description".into(),
        ));
    }

    if !manifest.files.iter().any(|file| file == "SKILL.md") {
        return Err(SkillMarketError::Validation(
            "skill.manifest.json files must include SKILL.md".into(),
        ));
    }

    Ok((frontmatter, manifest))
}

fn parse_frontmatter_block(content: &str) -> Option<HashMap<String, String>> {
    let mut lines = content.lines();
    if lines.next()? != "---" {
        return None;
    }

    let mut yaml_lines = Vec::new();
    for line in lines.by_ref() {
        if line.trim() == "---" {
            break;
        }
        yaml_lines.push(line);
    }

    if yaml_lines.is_empty() {
        return None;
    }

    let mut meta = HashMap::new();
    for line in yaml_lines {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        let (key, value) = trimmed.split_once(':')?;
        meta.insert(key.trim().to_string(), value.trim().to_string());
    }

    if meta.is_empty() { None } else { Some(meta) }
}

fn read_skill_files_from_dir(path: &Path) -> Result<(String, Value), SkillMarketError> {
    let skill_md_path = path.join("SKILL.md");
    let manifest_path = path.join(manifest_filename(ResourceType::Skill));

    let skill_md = fs::read_to_string(&skill_md_path).map_err(|error| {
        SkillMarketError::Validation(format!(
            "failed to read {}: {error}",
            skill_md_path.display()
        ))
    })?;
    let manifest_raw = fs::read_to_string(&manifest_path).map_err(|error| {
        SkillMarketError::Validation(format!(
            "failed to read {}: {error}",
            manifest_path.display()
        ))
    })?;
    let manifest: Value = serde_json::from_str(&manifest_raw)
        .map_err(|error| SkillMarketError::Validation(error.to_string()))?;

    Ok((skill_md, manifest))
}

fn read_skill_files_from_archive(path: &Path) -> Result<(String, Value), SkillMarketError> {
    let file = fs::File::open(path)?;
    let mut archive = ZipArchive::new(file)?;

    let mut skill_md = None;
    let mut manifest_raw = None;

    for index in 0..archive.len() {
        let mut entry = archive.by_index(index)?;
        let Some(relative) = entry.enclosed_name() else {
            continue;
        };

        let name = relative.to_string_lossy().replace('\\', "/");
        let mut buffer = String::new();
        entry.read_to_string(&mut buffer)?;

        if name == "SKILL.md" {
            skill_md = Some(buffer);
        } else if name == manifest_filename(ResourceType::Skill) {
            manifest_raw = Some(buffer);
        }
    }

    let skill_md = skill_md.ok_or_else(|| {
        SkillMarketError::Validation("archive missing SKILL.md".into())
    })?;
    let manifest_raw = manifest_raw.ok_or_else(|| {
        SkillMarketError::Validation("archive missing skill.manifest.json".into())
    })?;
    let manifest: Value = serde_json::from_str(&manifest_raw)
        .map_err(|error| SkillMarketError::Validation(error.to_string()))?;

    Ok((skill_md, manifest))
}

fn ensure_author_or_admin(actor: &CommunityUser, author_id: &str) -> Result<(), SkillMarketError> {
    if actor.is_moderator() || actor.id == author_id {
        Ok(())
    } else {
        Err(SkillMarketError::Forbidden)
    }
}

fn ensure_not_banned(actor: &CommunityUser) -> Result<(), SkillMarketError> {
    actor.ensure_active().map_err(|_| SkillMarketError::Forbidden)
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
        std::env::temp_dir().join(format!("toolman-skill-market-{}", Uuid::new_v4()))
    }

    fn hub_config(data_dir: &PathBuf) -> Arc<HubConfig> {
        Arc::new(HubConfig::with_data_dir(data_dir.clone()))
    }

    async fn test_service() -> (SkillMarketService, CommunityUser, PathBuf) {
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
        let service = SkillMarketService::new(config, pool);
        (service, user, data_dir)
    }

    fn skill_md(name: &str, description: &str) -> String {
        format!(
            "---\nname: {name}\ndescription: {description}\n---\n\n# {name}\n"
        )
    }

    fn skill_manifest_json(name: &str, skill_id: &str, description: &str) -> String {
        json!({
            "schemaVersion": 1,
            "skillId": skill_id,
            "name": name,
            "description": description,
            "files": ["SKILL.md"]
        })
        .to_string()
    }

    fn build_skill_package(name: &str, skill_id: &str, description: &str) -> Vec<u8> {
        use std::io::Cursor;
        use std::io::Write;

        use sha2::{Digest, Sha256};
        use zip::write::SimpleFileOptions;
        use zip::ZipWriter;

        let manifest = skill_manifest_json(name, skill_id, description);
        let skill = skill_md(name, description);
        let entries = vec![
            ("skill.manifest.json".to_string(), manifest.into_bytes()),
            ("SKILL.md".to_string(), skill.into_bytes()),
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

    fn build_invalid_skill_package() -> Vec<u8> {
        build_test_package(
            ResourceType::Skill,
            &skill_manifest_json("Broken", "broken", "Broken skill"),
            &[],
        )
    }

    #[test]
    fn rejects_skill_without_frontmatter() {
        let manifest = json!({
            "schemaVersion": 1,
            "skillId": "demo",
            "name": "Demo",
            "description": "Demo",
            "files": ["SKILL.md"]
        });
        let error = validate_skill_contents("# Skill only\n", &manifest).expect_err("invalid");
        assert!(matches!(error, SkillMarketError::Validation(_)));
    }

    #[tokio::test]
    async fn validates_local_skill_directory() {
        let (service, _user, data_dir) = test_service().await;
        let package_dir = data_dir.join("local-skill");
        fs::create_dir_all(&package_dir).expect("dir");
        fs::write(
            package_dir.join("SKILL.md"),
            skill_md("Find Skills", "Discover installed skills"),
        )
        .expect("skill md");
        fs::write(
            package_dir.join("skill.manifest.json"),
            skill_manifest_json("Find Skills", "find-skills", "Discover installed skills"),
        )
        .expect("manifest");

        let result = service
            .validate_local_package(package_dir.to_string_lossy().as_ref())
            .await
            .expect("validate");

        assert!(result.valid);
        assert_eq!(result.skill_id, "find-skills");

        let _ = fs::remove_dir_all(data_dir);
    }

    #[tokio::test]
    async fn publishes_valid_skill_and_rejects_invalid_package() {
        let (service, user, data_dir) = test_service().await;

        let draft = service
            .create_draft(
                &user,
                CreateSkillDraftInput {
                    title: "Find Skills".to_string(),
                    description: Some("Discover installed skills".to_string()),
                    tags: Some(vec!["skill".to_string()]),
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
                PublishSkillPackageInput {
                    resource_id: draft.id.clone(),
                    version: "0.1.0".to_string(),
                    changelog: None,
                    package_bytes: build_invalid_skill_package(),
                    original_filename: Some("broken.toolman-skill".to_string()),
                },
            )
            .await;
        assert!(invalid.is_err());

        let published = service
            .publish_package(
                &user,
                PublishSkillPackageInput {
                    resource_id: draft.id.clone(),
                    version: "1.0.0".to_string(),
                    changelog: Some("Initial skill release".to_string()),
                    package_bytes: build_skill_package(
                        "Find Skills",
                        "find-skills",
                        "Discover installed skills",
                    ),
                    original_filename: Some("find-skills.toolman-skill".to_string()),
                },
            )
            .await
            .expect("publish");

        assert_eq!(published.status, ResourceStatus::Published);

        let items = service
            .list_skills(&SkillListQuery::default())
            .await
            .expect("list");
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].skill_id, "find-skills");

        let _ = fs::remove_dir_all(data_dir);
    }
}
