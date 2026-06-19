use serde::Serialize;
use sqlx::SqlitePool;

use crate::domain::{CommunityUser, InteractionTargetType};
use crate::repositories::{
    CommentListFilter, CommentRepository, CreateCommentInput, NewsArticleRepository,
    ResourceRepository, TaskRepository, UserRepository,
};
use crate::services::board_service::{BoardService, BOARD_MAIN_ID};

#[derive(Debug, Clone, Serialize)]
pub struct CommentAuthorSummary {
    pub id: String,
    pub display_name: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct CommentItem {
    pub id: String,
    pub target_type: String,
    pub target_id: String,
    pub parent_id: Option<String>,
    pub user_id: String,
    pub author: CommentAuthorSummary,
    pub body: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone)]
pub struct ListCommentsQuery {
    pub target_type: InteractionTargetType,
    pub target_id: String,
    pub parent_id: Option<String>,
    pub limit: i64,
    pub offset: i64,
}

#[derive(Debug, Clone)]
pub struct CreateCommentRequest {
    pub target_type: InteractionTargetType,
    pub target_id: String,
    pub body: String,
    pub parent_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CommentCountResult {
    pub target_type: String,
    pub target_id: String,
    pub count: i64,
}

#[derive(Debug, thiserror::Error)]
pub enum CommentServiceError {
    #[error("forbidden")]
    Forbidden,
    #[error("not found: {0}")]
    NotFound(String),
    #[error("validation error: {0}")]
    Validation(String),
    #[error("comment repository error: {0}")]
    CommentRepository(#[from] crate::repositories::CommentRepositoryError),
    #[error("user repository error: {0}")]
    UserRepository(#[from] crate::repositories::UserRepositoryError),
    #[error("resource repository error: {0}")]
    ResourceRepository(#[from] crate::repositories::RepositoryError),
    #[error("task repository error: {0}")]
    TaskRepository(#[from] crate::repositories::TaskRepositoryError),
    #[error("news article repository error: {0}")]
    NewsArticleRepository(#[from] crate::repositories::NewsArticleRepositoryError),
    #[error("board service error: {0}")]
    Board(#[from] crate::services::BoardServiceError),
}

pub struct CommentService {
    pool: SqlitePool,
}

impl CommentService {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn list_comments(
        &self,
        query: ListCommentsQuery,
    ) -> Result<Vec<CommentItem>, CommentServiceError> {
        self.validate_target(&query.target_type, &query.target_id, query.parent_id.as_deref())
            .await?;

        let parent_filter = match query.parent_id {
            Some(parent_id) => Some(Some(parent_id)),
            None => Some(None),
        };

        let comments = CommentRepository::new(self.pool.clone())
            .list(&CommentListFilter {
                target_type: query.target_type,
                target_id: query.target_id,
                user_id: None,
                parent_id: parent_filter,
                limit: query.limit,
                offset: query.offset,
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
        input: CreateCommentRequest,
    ) -> Result<CommentItem, CommentServiceError> {
        ensure_active(actor)?;
        self.validate_target(
            &input.target_type,
            &input.target_id,
            input.parent_id.as_deref(),
        )
        .await?;

        if let InteractionTargetType::Board = input.target_type {
            if let Some(parent_id) = &input.parent_id {
                let parent = CommentRepository::new(self.pool.clone())
                    .find_by_id(parent_id)
                    .await?
                    .ok_or_else(|| CommentServiceError::NotFound(parent_id.clone()))?;

                if parent.target_type != InteractionTargetType::Board
                    || parent.target_id != BOARD_MAIN_ID
                    || parent.parent_id.is_some()
                {
                    return Err(CommentServiceError::Validation(
                        "invalid parent message".to_string(),
                    ));
                }
            } else {
                return Err(CommentServiceError::Validation(
                    "board replies require parent_id".to_string(),
                ));
            }
        }

        let comment = CommentRepository::new(self.pool.clone())
            .create(CreateCommentInput {
                target_type: input.target_type,
                target_id: input.target_id,
                user_id: actor.id.clone(),
                parent_id: input.parent_id,
                body: input.body,
            })
            .await?;

        self.to_comment_item(comment).await
    }

    pub async fn delete_comment(
        &self,
        actor: &CommunityUser,
        comment_id: &str,
    ) -> Result<(), CommentServiceError> {
        ensure_active(actor)?;

        let comment = CommentRepository::new(self.pool.clone())
            .find_by_id(comment_id)
            .await?
            .ok_or_else(|| CommentServiceError::NotFound(comment_id.to_string()))?;

        if !actor.is_moderator() && actor.id != comment.user_id {
            return Err(CommentServiceError::Forbidden);
        }

        if comment.target_type == InteractionTargetType::Board {
            BoardService::new(self.pool.clone())
                .delete_message(actor, comment_id)
                .await?;
            return Ok(());
        }

        let deleted = CommentRepository::new(self.pool.clone())
            .soft_delete(comment_id)
            .await?;

        if deleted {
            Ok(())
        } else {
            Err(CommentServiceError::NotFound(comment_id.to_string()))
        }
    }

    pub async fn count_comments(
        &self,
        target_type: InteractionTargetType,
        target_id: &str,
        parent_id: Option<&str>,
    ) -> Result<i64, CommentServiceError> {
        self.validate_target(&target_type, target_id, parent_id)
            .await?;

        let repo = CommentRepository::new(self.pool.clone());
        if let Some(parent_id) = parent_id {
            return Ok(repo.count_replies(parent_id).await?);
        }

        Ok(repo
            .count_top_level_comments(target_type, target_id)
            .await?)
    }

    async fn validate_target(
        &self,
        target_type: &InteractionTargetType,
        target_id: &str,
        parent_id: Option<&str>,
    ) -> Result<(), CommentServiceError> {
        match target_type {
            InteractionTargetType::News => {
                NewsArticleRepository::new(self.pool.clone())
                    .find_by_id(target_id)
                    .await?
                    .ok_or_else(|| CommentServiceError::NotFound(target_id.to_string()))?;
            }
            InteractionTargetType::Resource => {
                let resource = ResourceRepository::new(self.pool.clone())
                    .find_by_id(target_id)
                    .await?
                    .ok_or_else(|| CommentServiceError::NotFound(target_id.to_string()))?;
                if resource.deleted_at.is_some() {
                    return Err(CommentServiceError::NotFound(target_id.to_string()));
                }
            }
            InteractionTargetType::Task => {
                TaskRepository::new(self.pool.clone())
                    .find_by_id(target_id)
                    .await?
                    .ok_or_else(|| CommentServiceError::NotFound(target_id.to_string()))?;
            }
            InteractionTargetType::Board => {
                if target_id != BOARD_MAIN_ID {
                    return Err(CommentServiceError::Validation(
                        "invalid board target".to_string(),
                    ));
                }
                if let Some(parent_id) = parent_id {
                    let parent = CommentRepository::new(self.pool.clone())
                        .find_by_id(parent_id)
                        .await?
                        .ok_or_else(|| CommentServiceError::NotFound(parent_id.to_string()))?;
                    if parent.target_type != InteractionTargetType::Board
                        || parent.target_id != BOARD_MAIN_ID
                        || parent.parent_id.is_some()
                    {
                        return Err(CommentServiceError::Validation(
                            "invalid parent message".to_string(),
                        ));
                    }
                }
            }
            _ => {
                return Err(CommentServiceError::Validation(
                    "unsupported comment target".to_string(),
                ));
            }
        }
        Ok(())
    }

    async fn to_comment_item(
        &self,
        comment: crate::domain::CommunityComment,
    ) -> Result<CommentItem, CommentServiceError> {
        let author = UserRepository::new(self.pool.clone())
            .find_by_id(&comment.user_id)
            .await?
            .ok_or_else(|| CommentServiceError::NotFound(comment.user_id.clone()))?;

        Ok(CommentItem {
            id: comment.id,
            target_type: comment.target_type.as_str().to_string(),
            target_id: comment.target_id,
            parent_id: comment.parent_id,
            user_id: comment.user_id,
            author: CommentAuthorSummary {
                id: author.id,
                display_name: author.display_name,
            },
            body: comment.body,
            created_at: comment.created_at,
            updated_at: comment.updated_at,
        })
    }
}

fn ensure_active(user: &CommunityUser) -> Result<(), CommentServiceError> {
    user.ensure_active().map_err(|_| CommentServiceError::Forbidden)
}
