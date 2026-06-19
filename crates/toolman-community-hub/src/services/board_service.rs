use serde::Serialize;
use sqlx::SqlitePool;

use crate::domain::{CommunityUser, InteractionTargetType};
use crate::repositories::{
    CommentListFilter, CommentRepository, CreateCommentInput, CreateDislikeInput, CreateFavoriteInput,
    CreateLikeInput, DislikeRepository, FavoriteRepository, LikeRepository, UserRepository,
};

pub const BOARD_MAIN_ID: &str = "main";
const BOARD_MESSAGE_TARGET_TYPE: InteractionTargetType = InteractionTargetType::Comment;

#[derive(Debug, Clone, Serialize)]
pub struct BoardAuthorSummary {
    pub id: String,
    pub display_name: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct BoardMessageItem {
    pub id: String,
    pub user_id: String,
    pub author: BoardAuthorSummary,
    pub parent_id: Option<String>,
    pub body: String,
    pub like_count: i64,
    pub dislike_count: i64,
    pub favorite_count: i64,
    pub reply_count: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub liked_by_me: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub disliked_by_me: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub favorited_by_me: Option<bool>,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone)]
pub struct CreateBoardMessageRequest {
    pub body: String,
    pub parent_id: Option<String>,
}

#[derive(Debug, thiserror::Error)]
pub enum BoardServiceError {
    #[error("message not found: {0}")]
    NotFound(String),
    #[error("validation error: {0}")]
    Validation(String),
    #[error("forbidden")]
    Forbidden,
    #[error("user repository error: {0}")]
    User(#[from] crate::repositories::UserRepositoryError),
    #[error("comment repository error: {0}")]
    Comment(#[from] crate::repositories::CommentRepositoryError),
}

#[derive(Clone)]
pub struct BoardService {
    pool: SqlitePool,
}

impl BoardService {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn list_messages(
        &self,
        user_id: Option<String>,
        parent_id: Option<Option<String>>,
        limit: i64,
        offset: i64,
        viewer: Option<&CommunityUser>,
    ) -> Result<Vec<BoardMessageItem>, BoardServiceError> {
        let comments = CommentRepository::new(self.pool.clone())
            .list(&CommentListFilter {
                target_type: InteractionTargetType::Board,
                target_id: BOARD_MAIN_ID.to_string(),
                user_id,
                parent_id,
                limit,
                offset,
            })
            .await?;

        let mut items = Vec::with_capacity(comments.len());
        for comment in comments {
            items.push(self.to_message_item(comment, viewer).await?);
        }
        Ok(items)
    }

    pub async fn create_message(
        &self,
        actor: &CommunityUser,
        input: CreateBoardMessageRequest,
    ) -> Result<BoardMessageItem, BoardServiceError> {
        ensure_active(actor)?;

        if let Some(parent_id) = &input.parent_id {
            let parent = CommentRepository::new(self.pool.clone())
                .find_by_id(parent_id)
                .await?
                .ok_or_else(|| BoardServiceError::NotFound(parent_id.clone()))?;

            if parent.target_type != InteractionTargetType::Board
                || parent.target_id != BOARD_MAIN_ID
                || parent.parent_id.is_some()
            {
                return Err(BoardServiceError::Validation(
                    "invalid parent message".to_string(),
                ));
            }
        }

        let comment = CommentRepository::new(self.pool.clone())
            .create(CreateCommentInput {
                target_type: InteractionTargetType::Board,
                target_id: BOARD_MAIN_ID.to_string(),
                user_id: actor.id.clone(),
                parent_id: input.parent_id,
                body: input.body,
            })
            .await?;

        self.to_message_item(comment, Some(actor)).await
    }

    pub async fn like_message(
        &self,
        actor: &CommunityUser,
        message_id: &str,
    ) -> Result<BoardMessageItem, BoardServiceError> {
        ensure_active(actor)?;
        self.require_board_message(message_id).await?;

        let likes = LikeRepository::new(self.pool.clone());
        if likes
            .find_by_user_and_target(&actor.id, BOARD_MESSAGE_TARGET_TYPE, message_id)
            .await
            .map_err(|error| BoardServiceError::Validation(error.to_string()))?
            .is_some()
        {
            likes
                .delete_by_user_and_target(&actor.id, BOARD_MESSAGE_TARGET_TYPE, message_id)
                .await
                .map_err(|error| BoardServiceError::Validation(error.to_string()))?;

            let updated = CommentRepository::new(self.pool.clone())
                .decrement_like_count(message_id)
                .await?;

            return self.to_message_item(updated, Some(actor)).await;
        }

        let dislikes = DislikeRepository::new(self.pool.clone());
        if dislikes
            .delete_by_user_and_target(&actor.id, BOARD_MESSAGE_TARGET_TYPE, message_id)
            .await
            .map_err(|error| BoardServiceError::Validation(error.to_string()))?
        {
            CommentRepository::new(self.pool.clone())
                .decrement_dislike_count(message_id)
                .await?;
        }

        likes
            .create(CreateLikeInput {
                user_id: actor.id.clone(),
                target_type: BOARD_MESSAGE_TARGET_TYPE,
                target_id: message_id.to_string(),
            })
            .await
            .map_err(|error| match error {
                crate::repositories::LikeRepositoryError::Conflict => {
                    BoardServiceError::Validation("already liked".to_string())
                }
                other => BoardServiceError::Validation(other.to_string()),
            })?;

        let updated = CommentRepository::new(self.pool.clone())
            .increment_like_count(message_id)
            .await?;

        self.to_message_item(updated, Some(actor)).await
    }

    pub async fn dislike_message(
        &self,
        actor: &CommunityUser,
        message_id: &str,
    ) -> Result<BoardMessageItem, BoardServiceError> {
        ensure_active(actor)?;
        self.require_board_message(message_id).await?;

        let dislikes = DislikeRepository::new(self.pool.clone());
        if dislikes
            .find_by_user_and_target(&actor.id, BOARD_MESSAGE_TARGET_TYPE, message_id)
            .await
            .map_err(|error| BoardServiceError::Validation(error.to_string()))?
            .is_some()
        {
            dislikes
                .delete_by_user_and_target(&actor.id, BOARD_MESSAGE_TARGET_TYPE, message_id)
                .await
                .map_err(|error| BoardServiceError::Validation(error.to_string()))?;

            let updated = CommentRepository::new(self.pool.clone())
                .decrement_dislike_count(message_id)
                .await?;

            return self.to_message_item(updated, Some(actor)).await;
        }

        let likes = LikeRepository::new(self.pool.clone());
        if likes
            .delete_by_user_and_target(&actor.id, BOARD_MESSAGE_TARGET_TYPE, message_id)
            .await
            .map_err(|error| BoardServiceError::Validation(error.to_string()))?
        {
            CommentRepository::new(self.pool.clone())
                .decrement_like_count(message_id)
                .await?;
        }

        dislikes
            .create(CreateDislikeInput {
                user_id: actor.id.clone(),
                target_type: BOARD_MESSAGE_TARGET_TYPE,
                target_id: message_id.to_string(),
            })
            .await
            .map_err(|error| match error {
                crate::repositories::DislikeRepositoryError::Conflict => {
                    BoardServiceError::Validation("already disliked".to_string())
                }
                other => BoardServiceError::Validation(other.to_string()),
            })?;

        let updated = CommentRepository::new(self.pool.clone())
            .increment_dislike_count(message_id)
            .await?;

        self.to_message_item(updated, Some(actor)).await
    }

    pub async fn favorite_message(
        &self,
        actor: &CommunityUser,
        message_id: &str,
    ) -> Result<BoardMessageItem, BoardServiceError> {
        ensure_active(actor)?;
        self.require_board_message(message_id).await?;

        let favorites = FavoriteRepository::new(self.pool.clone());
        if favorites
            .find_by_user_and_target(&actor.id, BOARD_MESSAGE_TARGET_TYPE, message_id)
            .await
            .map_err(|error| BoardServiceError::Validation(error.to_string()))?
            .is_some()
        {
            favorites
                .delete_by_user_and_target(&actor.id, BOARD_MESSAGE_TARGET_TYPE, message_id)
                .await
                .map_err(|error| BoardServiceError::Validation(error.to_string()))?;
        } else {
            favorites
                .create(CreateFavoriteInput {
                    user_id: actor.id.clone(),
                    target_type: BOARD_MESSAGE_TARGET_TYPE,
                    target_id: message_id.to_string(),
                })
                .await
                .map_err(|error| match error {
                    crate::repositories::FavoriteRepositoryError::Conflict => {
                        BoardServiceError::Validation("already favorited".to_string())
                    }
                    other => BoardServiceError::Validation(other.to_string()),
                })?;
        }

        let comment = CommentRepository::new(self.pool.clone())
            .find_by_id(message_id)
            .await?
            .ok_or_else(|| BoardServiceError::NotFound(message_id.to_string()))?;

        self.to_message_item(comment, Some(actor)).await
    }

    pub async fn delete_message(
        &self,
        actor: &CommunityUser,
        message_id: &str,
    ) -> Result<(), BoardServiceError> {
        ensure_active(actor)?;

        let comment = self.require_board_message(message_id).await?;

        if !actor.is_moderator() && actor.id != comment.user_id {
            return Err(BoardServiceError::Forbidden);
        }

        let deleted = CommentRepository::new(self.pool.clone())
            .soft_delete(message_id)
            .await?;

        if deleted {
            Ok(())
        } else {
            Err(BoardServiceError::NotFound(message_id.to_string()))
        }
    }

    async fn require_board_message(
        &self,
        message_id: &str,
    ) -> Result<crate::domain::CommunityComment, BoardServiceError> {
        let comment = CommentRepository::new(self.pool.clone())
            .find_by_id(message_id)
            .await?
            .ok_or_else(|| BoardServiceError::NotFound(message_id.to_string()))?;

        if comment.target_type != InteractionTargetType::Board || comment.target_id != BOARD_MAIN_ID {
            return Err(BoardServiceError::NotFound(message_id.to_string()));
        }

        Ok(comment)
    }

    async fn to_message_item(
        &self,
        comment: crate::domain::CommunityComment,
        viewer: Option<&CommunityUser>,
    ) -> Result<BoardMessageItem, BoardServiceError> {
        let author = UserRepository::new(self.pool.clone())
            .find_by_id(&comment.user_id)
            .await?
            .ok_or_else(|| BoardServiceError::NotFound(comment.user_id.clone()))?;

        let reply_count = if comment.parent_id.is_none() {
            CommentRepository::new(self.pool.clone())
                .count_replies(&comment.id)
                .await?
        } else {
            0
        };

        let favorite_count = FavoriteRepository::new(self.pool.clone())
            .count_by_target(BOARD_MESSAGE_TARGET_TYPE, &comment.id)
            .await
            .map_err(|error| BoardServiceError::Validation(error.to_string()))?;

        let (liked_by_me, disliked_by_me, favorited_by_me) = if let Some(viewer) = viewer {
            let likes = LikeRepository::new(self.pool.clone());
            let dislikes = DislikeRepository::new(self.pool.clone());
            let favorites = FavoriteRepository::new(self.pool.clone());

            let liked = likes
                .find_by_user_and_target(&viewer.id, BOARD_MESSAGE_TARGET_TYPE, &comment.id)
                .await
                .map_err(|error| BoardServiceError::Validation(error.to_string()))?
                .is_some();
            let disliked = dislikes
                .find_by_user_and_target(&viewer.id, BOARD_MESSAGE_TARGET_TYPE, &comment.id)
                .await
                .map_err(|error| BoardServiceError::Validation(error.to_string()))?
                .is_some();
            let favorited = favorites
                .find_by_user_and_target(&viewer.id, BOARD_MESSAGE_TARGET_TYPE, &comment.id)
                .await
                .map_err(|error| BoardServiceError::Validation(error.to_string()))?
                .is_some();

            (Some(liked), Some(disliked), Some(favorited))
        } else {
            (None, None, None)
        };

        Ok(BoardMessageItem {
            id: comment.id,
            user_id: comment.user_id,
            author: BoardAuthorSummary {
                id: author.id,
                display_name: author.display_name,
            },
            parent_id: comment.parent_id,
            body: comment.body,
            like_count: comment.like_count,
            dislike_count: comment.dislike_count,
            favorite_count,
            reply_count,
            liked_by_me,
            disliked_by_me,
            favorited_by_me,
            created_at: comment.created_at,
            updated_at: comment.updated_at,
        })
    }
}

fn ensure_active(user: &CommunityUser) -> Result<(), BoardServiceError> {
    user.ensure_active().map_err(|_| BoardServiceError::Forbidden)
}
