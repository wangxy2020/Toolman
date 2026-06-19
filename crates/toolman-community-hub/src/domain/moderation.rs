use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ReportTargetType {
    Resource,
    News,
    Comment,
    User,
    Task,
}

impl ReportTargetType {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Resource => "resource",
            Self::News => "news",
            Self::Comment => "comment",
            Self::User => "user",
            Self::Task => "task",
        }
    }

    pub fn parse(value: &str) -> Result<Self, ModerationError> {
        match value {
            "resource" => Ok(Self::Resource),
            "news" => Ok(Self::News),
            "comment" => Ok(Self::Comment),
            "user" => Ok(Self::User),
            "task" => Ok(Self::Task),
            other => Err(ModerationError::InvalidTargetType(other.to_string())),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ReportReason {
    Spam,
    Illegal,
    Copyright,
    Other,
}

impl ReportReason {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Spam => "spam",
            Self::Illegal => "illegal",
            Self::Copyright => "copyright",
            Self::Other => "other",
        }
    }

    pub fn parse(value: &str) -> Result<Self, ModerationError> {
        match value {
            "spam" => Ok(Self::Spam),
            "illegal" => Ok(Self::Illegal),
            "copyright" => Ok(Self::Copyright),
            "other" => Ok(Self::Other),
            other => Err(ModerationError::InvalidReason(other.to_string())),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ReportStatus {
    Open,
    Reviewing,
    Resolved,
    Dismissed,
}

impl ReportStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Open => "open",
            Self::Reviewing => "reviewing",
            Self::Resolved => "resolved",
            Self::Dismissed => "dismissed",
        }
    }

    pub fn parse(value: &str) -> Result<Self, ModerationError> {
        match value {
            "open" => Ok(Self::Open),
            "reviewing" => Ok(Self::Reviewing),
            "resolved" => Ok(Self::Resolved),
            "dismissed" => Ok(Self::Dismissed),
            other => Err(ModerationError::InvalidReportStatus(other.to_string())),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommunityReport {
    pub id: String,
    pub reporter_id: String,
    pub target_type: ReportTargetType,
    pub target_id: String,
    pub reason: ReportReason,
    pub description: String,
    pub status: ReportStatus,
    pub created_at: i64,
    pub resolved_at: Option<i64>,
    pub resolved_by: Option<String>,
}

#[derive(Debug, Clone)]
pub struct CreateReportInput {
    pub reporter_id: String,
    pub target_type: ReportTargetType,
    pub target_id: String,
    pub reason: ReportReason,
    pub description: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModerationLog {
    pub id: String,
    pub moderator_id: String,
    pub action: String,
    pub target_type: String,
    pub target_id: String,
    pub reason: Option<String>,
    pub metadata_json: serde_json::Value,
    pub created_at: i64,
}

#[derive(Debug, Clone)]
pub struct CreateModerationLogInput {
    pub moderator_id: String,
    pub action: String,
    pub target_type: String,
    pub target_id: String,
    pub reason: Option<String>,
    pub metadata_json: Option<serde_json::Value>,
}

#[derive(Debug, thiserror::Error)]
pub enum ModerationError {
    #[error("invalid target type: {0}")]
    InvalidTargetType(String),
    #[error("invalid report reason: {0}")]
    InvalidReason(String),
    #[error("invalid report status: {0}")]
    InvalidReportStatus(String),
    #[error("invalid moderation action: {0}")]
    InvalidAction(String),
    #[error("report not found: {0}")]
    ReportNotFound(String),
    #[error("resource not found: {0}")]
    ResourceNotFound(String),
    #[error("user not found: {0}")]
    UserNotFound(String),
    #[error("resource is not pending review")]
    NotPendingReview,
}
