use serde::{Deserialize, Serialize};
use serde_json::Value;
use thiserror::Error;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ResourceType {
    Mcp,
    Skill,
    Workflow,
    Task,
    Knowledge,
}

impl ResourceType {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Mcp => "mcp",
            Self::Skill => "skill",
            Self::Workflow => "workflow",
            Self::Task => "task",
            Self::Knowledge => "knowledge",
        }
    }

    pub fn parse(value: &str) -> Result<Self, ResourceError> {
        match value {
            "mcp" => Ok(Self::Mcp),
            "skill" => Ok(Self::Skill),
            "workflow" => Ok(Self::Workflow),
            "task" => Ok(Self::Task),
            "knowledge" => Ok(Self::Knowledge),
            other => Err(ResourceError::InvalidResourceType(other.to_string())),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ResourceVisibility {
    Public,
    Unlisted,
    Private,
}

impl ResourceVisibility {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Public => "public",
            Self::Unlisted => "unlisted",
            Self::Private => "private",
        }
    }

    pub fn parse(value: &str) -> Result<Self, ResourceError> {
        match value {
            "public" => Ok(Self::Public),
            "unlisted" => Ok(Self::Unlisted),
            "private" => Ok(Self::Private),
            other => Err(ResourceError::InvalidVisibility(other.to_string())),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ResourceStatus {
    Draft,
    PendingReview,
    Published,
    Suspended,
    Archived,
}

impl ResourceStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Draft => "draft",
            Self::PendingReview => "pending_review",
            Self::Published => "published",
            Self::Suspended => "suspended",
            Self::Archived => "archived",
        }
    }

    pub fn parse(value: &str) -> Result<Self, ResourceError> {
        match value {
            "draft" => Ok(Self::Draft),
            "pending_review" => Ok(Self::PendingReview),
            "published" => Ok(Self::Published),
            "suspended" => Ok(Self::Suspended),
            "archived" => Ok(Self::Archived),
            other => Err(ResourceError::InvalidStatus(other.to_string())),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ResourceCounter {
    Download,
    Install,
    Favorite,
    Like,
    Dislike,
}

impl ResourceCounter {
    pub fn column(self) -> &'static str {
        match self {
            Self::Download => "download_count",
            Self::Install => "install_count",
            Self::Favorite => "favorite_count",
            Self::Like => "like_count",
            Self::Dislike => "dislike_count",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommunityResource {
    pub id: String,
    pub title: String,
    pub description: String,
    pub author_id: String,
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
    pub resource_type: ResourceType,
    pub cover_path: Option<String>,
    pub license: String,
    pub visibility: ResourceVisibility,
    pub status: ResourceStatus,
    pub resource_size: i64,
    pub package_path: Option<String>,
    pub manifest_json: Value,
    pub latest_version_id: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    pub published_at: Option<i64>,
    pub deleted_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommunityResourceVersion {
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

#[derive(Debug, Clone)]
pub struct CreateResourceInput {
    pub title: String,
    pub description: Option<String>,
    pub author_id: String,
    pub resource_type: ResourceType,
    pub version: Option<String>,
    pub tags: Option<Vec<String>>,
    pub category: Option<String>,
    pub license: Option<String>,
    pub visibility: Option<ResourceVisibility>,
    pub status: Option<ResourceStatus>,
    pub cover_path: Option<String>,
    pub package_path: Option<String>,
    pub resource_size: Option<i64>,
    pub manifest: Value,
}

#[derive(Debug, Clone, Default)]
pub struct UpdateResourceInput {
    pub title: Option<String>,
    pub description: Option<String>,
    pub version: Option<String>,
    pub tags: Option<Vec<String>>,
    pub category: Option<String>,
    pub license: Option<String>,
    pub visibility: Option<ResourceVisibility>,
    pub status: Option<ResourceStatus>,
    pub cover_path: Option<Option<String>>,
    pub package_path: Option<Option<String>>,
    pub resource_size: Option<i64>,
    pub manifest: Option<Value>,
    pub latest_version_id: Option<Option<String>>,
}

#[derive(Debug, Clone, Default)]
pub struct ResourceListFilter {
    pub resource_type: Option<ResourceType>,
    pub status: Option<ResourceStatus>,
    pub visibility: Option<ResourceVisibility>,
    pub author_id: Option<String>,
    pub category: Option<String>,
    pub tags: Option<Vec<String>>,
    pub include_deleted: bool,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

#[derive(Debug, Error)]
pub enum ResourceError {
    #[error("invalid resource type: {0}")]
    InvalidResourceType(String),
    #[error("invalid visibility: {0}")]
    InvalidVisibility(String),
    #[error("invalid status: {0}")]
    InvalidStatus(String),
    #[error("title must not be empty")]
    EmptyTitle,
    #[error("manifest error: {0}")]
    Manifest(#[from] ManifestError),
}

#[derive(Debug, Error)]
pub enum ManifestError {
    #[error("invalid json: {0}")]
    InvalidJson(#[from] serde_json::Error),
    #[error("unsupported schema version: expected {expected}, got {actual}")]
    UnsupportedSchemaVersion { expected: u32, actual: u32 },
    #[error("missing required field: {0}")]
    MissingField(&'static str),
    #[error("manifest type mismatch: expected {expected}, got {actual}")]
    TypeMismatch { expected: &'static str, actual: &'static str },
    #[error("unsupported resource type for manifest parsing: {0}")]
    UnsupportedResourceType(String),
    #[error("invalid value for {field}: {value}")]
    InvalidFieldValue { field: &'static str, value: String },
}

pub trait ResourceManifest: Serialize + for<'de> Deserialize<'de> {
    const SCHEMA_VERSION: u32;

    fn validate(&self) -> Result<(), ManifestError>;
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpManifest {
    pub schema_version: u32,
    pub mcp_id: String,
    pub transport: String,
    #[serde(default)]
    pub command: Option<String>,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: Value,
    #[serde(default)]
    pub tools: Vec<McpToolManifest>,
    #[serde(default)]
    pub templates: Vec<Value>,
    #[serde(default)]
    pub config_schema: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpToolManifest {
    pub name: String,
    #[serde(default)]
    pub description: String,
}

impl ResourceManifest for McpManifest {
    const SCHEMA_VERSION: u32 = 1;

    fn validate(&self) -> Result<(), ManifestError> {
        if self.schema_version != Self::SCHEMA_VERSION {
            return Err(ManifestError::UnsupportedSchemaVersion {
                expected: Self::SCHEMA_VERSION,
                actual: self.schema_version,
            });
        }
        if self.mcp_id.trim().is_empty() {
            return Err(ManifestError::MissingField("mcpId"));
        }
        if self.transport.trim().is_empty() {
            return Err(ManifestError::MissingField("transport"));
        }

        match self.transport.as_str() {
            "stdio" | "sse" | "streamableHttp" => {}
            other => {
                return Err(ManifestError::InvalidFieldValue {
                    field: "transport",
                    value: other.to_string(),
                });
            }
        }

        if self.transport == "stdio" && self.command.as_ref().is_none_or(|value| value.trim().is_empty())
        {
            return Err(ManifestError::MissingField("command"));
        }

        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillManifest {
    pub schema_version: u32,
    pub skill_id: String,
    pub name: String,
    pub description: String,
    #[serde(default)]
    pub includes_prompt: bool,
    #[serde(default)]
    pub files: Vec<String>,
}

impl ResourceManifest for SkillManifest {
    const SCHEMA_VERSION: u32 = 1;

    fn validate(&self) -> Result<(), ManifestError> {
        if self.schema_version != Self::SCHEMA_VERSION {
            return Err(ManifestError::UnsupportedSchemaVersion {
                expected: Self::SCHEMA_VERSION,
                actual: self.schema_version,
            });
        }
        if self.skill_id.trim().is_empty() {
            return Err(ManifestError::MissingField("skillId"));
        }
        if self.name.trim().is_empty() {
            return Err(ManifestError::MissingField("name"));
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowManifest {
    pub schema_version: u32,
    pub workflow_id: String,
    pub engine: String,
    pub graph_path: String,
    #[serde(default)]
    pub required_mcp_ids: Vec<String>,
    #[serde(default)]
    pub required_skill_ids: Vec<String>,
}

impl ResourceManifest for WorkflowManifest {
    const SCHEMA_VERSION: u32 = 1;

    fn validate(&self) -> Result<(), ManifestError> {
        if self.schema_version != Self::SCHEMA_VERSION {
            return Err(ManifestError::UnsupportedSchemaVersion {
                expected: Self::SCHEMA_VERSION,
                actual: self.schema_version,
            });
        }
        if self.workflow_id.trim().is_empty() {
            return Err(ManifestError::MissingField("workflowId"));
        }
        if self.engine.trim().is_empty() {
            return Err(ManifestError::MissingField("engine"));
        }
        if self.graph_path.trim().is_empty() {
            return Err(ManifestError::MissingField("graphPath"));
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeManifest {
    pub schema_version: u32,
    pub name: String,
    #[serde(default)]
    pub description: String,
    pub files: Vec<String>,
}

impl ResourceManifest for KnowledgeManifest {
    const SCHEMA_VERSION: u32 = 1;

    fn validate(&self) -> Result<(), ManifestError> {
        if self.schema_version != Self::SCHEMA_VERSION {
            return Err(ManifestError::UnsupportedSchemaVersion {
                expected: Self::SCHEMA_VERSION,
                actual: self.schema_version,
            });
        }
        if self.name.trim().is_empty() {
            return Err(ManifestError::MissingField("name"));
        }
        if self.files.is_empty() {
            return Err(ManifestError::MissingField("files"));
        }
        Ok(())
    }
}

#[derive(Debug, Clone)]
pub enum TypedManifest {
    Mcp(McpManifest),
    Skill(SkillManifest),
    Workflow(WorkflowManifest),
    Knowledge(KnowledgeManifest),
    Task(Value),
}

impl TypedManifest {
    pub fn into_value(self) -> Value {
        match self {
            Self::Mcp(manifest) => serde_json::to_value(manifest).expect("manifest serializable"),
            Self::Skill(manifest) => serde_json::to_value(manifest).expect("manifest serializable"),
            Self::Workflow(manifest) => serde_json::to_value(manifest).expect("manifest serializable"),
            Self::Knowledge(manifest) => serde_json::to_value(manifest).expect("manifest serializable"),
            Self::Task(value) => value,
        }
    }
}

pub fn parse_manifest(resource_type: ResourceType, value: &Value) -> Result<TypedManifest, ManifestError> {
    match resource_type {
        ResourceType::Mcp => {
            let manifest: McpManifest = serde_json::from_value(value.clone())?;
            manifest.validate()?;
            Ok(TypedManifest::Mcp(manifest))
        }
        ResourceType::Skill => {
            let manifest: SkillManifest = serde_json::from_value(value.clone())?;
            manifest.validate()?;
            Ok(TypedManifest::Skill(manifest))
        }
        ResourceType::Workflow => {
            let manifest: WorkflowManifest = serde_json::from_value(value.clone())?;
            manifest.validate()?;
            Ok(TypedManifest::Workflow(manifest))
        }
        ResourceType::Knowledge => {
            let manifest: KnowledgeManifest = serde_json::from_value(value.clone())?;
            manifest.validate()?;
            Ok(TypedManifest::Knowledge(manifest))
        }
        ResourceType::Task => Ok(TypedManifest::Task(value.clone())),
    }
}

pub fn validate_manifest_for_type(
    resource_type: ResourceType,
    value: &Value,
) -> Result<(), ManifestError> {
    parse_manifest(resource_type, value)?;
    Ok(())
}

impl CreateResourceInput {
    pub fn validate(&self) -> Result<(), ResourceError> {
        if self.title.trim().is_empty() {
            return Err(ResourceError::EmptyTitle);
        }
        validate_manifest_for_type(self.resource_type, &self.manifest)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parses_mcp_manifest() {
        let manifest = json!({
            "schemaVersion": 1,
            "mcpId": "filesystem",
            "transport": "stdio",
            "command": "npx",
            "args": ["-y", "@modelcontextprotocol/server-filesystem"]
        });

        let typed = parse_manifest(ResourceType::Mcp, &manifest).expect("mcp manifest");
        assert!(matches!(typed, TypedManifest::Mcp(_)));
    }

    #[test]
    fn rejects_skill_manifest_for_mcp_type() {
        let manifest = json!({
            "schemaVersion": 1,
            "skillId": "find-skills",
            "name": "Find Skills",
            "description": "Discover skills"
        });

        let error = parse_manifest(ResourceType::Mcp, &manifest).unwrap_err();
        assert!(matches!(error, ManifestError::InvalidJson(_)));
    }

    #[test]
    fn validates_workflow_manifest_fields() {
        let manifest = json!({
            "schemaVersion": 1,
            "workflowId": "demo-flow",
            "engine": "langgraph",
            "graphPath": "workflow.json"
        });

        parse_manifest(ResourceType::Workflow, &manifest).expect("workflow manifest");
    }
}
