use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum InteractionTargetType {
    Resource,
    News,
    Task,
    Board,
    Comment,
}

impl InteractionTargetType {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Resource => "resource",
            Self::News => "news",
            Self::Task => "task",
            Self::Board => "board",
            Self::Comment => "comment",
        }
    }

    pub fn parse(value: &str) -> Result<Self, SocialError> {
        match value {
            "resource" => Ok(Self::Resource),
            "news" => Ok(Self::News),
            "task" => Ok(Self::Task),
            "board" => Ok(Self::Board),
            "comment" => Ok(Self::Comment),
            other => Err(SocialError::InvalidTargetType(other.to_string())),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CommentStatus {
    Visible,
    Hidden,
    Deleted,
}

impl CommentStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Visible => "visible",
            Self::Hidden => "hidden",
            Self::Deleted => "deleted",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommunityFavorite {
    pub id: String,
    pub user_id: String,
    pub target_type: InteractionTargetType,
    pub target_id: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommunityLike {
    pub id: String,
    pub user_id: String,
    pub target_type: InteractionTargetType,
    pub target_id: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommunityDislike {
    pub id: String,
    pub user_id: String,
    pub target_type: InteractionTargetType,
    pub target_id: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommunityComment {
    pub id: String,
    pub target_type: InteractionTargetType,
    pub target_id: String,
    pub user_id: String,
    pub parent_id: Option<String>,
    pub body: String,
    pub like_count: i64,
    pub dislike_count: i64,
    pub status: CommentStatus,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum NewsArticleSort {
    #[default]
    Newest,
    Popular,
    Diverse,
}

impl NewsArticleSort {
    pub fn parse(value: &str) -> Result<Self, SocialError> {
        match value {
            "newest" => Ok(Self::Newest),
            "popular" => Ok(Self::Popular),
            "diverse" => Ok(Self::Diverse),
            other => Err(SocialError::InvalidSort(other.to_string())),
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum SocialError {
    #[error("invalid target type: {0}")]
    InvalidTargetType(String),
    #[error("invalid sort: {0}")]
    InvalidSort(String),
    #[error("comment body must not be empty")]
    EmptyCommentBody,
}
