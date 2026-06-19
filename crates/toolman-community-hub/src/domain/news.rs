use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NewsCategory {
    Ai,
    Industry,
    Product,
    Other,
}

impl NewsCategory {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Ai => "ai",
            Self::Industry => "industry",
            Self::Product => "product",
            Self::Other => "other",
        }
    }

    pub fn parse(value: &str) -> Result<Self, NewsError> {
        match value {
            "ai" => Ok(Self::Ai),
            "industry" => Ok(Self::Industry),
            "product" => Ok(Self::Product),
            "other" => Ok(Self::Other),
            other => Err(NewsError::InvalidCategory(other.to_string())),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommunityRssSource {
    pub id: String,
    pub title: String,
    pub feed_url: String,
    pub site_url: String,
    pub category: String,
    pub language: String,
    pub enabled: bool,
    pub fetch_interval_minutes: i64,
    pub last_fetched_at: Option<i64>,
    pub last_error: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommunityNewsArticle {
    pub id: String,
    pub source_id: String,
    pub guid: String,
    pub title: String,
    pub summary: String,
    pub content_html: Option<String>,
    pub link: String,
    pub author: Option<String>,
    pub tags: Vec<String>,
    pub cover_url: Option<String>,
    pub published_at: i64,
    pub fetched_at: i64,
    pub like_count: i64,
    pub favorite_count: i64,
    pub dislike_count: i64,
    pub view_count: i64,
}

#[derive(Debug, Clone)]
pub struct CreateRssSourceInput {
    pub id: Option<String>,
    pub title: String,
    pub feed_url: String,
    pub site_url: Option<String>,
    pub category: Option<String>,
    pub language: Option<String>,
    pub enabled: Option<bool>,
    pub fetch_interval_minutes: Option<i64>,
}

#[derive(Debug, Clone, Default)]
pub struct NewsArticleListFilter {
    pub source_id: Option<String>,
    pub category: Option<String>,
    pub sort: crate::domain::NewsArticleSort,
    pub limit: i64,
    pub offset: i64,
}

#[derive(Debug, thiserror::Error)]
pub enum NewsError {
    #[error("invalid category: {0}")]
    InvalidCategory(String),
    #[error("title must not be empty")]
    EmptyTitle,
    #[error("feed_url must not be empty")]
    EmptyFeedUrl,
}

impl CreateRssSourceInput {
    pub fn validate(&self) -> Result<(), NewsError> {
        if self.title.trim().is_empty() {
            return Err(NewsError::EmptyTitle);
        }
        if self.feed_url.trim().is_empty() {
            return Err(NewsError::EmptyFeedUrl);
        }
        Ok(())
    }
}
