use serde::Serialize;
use sqlx::SqlitePool;

use crate::domain::{CommunityUser, InteractionTargetType, ResourceCounter};
use crate::repositories::dislike_repository::{
    CreateDislikeInput, DislikeRepository, DislikeRepositoryError,
};
use crate::repositories::favorite_repository::{
    CreateFavoriteInput, FavoriteRepository, FavoriteRepositoryError,
};
use crate::repositories::like_repository::{CreateLikeInput, LikeRepository, LikeRepositoryError};
use crate::repositories::resource_repository::{RepositoryError, ResourceRepository};

#[derive(Debug, Clone, Serialize)]
pub struct ResourceInteractionResult {
    pub resource_id: String,
    pub like_count: i64,
    pub dislike_count: i64,
    pub favorite_count: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub liked: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub favorited: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub disliked: Option<bool>,
}

#[derive(Debug, thiserror::Error)]
pub enum ResourceSocialError {
    #[error("forbidden")]
    Forbidden,
    #[error("resource not found: {0}")]
    NotFound(String),
    #[error("already liked")]
    AlreadyLiked,
    #[error("already disliked")]
    AlreadyDisliked,
    #[error("already favorited")]
    AlreadyFavorited,
    #[error("repository error: {0}")]
    Repository(#[from] RepositoryError),
    #[error("like error: {0}")]
    Like(#[from] LikeRepositoryError),
    #[error("dislike error: {0}")]
    Dislike(#[from] DislikeRepositoryError),
    #[error("favorite error: {0}")]
    Favorite(#[from] FavoriteRepositoryError),
}

#[derive(Clone)]
pub struct ResourceSocialService {
    pool: SqlitePool,
}

impl ResourceSocialService {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn like_resource(
        &self,
        actor: &CommunityUser,
        resource_id: &str,
    ) -> Result<ResourceInteractionResult, ResourceSocialError> {
        ensure_active(actor)?;
        self.require_resource(resource_id).await?;

        let likes = LikeRepository::new(self.pool.clone());
        if likes
            .find_by_user_and_target(
                &actor.id,
                InteractionTargetType::Resource,
                resource_id,
            )
            .await?
            .is_some()
        {
            likes
                .delete_by_user_and_target(
                    &actor.id,
                    InteractionTargetType::Resource,
                    resource_id,
                )
                .await?;

            ResourceRepository::new(self.pool.clone())
                .decrement_counter(resource_id, ResourceCounter::Like)
                .await?;

            return self.build_result(resource_id, actor).await;
        }

        let dislikes = DislikeRepository::new(self.pool.clone());
        if dislikes
            .delete_by_user_and_target(
                &actor.id,
                InteractionTargetType::Resource,
                resource_id,
            )
            .await?
        {
            ResourceRepository::new(self.pool.clone())
                .decrement_counter(resource_id, ResourceCounter::Dislike)
                .await?;
        }

        likes
            .create(CreateLikeInput {
                user_id: actor.id.clone(),
                target_type: InteractionTargetType::Resource,
                target_id: resource_id.to_string(),
            })
            .await?;

        ResourceRepository::new(self.pool.clone())
            .increment_counter(resource_id, ResourceCounter::Like, 1)
            .await?;

        self.build_result(resource_id, actor).await
    }

    pub async fn dislike_resource(
        &self,
        actor: &CommunityUser,
        resource_id: &str,
    ) -> Result<ResourceInteractionResult, ResourceSocialError> {
        ensure_active(actor)?;
        self.require_resource(resource_id).await?;

        let dislikes = DislikeRepository::new(self.pool.clone());
        if dislikes
            .find_by_user_and_target(
                &actor.id,
                InteractionTargetType::Resource,
                resource_id,
            )
            .await?
            .is_some()
        {
            dislikes
                .delete_by_user_and_target(
                    &actor.id,
                    InteractionTargetType::Resource,
                    resource_id,
                )
                .await?;

            ResourceRepository::new(self.pool.clone())
                .decrement_counter(resource_id, ResourceCounter::Dislike)
                .await?;

            return self.build_result(resource_id, actor).await;
        }

        let likes = LikeRepository::new(self.pool.clone());
        if likes
            .delete_by_user_and_target(
                &actor.id,
                InteractionTargetType::Resource,
                resource_id,
            )
            .await?
        {
            ResourceRepository::new(self.pool.clone())
                .decrement_counter(resource_id, ResourceCounter::Like)
                .await?;
        }

        dislikes
            .create(CreateDislikeInput {
                user_id: actor.id.clone(),
                target_type: InteractionTargetType::Resource,
                target_id: resource_id.to_string(),
            })
            .await?;

        ResourceRepository::new(self.pool.clone())
            .increment_counter(resource_id, ResourceCounter::Dislike, 1)
            .await?;

        self.build_result(resource_id, actor).await
    }

    pub async fn favorite_resource(
        &self,
        actor: &CommunityUser,
        resource_id: &str,
    ) -> Result<ResourceInteractionResult, ResourceSocialError> {
        ensure_active(actor)?;
        self.require_resource(resource_id).await?;

        let favorites = FavoriteRepository::new(self.pool.clone());
        if favorites
            .find_by_user_and_target(
                &actor.id,
                InteractionTargetType::Resource,
                resource_id,
            )
            .await?
            .is_some()
        {
            favorites
                .delete_by_user_and_target(
                    &actor.id,
                    InteractionTargetType::Resource,
                    resource_id,
                )
                .await
                .map_err(|error| match error {
                    FavoriteRepositoryError::NotFound(_) => {
                        ResourceSocialError::NotFound(resource_id.to_string())
                    }
                    other => ResourceSocialError::Favorite(other),
                })?;

            ResourceRepository::new(self.pool.clone())
                .decrement_counter(resource_id, ResourceCounter::Favorite)
                .await?;

            return self.build_result(resource_id, actor).await;
        }

        favorites
            .create(CreateFavoriteInput {
                user_id: actor.id.clone(),
                target_type: InteractionTargetType::Resource,
                target_id: resource_id.to_string(),
            })
            .await
            .map_err(|error| match error {
                FavoriteRepositoryError::Conflict => ResourceSocialError::AlreadyFavorited,
                other => ResourceSocialError::Favorite(other),
            })?;

        ResourceRepository::new(self.pool.clone())
            .increment_counter(resource_id, ResourceCounter::Favorite, 1)
            .await?;

        self.build_result(resource_id, actor).await
    }

    async fn require_resource(&self, id: &str) -> Result<(), ResourceSocialError> {
        let resource = ResourceRepository::new(self.pool.clone())
            .find_by_id(id)
            .await?
            .ok_or_else(|| ResourceSocialError::NotFound(id.to_string()))?;

        if resource.deleted_at.is_some() {
            return Err(ResourceSocialError::NotFound(id.to_string()));
        }

        Ok(())
    }

    async fn build_result(
        &self,
        resource_id: &str,
        actor: &CommunityUser,
    ) -> Result<ResourceInteractionResult, ResourceSocialError> {
        let resource = ResourceRepository::new(self.pool.clone())
            .find_by_id(resource_id)
            .await?
            .ok_or_else(|| ResourceSocialError::NotFound(resource_id.to_string()))?;

        let likes = LikeRepository::new(self.pool.clone());
        let dislikes = DislikeRepository::new(self.pool.clone());
        let favorites = FavoriteRepository::new(self.pool.clone());

        let liked = likes
            .find_by_user_and_target(&actor.id, InteractionTargetType::Resource, resource_id)
            .await?
            .is_some();
        let disliked = dislikes
            .find_by_user_and_target(&actor.id, InteractionTargetType::Resource, resource_id)
            .await?
            .is_some();
        let favorited = favorites
            .find_by_user_and_target(&actor.id, InteractionTargetType::Resource, resource_id)
            .await?
            .is_some();

        Ok(ResourceInteractionResult {
            resource_id: resource.id,
            like_count: resource.like_count,
            dislike_count: resource.dislike_count,
            favorite_count: resource.favorite_count,
            liked: Some(liked),
            favorited: Some(favorited),
            disliked: Some(disliked),
        })
    }
}

fn ensure_active(user: &CommunityUser) -> Result<(), ResourceSocialError> {
    user.ensure_active().map_err(|_| ResourceSocialError::Forbidden)
}
