use serde::Serialize;
use sqlx::SqlitePool;

use crate::domain::{
    CommunityNewsArticle, CommunityRssSource, CommunityUser, CreateRssSourceInput,
    InteractionTargetType, NewsArticleListFilter, NewsArticleSort,
};
use crate::repositories::comment_repository::{
    CommentListFilter, CommentRepository, CreateCommentInput,
};
use crate::repositories::dislike_repository::{
    CreateDislikeInput, DislikeRepository, DislikeRepositoryError,
};
use crate::repositories::favorite_repository::{CreateFavoriteInput, FavoriteRepository};
use crate::repositories::fetch_log_repository::{FetchLogRepository, FetchLogStatus};
use crate::repositories::like_repository::{CreateLikeInput, LikeRepository};
use crate::repositories::news_article_repository::{
    CreateNewsArticleInput, NewsArticleRepository, NewsArticleRepositoryError,
};
use crate::repositories::rss_source_repository::{
    RssSourceRepository, RssSourceRepositoryError,
};
use crate::repositories::UserRepository;
use crate::rss::{content_is_sufficient, fetch_article_content, fetch_feed, parse_feed, FetchedFeed, RssFetchError};
use crate::services::search_service::{NewsSearchFilter, SearchService};

const ARTICLES_PER_SOURCE_FETCH: usize = 5;
const ARTICLES_PER_SOURCE_LIST: i64 = 5;

#[derive(Debug, Clone, Serialize)]
pub struct RssSourceItem {
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

#[derive(Debug, Clone, Serialize)]
pub struct NewsArticleItem {
    pub id: String,
    pub source_id: String,
    pub source_title: String,
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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub liked_by_me: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub favorited_by_me: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub disliked_by_me: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
pub struct FetchSourceResult {
    pub source_id: String,
    pub articles_added: usize,
    pub articles_seen: usize,
}

#[derive(Debug, Clone, Default)]
pub struct NewsArticleQuery {
    pub source_id: Option<String>,
    pub category: Option<String>,
    pub q: Option<String>,
    pub sort: NewsArticleSort,
    pub limit: i64,
    pub offset: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct NewsAuthorSummary {
    pub id: String,
    pub display_name: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct NewsInteractionResult {
    pub article_id: String,
    pub like_count: i64,
    pub favorite_count: i64,
    pub dislike_count: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub liked: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub favorited: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub disliked: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
pub struct NewsCommentItem {
    pub id: String,
    pub article_id: String,
    pub user_id: String,
    pub author: NewsAuthorSummary,
    pub parent_id: Option<String>,
    pub body: String,
    pub like_count: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct CreateNewsCommentRequest {
    pub body: String,
    pub parent_id: Option<String>,
}

#[derive(Debug, thiserror::Error)]
pub enum NewsServiceError {
    #[error("rss source not found: {0}")]
    SourceNotFound(String),
    #[error("article not found: {0}")]
    ArticleNotFound(String),
    #[error("rss source is disabled")]
    SourceDisabled,
    #[error("feed_url already exists")]
    FeedUrlConflict,
    #[error("validation error: {0}")]
    Validation(String),
    #[error("rss fetch error: {0}")]
    Fetch(#[from] RssFetchError),
    #[error("rss source repository error: {0}")]
    RssSource(#[from] RssSourceRepositoryError),
    #[error("article repository error: {0}")]
    Article(#[from] NewsArticleRepositoryError),
    #[error("fetch log repository error: {0}")]
    FetchLog(#[from] crate::repositories::FetchLogRepositoryError),
    #[error("favorite already exists")]
    FavoriteConflict,
    #[error("like already exists")]
    LikeConflict,
    #[error("forbidden")]
    Forbidden,
    #[error("favorite repository error: {0}")]
    Favorite(#[from] crate::repositories::FavoriteRepositoryError),
    #[error("like repository error: {0}")]
    Like(#[from] crate::repositories::LikeRepositoryError),
    #[error("comment repository error: {0}")]
    Comment(#[from] crate::repositories::CommentRepositoryError),
    #[error("user repository error: {0}")]
    UserRepository(#[from] crate::repositories::UserRepositoryError),
    #[error("search error: {0}")]
    Search(#[from] crate::services::SearchError),
}

pub struct NewsService {
    pool: SqlitePool,
}

impl NewsService {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn list_sources(&self) -> Result<Vec<RssSourceItem>, NewsServiceError> {
        let sources = RssSourceRepository::new(self.pool.clone()).list().await?;
        Ok(sources.into_iter().map(Into::into).collect())
    }

    pub async fn create_source(
        &self,
        input: CreateRssSourceInput,
    ) -> Result<RssSourceItem, NewsServiceError> {
        let source = RssSourceRepository::new(self.pool.clone())
            .create(input)
            .await
            .map_err(map_source_error)?;

        Ok(source.into())
    }

    pub async fn delete_source(&self, id: &str) -> Result<(), NewsServiceError> {
        let deleted = RssSourceRepository::new(self.pool.clone())
            .delete(id)
            .await?;

        if deleted {
            Ok(())
        } else {
            Err(NewsServiceError::SourceNotFound(id.to_string()))
        }
    }

    pub async fn fetch_source(&self, id: &str) -> Result<FetchSourceResult, NewsServiceError> {
        let source = RssSourceRepository::new(self.pool.clone())
            .find_by_id(id)
            .await?
            .ok_or_else(|| NewsServiceError::SourceNotFound(id.to_string()))?;

        if !source.enabled {
            return Err(NewsServiceError::SourceDisabled);
        }

        match fetch_feed(&source.feed_url).await {
            Ok(feed) => {
                let result = self
                    .ingest_feed(&source, feed)
                    .await
                    .map_err(NewsServiceError::from)?;
                let fetched_at = chrono::Utc::now().timestamp_millis();
                RssSourceRepository::new(self.pool.clone())
                    .mark_fetch_success(&source.id, fetched_at)
                    .await?;
                FetchLogRepository::new(self.pool.clone())
                    .append(
                        &source.id,
                        FetchLogStatus::Success,
                        result.articles_added as i64,
                        None,
                    )
                    .await?;
                Ok(result)
            }
            Err(error) => {
                let fetched_at = chrono::Utc::now().timestamp_millis();
                let message = error.to_string();
                RssSourceRepository::new(self.pool.clone())
                    .mark_fetch_error(&source.id, fetched_at, &message)
                    .await?;
                FetchLogRepository::new(self.pool.clone())
                    .append(
                        &source.id,
                        FetchLogStatus::Error,
                        0,
                        Some(&message),
                    )
                    .await?;
                Err(NewsServiceError::Fetch(error))
            }
        }
    }

    /// Pull enabled RSS sources that have never been fetched (e.g. after first install).
    pub async fn bootstrap_fetch_unfetched_sources(&self) -> usize {
        let sources = match RssSourceRepository::new(self.pool.clone()).list().await {
            Ok(sources) => sources,
            Err(error) => {
                tracing::warn!(error = %error, "failed to list rss sources for bootstrap");
                return 0;
            }
        };

        let mut fetched = 0usize;
        for source in sources {
            if !source.enabled || source.last_fetched_at.is_some() {
                continue;
            }
            match self.fetch_source(&source.id).await {
                Ok(result) => {
                    tracing::info!(
                        source_id = %source.id,
                        articles_added = result.articles_added,
                        "bootstrapped rss fetch"
                    );
                    fetched += 1;
                }
                Err(error) => {
                    tracing::warn!(
                        source_id = %source.id,
                        error = %error,
                        "rss bootstrap fetch failed"
                    );
                }
            }
        }
        fetched
    }

    pub async fn ingest_feed_bytes(
        &self,
        source_id: &str,
        bytes: &[u8],
    ) -> Result<FetchSourceResult, NewsServiceError> {
        let source = RssSourceRepository::new(self.pool.clone())
            .find_by_id(source_id)
            .await?
            .ok_or_else(|| NewsServiceError::SourceNotFound(source_id.to_string()))?;

        let feed = parse_feed(bytes)?;
        self.ingest_feed(&source, feed)
            .await
            .map_err(NewsServiceError::from)
    }

    pub async fn list_articles(
        &self,
        query: &NewsArticleQuery,
        viewer: Option<&CommunityUser>,
    ) -> Result<Vec<NewsArticleItem>, NewsServiceError> {
        let articles = if let Some(q) = query.q.as_deref().filter(|value| !value.trim().is_empty()) {
            let hits = SearchService::new(self.pool.clone())
                .search_news(&NewsSearchFilter {
                    q: q.to_string(),
                    source_id: query.source_id.clone(),
                    limit: query.limit,
                    offset: query.offset,
                })
                .await
                .map_err(NewsServiceError::from)?;
            let ids: Vec<String> = hits.into_iter().map(|hit| hit.id).collect();
            NewsArticleRepository::new(self.pool.clone())
                .find_by_ids(&ids)
                .await?
        } else if query.sort == NewsArticleSort::Diverse && query.source_id.is_none() {
            self.list_diverse_articles(query.limit, query.offset).await?
        } else {
            NewsArticleRepository::new(self.pool.clone())
                .list(&NewsArticleListFilter {
                    source_id: query.source_id.clone(),
                    category: query.category.clone(),
                    sort: query.sort,
                    limit: query.limit,
                    offset: query.offset,
                })
                .await?
        };

        let mut items = Vec::with_capacity(articles.len());
        for article in articles {
            items.push(self.to_article_item(article, viewer).await?);
        }
        Ok(items)
    }

    async fn list_diverse_articles(
        &self,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<CommunityNewsArticle>, NewsServiceError> {
        let repo = NewsArticleRepository::new(self.pool.clone());
        let sources: Vec<CommunityRssSource> = RssSourceRepository::new(self.pool.clone())
            .list()
            .await
            .map_err(NewsServiceError::RssSource)?
            .into_iter()
            .filter(|source| {
                source.enabled
                    && source.last_fetched_at.is_some()
                    && source.last_error.is_none()
            })
            .collect();

        let mut per_source_articles = Vec::new();
        for source in &sources {
            let articles = repo
                .list(&NewsArticleListFilter {
                    source_id: Some(source.id.clone()),
                    sort: NewsArticleSort::Newest,
                    limit: ARTICLES_PER_SOURCE_LIST,
                    offset: 0,
                    ..Default::default()
                })
                .await
                .map_err(NewsServiceError::from)?;

            if !articles.is_empty() {
                per_source_articles.push(articles);
            }
        }

        let mut picked = Vec::new();
        for round in 0..ARTICLES_PER_SOURCE_LIST as usize {
            for articles in &per_source_articles {
                if let Some(article) = articles.get(round) {
                    picked.push(article.clone());
                }
            }
        }

        let offset = offset.max(0) as usize;
        Ok(picked
            .into_iter()
            .skip(offset)
            .take(limit.max(0) as usize)
            .collect())
    }

    pub async fn recommended_articles(
        &self,
        viewer: Option<&CommunityUser>,
        limit: i64,
    ) -> Result<Vec<NewsArticleItem>, NewsServiceError> {
        let fetch_each = limit.clamp(1, 50).saturating_add(5);
        let repo = NewsArticleRepository::new(self.pool.clone());

        let popular = repo
            .list(&NewsArticleListFilter {
                sort: NewsArticleSort::Popular,
                limit: fetch_each,
                offset: 0,
                ..Default::default()
            })
            .await?;
        let newest = repo
            .list(&NewsArticleListFilter {
                sort: NewsArticleSort::Newest,
                limit: fetch_each,
                offset: 0,
                ..Default::default()
            })
            .await?;

        let mut preferred_tags = Vec::new();
        if let Some(viewer) = viewer {
            preferred_tags = self.collect_user_preferred_tags(&viewer.id).await?;
        }

        let tag_matched = if preferred_tags.is_empty() {
            Vec::new()
        } else {
            repo.list_by_tags(&preferred_tags, fetch_each).await?
        };

        let mut merged = Vec::new();
        let mut seen = std::collections::HashSet::new();

        for article in popular
            .into_iter()
            .take((limit as usize * 2).max(3))
            .chain(tag_matched.into_iter())
            .chain(newest.into_iter().take((limit as usize * 2).max(3)))
        {
            if seen.insert(article.id.clone()) {
                merged.push(article);
            }
            if merged.len() as i64 >= limit {
                break;
            }
        }

        if merged.len() < limit as usize {
            for article in repo
                .list(&NewsArticleListFilter {
                    sort: NewsArticleSort::Newest,
                    limit,
                    offset: 0,
                    ..Default::default()
                })
                .await?
            {
                if seen.insert(article.id.clone()) {
                    merged.push(article);
                }
                if merged.len() as i64 >= limit {
                    break;
                }
            }
        }

        let mut items = Vec::with_capacity(merged.len());
        for article in merged.into_iter().take(limit as usize) {
            items.push(self.to_article_item(article, viewer).await?);
        }
        Ok(items)
    }

    pub async fn favorite_article(
        &self,
        actor: &CommunityUser,
        article_id: &str,
    ) -> Result<NewsInteractionResult, NewsServiceError> {
        ensure_active(actor)?;
        self.require_article(article_id).await?;

        let favorites = FavoriteRepository::new(self.pool.clone());
        let favorited = if favorites
            .find_by_user_and_target(&actor.id, InteractionTargetType::News, article_id)
            .await
            .map_err(map_favorite_error)?
            .is_some()
        {
            favorites
                .delete_by_user_and_target(&actor.id, InteractionTargetType::News, article_id)
                .await
                .map_err(map_favorite_error)?;

            NewsArticleRepository::new(self.pool.clone())
                .decrement_favorite_count(article_id)
                .await?;

            false
        } else {
            favorites
                .create(CreateFavoriteInput {
                    user_id: actor.id.clone(),
                    target_type: InteractionTargetType::News,
                    target_id: article_id.to_string(),
                })
                .await
                .map_err(map_favorite_error)?;

            NewsArticleRepository::new(self.pool.clone())
                .increment_favorite_count(article_id)
                .await?;

            true
        };

        let article = NewsArticleRepository::new(self.pool.clone())
            .find_by_id(article_id)
            .await?
            .ok_or_else(|| NewsServiceError::ArticleNotFound(article_id.to_string()))?;

        Ok(NewsInteractionResult {
            article_id: article.id,
            like_count: article.like_count,
            favorite_count: article.favorite_count,
            dislike_count: article.dislike_count,
            liked: None,
            favorited: Some(favorited),
            disliked: None,
        })
    }

    pub async fn like_article(
        &self,
        actor: &CommunityUser,
        article_id: &str,
    ) -> Result<NewsInteractionResult, NewsServiceError> {
        ensure_active(actor)?;
        self.require_article(article_id).await?;

        let likes = LikeRepository::new(self.pool.clone());
        if likes
            .find_by_user_and_target(&actor.id, InteractionTargetType::News, article_id)
            .await
            .map_err(map_like_error)?
            .is_some()
        {
            likes
                .delete_by_user_and_target(&actor.id, InteractionTargetType::News, article_id)
                .await
                .map_err(map_like_error)?;

            let article = NewsArticleRepository::new(self.pool.clone())
                .decrement_like_count(article_id)
                .await?;

            return Ok(NewsInteractionResult {
                article_id: article.id,
                like_count: article.like_count,
                favorite_count: article.favorite_count,
                dislike_count: article.dislike_count,
                liked: Some(false),
                favorited: None,
                disliked: None,
            });
        }

        let dislikes = DislikeRepository::new(self.pool.clone());
        if dislikes
            .delete_by_user_and_target(&actor.id, InteractionTargetType::News, article_id)
            .await
            .map_err(map_dislike_error)?
        {
            NewsArticleRepository::new(self.pool.clone())
                .decrement_dislike_count(article_id)
                .await?;
        }

        likes
            .create(CreateLikeInput {
                user_id: actor.id.clone(),
                target_type: InteractionTargetType::News,
                target_id: article_id.to_string(),
            })
            .await
            .map_err(map_like_error)?;

        let article = NewsArticleRepository::new(self.pool.clone())
            .increment_like_count(article_id)
            .await?;

        Ok(NewsInteractionResult {
            article_id: article.id,
            like_count: article.like_count,
            favorite_count: article.favorite_count,
            dislike_count: article.dislike_count,
            liked: Some(true),
            favorited: None,
            disliked: Some(false),
        })
    }

    pub async fn dislike_article(
        &self,
        actor: &CommunityUser,
        article_id: &str,
    ) -> Result<NewsInteractionResult, NewsServiceError> {
        ensure_active(actor)?;
        self.require_article(article_id).await?;

        let dislikes = DislikeRepository::new(self.pool.clone());
        if dislikes
            .find_by_user_and_target(&actor.id, InteractionTargetType::News, article_id)
            .await
            .map_err(map_dislike_error)?
            .is_some()
        {
            dislikes
                .delete_by_user_and_target(&actor.id, InteractionTargetType::News, article_id)
                .await
                .map_err(map_dislike_error)?;

            let article = NewsArticleRepository::new(self.pool.clone())
                .decrement_dislike_count(article_id)
                .await?;

            return Ok(NewsInteractionResult {
                article_id: article.id,
                like_count: article.like_count,
                favorite_count: article.favorite_count,
                dislike_count: article.dislike_count,
                liked: None,
                favorited: None,
                disliked: Some(false),
            });
        }

        let likes = LikeRepository::new(self.pool.clone());
        if likes
            .delete_by_user_and_target(&actor.id, InteractionTargetType::News, article_id)
            .await
            .map_err(map_like_error)?
        {
            NewsArticleRepository::new(self.pool.clone())
                .decrement_like_count(article_id)
                .await?;
        }

        dislikes
            .create(CreateDislikeInput {
                user_id: actor.id.clone(),
                target_type: InteractionTargetType::News,
                target_id: article_id.to_string(),
            })
            .await
            .map_err(map_dislike_error)?;

        let article = NewsArticleRepository::new(self.pool.clone())
            .increment_dislike_count(article_id)
            .await?;

        Ok(NewsInteractionResult {
            article_id: article.id,
            like_count: article.like_count,
            favorite_count: article.favorite_count,
            dislike_count: article.dislike_count,
            liked: Some(false),
            favorited: None,
            disliked: Some(true),
        })
    }

    pub async fn list_comments(
        &self,
        article_id: &str,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<NewsCommentItem>, NewsServiceError> {
        self.require_article(article_id).await?;

        let comments = CommentRepository::new(self.pool.clone())
            .list(&CommentListFilter {
                target_type: InteractionTargetType::News,
                target_id: article_id.to_string(),
                user_id: None,
                parent_id: None,
                limit,
                offset,
            })
            .await?;

        let mut items = Vec::with_capacity(comments.len());
        for comment in comments {
            items.push(self.to_comment_item(comment).await?);
        }
        Ok(items)
    }

    pub async fn create_comment(
        &self,
        actor: &CommunityUser,
        article_id: &str,
        input: CreateNewsCommentRequest,
    ) -> Result<NewsCommentItem, NewsServiceError> {
        ensure_active(actor)?;
        self.require_article(article_id).await?;

        let comment = CommentRepository::new(self.pool.clone())
            .create(CreateCommentInput {
                target_type: InteractionTargetType::News,
                target_id: article_id.to_string(),
                user_id: actor.id.clone(),
                parent_id: input.parent_id,
                body: input.body,
            })
            .await?;

        self.to_comment_item(comment).await
    }

    pub async fn get_article(
        &self,
        id: &str,
        viewer: Option<&CommunityUser>,
    ) -> Result<NewsArticleItem, NewsServiceError> {
        let article = NewsArticleRepository::new(self.pool.clone())
            .increment_view_count(id)
            .await
            .map_err(map_article_error)?;

        if !content_is_sufficient(article.content_html.as_deref()) && !article.link.trim().is_empty()
        {
            let pool = self.pool.clone();
            let article_id = article.id.clone();
            let link = article.link.clone();
            tokio::spawn(async move {
                match fetch_article_content(&link).await {
                    Ok(content_html) => {
                        if let Err(error) = NewsArticleRepository::new(pool)
                            .update_content_html(&article_id, &content_html)
                            .await
                        {
                            tracing::debug!(
                                article_id = %article_id,
                                error = %error,
                                "failed to persist enriched article content"
                            );
                        }
                    }
                    Err(error) => {
                        tracing::debug!(
                            article_id = %article_id,
                            error = %error,
                            "failed to enrich article content"
                        );
                    }
                }
            });
        }

        self.to_article_item(article, viewer).await
    }

    async fn ingest_feed(
        &self,
        source: &CommunityRssSource,
        feed: FetchedFeed,
    ) -> Result<FetchSourceResult, NewsArticleRepositoryError> {
        let repo = NewsArticleRepository::new(self.pool.clone());
        let fetched_at = chrono::Utc::now().timestamp_millis();
        let mut articles_added = 0usize;

        let mut entries = feed.entries;
        let articles_seen = entries.len();
        entries.sort_by(|left, right| right.published_at.cmp(&left.published_at));

        for entry in entries.into_iter().take(ARTICLES_PER_SOURCE_FETCH) {
            let mut input = CreateNewsArticleInput::from(&entry);
            input.source_id = source.id.clone();
            input.fetched_at = fetched_at;

            if repo.create_if_absent(input.clone()).await?.is_some() {
                articles_added += 1;
            } else {
                repo.backfill_content_if_empty(
                    &source.id,
                    &entry.guid,
                    &entry.summary,
                    entry.content_html.as_deref(),
                )
                .await?;
            }
        }

        Ok(FetchSourceResult {
            source_id: source.id.clone(),
            articles_added,
            articles_seen,
        })
    }

    async fn to_article_item(
        &self,
        article: CommunityNewsArticle,
        viewer: Option<&CommunityUser>,
    ) -> Result<NewsArticleItem, NewsServiceError> {
        let source = RssSourceRepository::new(self.pool.clone())
            .find_by_id(&article.source_id)
            .await?
            .ok_or_else(|| NewsServiceError::SourceNotFound(article.source_id.clone()))?;

        let (liked_by_me, favorited_by_me, disliked_by_me) = if let Some(viewer) = viewer {
            let likes = LikeRepository::new(self.pool.clone());
            let dislikes = DislikeRepository::new(self.pool.clone());
            let favorites = FavoriteRepository::new(self.pool.clone());

            let liked = likes
                .find_by_user_and_target(&viewer.id, InteractionTargetType::News, &article.id)
                .await
                .map_err(map_like_error)?
                .is_some();
            let disliked = dislikes
                .find_by_user_and_target(&viewer.id, InteractionTargetType::News, &article.id)
                .await
                .map_err(map_dislike_error)?
                .is_some();
            let favorited = favorites
                .find_by_user_and_target(&viewer.id, InteractionTargetType::News, &article.id)
                .await
                .map_err(map_favorite_error)?
                .is_some();

            (Some(liked), Some(favorited), Some(disliked))
        } else {
            (None, None, None)
        };

        Ok(NewsArticleItem {
            id: article.id,
            source_id: article.source_id,
            source_title: source.title,
            guid: article.guid,
            title: article.title,
            summary: article.summary,
            content_html: article.content_html,
            link: article.link,
            author: article.author,
            tags: article.tags,
            cover_url: article.cover_url,
            published_at: article.published_at,
            fetched_at: article.fetched_at,
            like_count: article.like_count,
            favorite_count: article.favorite_count,
            dislike_count: article.dislike_count,
            view_count: article.view_count,
            liked_by_me,
            favorited_by_me,
            disliked_by_me,
        })
    }

    async fn require_article(&self, id: &str) -> Result<CommunityNewsArticle, NewsServiceError> {
        NewsArticleRepository::new(self.pool.clone())
            .find_by_id(id)
            .await?
            .ok_or_else(|| NewsServiceError::ArticleNotFound(id.to_string()))
    }

    async fn collect_user_preferred_tags(&self, user_id: &str) -> Result<Vec<String>, NewsServiceError> {
        let favorite_ids = FavoriteRepository::new(self.pool.clone())
            .list_target_ids_for_user(user_id, InteractionTargetType::News, 20)
            .await?;
        let like_ids = LikeRepository::new(self.pool.clone())
            .list_target_ids_for_user(user_id, InteractionTargetType::News, 20)
            .await?;

        let mut article_ids: Vec<String> = favorite_ids;
        for id in like_ids {
            if !article_ids.iter().any(|existing| existing == &id) {
                article_ids.push(id);
            }
        }

        let mut tag_counts: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
        let repo = NewsArticleRepository::new(self.pool.clone());
        for article_id in article_ids {
            if let Some(article) = repo.find_by_id(&article_id).await? {
                for tag in article.tags {
                    *tag_counts.entry(tag).or_default() += 1;
                }
            }
        }

        let mut tags: Vec<(String, usize)> = tag_counts.into_iter().collect();
        tags.sort_by(|left, right| right.1.cmp(&left.1).then_with(|| left.0.cmp(&right.0)));
        Ok(tags.into_iter().take(5).map(|(tag, _)| tag).collect())
    }

    async fn to_comment_item(
        &self,
        comment: crate::domain::CommunityComment,
    ) -> Result<NewsCommentItem, NewsServiceError> {
        let author = UserRepository::new(self.pool.clone())
            .find_by_id(&comment.user_id)
            .await?
            .ok_or_else(|| NewsServiceError::ArticleNotFound(comment.user_id.clone()))?;

        Ok(NewsCommentItem {
            id: comment.id,
            article_id: comment.target_id,
            user_id: comment.user_id,
            author: NewsAuthorSummary {
                id: author.id,
                display_name: author.display_name,
            },
            parent_id: comment.parent_id,
            body: comment.body,
            like_count: comment.like_count,
            created_at: comment.created_at,
            updated_at: comment.updated_at,
        })
    }
}

impl From<CommunityRssSource> for RssSourceItem {
    fn from(source: CommunityRssSource) -> Self {
        Self {
            id: source.id,
            title: source.title,
            feed_url: source.feed_url,
            site_url: source.site_url,
            category: source.category,
            language: source.language,
            enabled: source.enabled,
            fetch_interval_minutes: source.fetch_interval_minutes,
            last_fetched_at: source.last_fetched_at,
            last_error: source.last_error,
            created_at: source.created_at,
        }
    }
}

fn map_source_error(error: RssSourceRepositoryError) -> NewsServiceError {
    match error {
        RssSourceRepositoryError::NotFound(value) => NewsServiceError::SourceNotFound(value),
        RssSourceRepositoryError::FeedUrlConflict(_) => NewsServiceError::FeedUrlConflict,
        RssSourceRepositoryError::Validation(news_error) => {
            NewsServiceError::Validation(news_error.to_string())
        }
        other => NewsServiceError::RssSource(other),
    }
}

fn map_article_error(error: NewsArticleRepositoryError) -> NewsServiceError {
    match error {
        NewsArticleRepositoryError::NotFound(value) => NewsServiceError::ArticleNotFound(value),
        other => NewsServiceError::Article(other),
    }
}

fn ensure_active(actor: &CommunityUser) -> Result<(), NewsServiceError> {
    actor.ensure_active().map_err(|_| NewsServiceError::Forbidden)
}

fn map_favorite_error(error: crate::repositories::FavoriteRepositoryError) -> NewsServiceError {
    match error {
        crate::repositories::FavoriteRepositoryError::Conflict => NewsServiceError::FavoriteConflict,
        other => NewsServiceError::Favorite(other),
    }
}

fn map_like_error(error: crate::repositories::LikeRepositoryError) -> NewsServiceError {
    match error {
        crate::repositories::LikeRepositoryError::Conflict => NewsServiceError::LikeConflict,
        other => NewsServiceError::Like(other),
    }
}

fn map_dislike_error(error: DislikeRepositoryError) -> NewsServiceError {
    match error {
        DislikeRepositoryError::Conflict => NewsServiceError::Validation("already disliked".to_string()),
        other => NewsServiceError::Validation(other.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use uuid::Uuid;

    use crate::db::init_pool;
    use crate::domain::CreateRssSourceInput;

    use super::*;

    const SAMPLE_RSS: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>AI News</title>
    <link>https://example.com</link>
    <item>
      <title>Model Update</title>
      <link>https://example.com/posts/1</link>
      <guid>ai-post-1</guid>
      <description>Official AI update</description>
      <pubDate>Mon, 01 Jan 2024 12:00:00 GMT</pubDate>
    </item>
    <item>
      <title>Second Post</title>
      <link>https://example.com/posts/2</link>
      <guid>ai-post-2</guid>
      <description>Another update</description>
      <pubDate>Tue, 02 Jan 2024 12:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>"#;

    fn temp_db_path() -> PathBuf {
        std::env::temp_dir().join(format!("toolman-news-service-{}", Uuid::new_v4()))
    }

    #[tokio::test]
    async fn ingest_feed_deduplicates_by_source_and_guid() {
        let db_path = temp_db_path();
        let pool = init_pool(&db_path).await.expect("init pool");
        let service = NewsService::new(pool.clone());

        let source = service
            .create_source(CreateRssSourceInput {
                id: Some("openai-news-test".into()),
                title: "OpenAI News".into(),
                feed_url: format!("https://example.com/feed/{}", Uuid::new_v4()),
                site_url: Some("https://openai.com/news".into()),
                category: Some("ai".into()),
                language: Some("en".into()),
                enabled: Some(true),
                fetch_interval_minutes: Some(60),
            })
            .await
            .expect("create source");

        let first = service
            .ingest_feed_bytes(&source.id, SAMPLE_RSS.as_bytes())
            .await
            .expect("first ingest");
        assert_eq!(first.articles_added, 2);
        assert_eq!(first.articles_seen, 2);

        let second = service
            .ingest_feed_bytes(&source.id, SAMPLE_RSS.as_bytes())
            .await
            .expect("second ingest");
        assert_eq!(second.articles_added, 0);
        assert_eq!(second.articles_seen, 2);

        let articles = service
            .list_articles(
                &NewsArticleQuery {
                    source_id: Some(source.id),
                    limit: 10,
                    offset: 0,
                    ..Default::default()
                },
                None,
            )
            .await
            .expect("list articles");
        assert_eq!(articles.len(), 2);

        pool.close().await;
        let _ = std::fs::remove_file(db_path);
    }

    #[tokio::test]
    async fn favorite_and_like_update_counts_once() {
        let db_path = temp_db_path();
        let pool = init_pool(&db_path).await.expect("init pool");
        let service = NewsService::new(pool.clone());
        let user_repo = crate::repositories::UserRepository::new(pool.clone());

        let source = service
            .create_source(CreateRssSourceInput {
                id: Some("interaction-source".into()),
                title: "Interaction Feed".into(),
                feed_url: format!("https://example.com/feed/{}", Uuid::new_v4()),
                site_url: None,
                category: Some("ai".into()),
                language: None,
                enabled: Some(true),
                fetch_interval_minutes: None,
            })
            .await
            .expect("source");

        service
            .ingest_feed_bytes(&source.id, SAMPLE_RSS.as_bytes())
            .await
            .expect("ingest");

        let article = service
            .list_articles(
                &NewsArticleQuery {
                    source_id: Some(source.id),
                    limit: 1,
                    offset: 0,
                    ..Default::default()
                },
                None,
            )
            .await
            .expect("list")[0]
            .clone();

        let user = user_repo
            .find_or_create_by_identity_id(&Uuid::new_v4().to_string(), Some("Reader"))
            .await
            .expect("user");

        let favorite = service
            .favorite_article(&user, &article.id)
            .await
            .expect("favorite");
        assert_eq!(favorite.favorite_count, 1);

        let like = service.like_article(&user, &article.id).await.expect("like");
        assert_eq!(like.like_count, 1);

        let duplicate_favorite = service.favorite_article(&user, &article.id).await;
        assert!(matches!(
            duplicate_favorite,
            Err(NewsServiceError::FavoriteConflict)
        ));

        let duplicate_like = service.like_article(&user, &article.id).await.expect("unlike");
        assert_eq!(duplicate_like.like_count, 0);

        let updated = service.get_article(&article.id, None).await.expect("get");
        assert_eq!(updated.favorite_count, 1);
        assert_eq!(updated.like_count, 0);

        pool.close().await;
        let _ = std::fs::remove_file(db_path);
    }

    #[tokio::test]
    async fn recommended_articles_returns_results() {
        let db_path = temp_db_path();
        let pool = init_pool(&db_path).await.expect("init pool");
        let service = NewsService::new(pool.clone());

        let source = service
            .create_source(CreateRssSourceInput {
                id: Some("recommended-source".into()),
                title: "Recommended Feed".into(),
                feed_url: format!("https://example.com/feed/{}", Uuid::new_v4()),
                site_url: None,
                category: Some("ai".into()),
                language: None,
                enabled: Some(true),
                fetch_interval_minutes: None,
            })
            .await
            .expect("source");

        service
            .ingest_feed_bytes(&source.id, SAMPLE_RSS.as_bytes())
            .await
            .expect("ingest");

        let items = service
            .recommended_articles(None, 5)
            .await
            .expect("recommended");
        assert!(!items.is_empty());

        pool.close().await;
        let _ = std::fs::remove_file(db_path);
    }
}
