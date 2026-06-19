use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum InstallStatus {
    Pending,
    Success,
    Failed,
    RolledBack,
}

impl InstallStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::Success => "success",
            Self::Failed => "failed",
            Self::RolledBack => "rolled_back",
        }
    }

    pub fn parse(value: &str) -> Result<Self, InstallError> {
        match value {
            "pending" => Ok(Self::Pending),
            "success" => Ok(Self::Success),
            "failed" => Ok(Self::Failed),
            "rolled_back" => Ok(Self::RolledBack),
            other => Err(InstallError::InvalidStatus(other.to_string())),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommunityInstall {
    pub id: String,
    pub user_id: String,
    pub resource_id: String,
    pub version_id: String,
    pub workspace_id: Option<String>,
    pub local_ref: Option<String>,
    pub install_status: InstallStatus,
    pub error_message: Option<String>,
    pub installed_at: i64,
    pub completed_at: Option<i64>,
}

#[derive(Debug, Clone)]
pub struct CreateInstallInput {
    pub user_id: String,
    pub resource_id: String,
    pub version_id: String,
    pub workspace_id: Option<String>,
}

#[derive(Debug, thiserror::Error)]
pub enum InstallError {
    #[error("invalid install status: {0}")]
    InvalidStatus(String),
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
}
