use serde::Serialize;
use sqlx::SqlitePool;

use crate::domain::{CommunityUser, UserRole};
use crate::repositories::review_repository::{
    CommunityReview, CreateReviewInput, ReviewListFilter, ReviewRepository,
    ReviewRepositoryError, UpdateReviewInput,
};
use crate::repositories::UserRepository;
use crate::services::rating_service::RatingService;

#[derive(Debug, Clone)]
pub struct CreateReviewRequest {
    pub resource_id: String,
    pub rating: i64,
    pub title: Option<String>,
    pub body: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub struct ReviewListQuery {
    pub resource_id: Option<String>,
    pub limit: i64,
    pub offset: i64,
}

#[derive(Debug, Clone)]
pub struct UpdateReviewRequest {
    pub rating: Option<i64>,
    pub title: Option<String>,
    pub body: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ReviewAuthorSummary {
    pub id: String,
    pub display_name: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ReviewItem {
    pub id: String,
    pub resource_id: String,
    pub user_id: String,
    pub author: ReviewAuthorSummary,
    pub rating: i64,
    pub title: Option<String>,
    pub body: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, thiserror::Error)]
pub enum ReviewError {
    #[error("forbidden")]
    Forbidden,
    #[error("review not found: {0}")]
    NotFound(String),
    #[error("resource not found: {0}")]
    ResourceNotFound(String),
    #[error("review already exists for this resource")]
    Conflict,
    #[error("invalid rating: must be between 1 and 5")]
    InvalidRating,
    #[error("resource_id is required")]
    MissingResourceId,
    #[error("repository error: {0}")]
    Repository(#[from] ReviewRepositoryError),
    #[error("user repository error: {0}")]
    UserRepository(#[from] crate::repositories::UserRepositoryError),
    #[error("rating error: {0}")]
    Rating(#[from] crate::services::RatingError),
}

pub struct ReviewService {
    pool: SqlitePool,
}

impl ReviewService {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn create_review(
        &self,
        actor: &CommunityUser,
        input: CreateReviewRequest,
    ) -> Result<ReviewItem, ReviewError> {
        ensure_active(actor)?;

        let review = ReviewRepository::new(self.pool.clone())
            .create(CreateReviewInput {
                resource_id: input.resource_id.clone(),
                user_id: actor.id.clone(),
                rating: input.rating,
                title: input.title,
                body: input.body,
            })
            .await
            .map_err(map_repository_error)?;

        RatingService::new(self.pool.clone())
            .refresh_resource_rating(&review.resource_id)
            .await?;

        self.to_review_item(review).await
    }

    pub async fn list_reviews(
        &self,
        query: &ReviewListQuery,
    ) -> Result<Vec<ReviewItem>, ReviewError> {
        let resource_id = query
            .resource_id
            .as_deref()
            .filter(|value| !value.trim().is_empty())
            .ok_or(ReviewError::MissingResourceId)?;

        let reviews = ReviewRepository::new(self.pool.clone())
            .list(&ReviewListFilter {
                resource_id: Some(resource_id.to_string()),
                user_id: None,
                limit: query.limit,
                offset: query.offset,
            })
            .await?;

        let mut items = Vec::with_capacity(reviews.len());
        for review in reviews {
            items.push(self.to_review_item(review).await?);
        }
        Ok(items)
    }

    pub async fn update_review(
        &self,
        actor: &CommunityUser,
        id: &str,
        input: UpdateReviewRequest,
    ) -> Result<ReviewItem, ReviewError> {
        ensure_active(actor)?;

        let current = ReviewRepository::new(self.pool.clone())
            .find_by_id(id)
            .await?
            .ok_or_else(|| ReviewError::NotFound(id.to_string()))?;

        ensure_owner_or_admin(actor, &current.user_id)?;

        let review = ReviewRepository::new(self.pool.clone())
            .update(
                id,
                UpdateReviewInput {
                    rating: input.rating,
                    title: input.title.map(Some),
                    body: input.body,
                },
            )
            .await
            .map_err(map_repository_error)?;

        RatingService::new(self.pool.clone())
            .refresh_resource_rating(&review.resource_id)
            .await?;

        self.to_review_item(review).await
    }

    pub async fn delete_review(&self, actor: &CommunityUser, id: &str) -> Result<(), ReviewError> {
        ensure_active(actor)?;

        let current = ReviewRepository::new(self.pool.clone())
            .find_by_id(id)
            .await?
            .ok_or_else(|| ReviewError::NotFound(id.to_string()))?;

        ensure_owner_or_admin(actor, &current.user_id)?;

        let deleted = ReviewRepository::new(self.pool.clone())
            .delete(id)
            .await?;

        RatingService::new(self.pool.clone())
            .refresh_resource_rating(&deleted.resource_id)
            .await?;

        Ok(())
    }

    async fn to_review_item(&self, review: CommunityReview) -> Result<ReviewItem, ReviewError> {
        let author = UserRepository::new(self.pool.clone())
            .find_by_id(&review.user_id)
            .await?
            .ok_or_else(|| ReviewError::NotFound(review.user_id.clone()))?;

        Ok(ReviewItem {
            id: review.id,
            resource_id: review.resource_id,
            user_id: review.user_id,
            author: ReviewAuthorSummary {
                id: author.id,
                display_name: author.display_name,
            },
            rating: review.rating,
            title: review.title,
            body: review.body,
            created_at: review.created_at,
            updated_at: review.updated_at,
        })
    }
}

fn ensure_active(actor: &CommunityUser) -> Result<(), ReviewError> {
    actor.ensure_active().map_err(|_| ReviewError::Forbidden)
}

fn ensure_owner_or_admin(actor: &CommunityUser, owner_id: &str) -> Result<(), ReviewError> {
    if actor.is_moderator() || actor.id == owner_id {
        Ok(())
    } else {
        Err(ReviewError::Forbidden)
    }
}

fn map_repository_error(error: ReviewRepositoryError) -> ReviewError {
    match error {
        ReviewRepositoryError::Conflict { .. } => ReviewError::Conflict,
        ReviewRepositoryError::NotFound(value) => ReviewError::NotFound(value),
        ReviewRepositoryError::ResourceNotFound(value) => ReviewError::ResourceNotFound(value),
        ReviewRepositoryError::InvalidRating => ReviewError::InvalidRating,
        other => ReviewError::Repository(other),
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use serde_json::json;
    use uuid::Uuid;

    use crate::db::init_pool;
    use crate::db::seed::DEFAULT_ADMIN_USER_ID;
    use crate::domain::{CreateResourceInput, ResourceStatus, ResourceType};
    use crate::repositories::{ResourceRepository, UserRepository};

    use super::*;

    fn temp_db_path() -> PathBuf {
        std::env::temp_dir().join(format!("toolman-review-service-{}", Uuid::new_v4()))
    }

    #[tokio::test]
    async fn create_review_updates_resource_rating() {
        let db_path = temp_db_path();
        let pool = init_pool(&db_path).await.expect("init pool");
        let resource_repo = ResourceRepository::new(pool.clone());
        let user_repo = UserRepository::new(pool.clone());
        let service = ReviewService::new(pool.clone());

        let resource = resource_repo
            .create(CreateResourceInput {
                title: "Review Target".to_string(),
                description: Some("desc".to_string()),
                author_id: DEFAULT_ADMIN_USER_ID.to_string(),
                resource_type: ResourceType::Skill,
                version: None,
                tags: None,
                category: None,
                license: None,
                visibility: None,
                status: Some(ResourceStatus::Published),
                cover_path: None,
                package_path: None,
                resource_size: None,
                manifest: json!({
                    "schemaVersion": 1,
                    "skillId": "target",
                    "name": "Target",
                    "description": "Target"
                }),
            })
            .await
            .expect("create resource");

        let reviewer = user_repo
            .find_or_create_by_identity_id(&Uuid::new_v4().to_string(), Some("Reviewer"))
            .await
            .expect("reviewer");

        let item = service
            .create_review(
                &reviewer,
                CreateReviewRequest {
                    resource_id: resource.id.clone(),
                    rating: 5,
                    title: Some("Great".into()),
                    body: Some("Works well".into()),
                },
            )
            .await
            .expect("create review");

        assert_eq!(item.rating, 5);
        assert_eq!(item.author.display_name, "Reviewer");

        let updated = resource_repo
            .find_by_id(&resource.id)
            .await
            .expect("find")
            .expect("resource");
        assert!((updated.rating - 5.0).abs() < f64::EPSILON);
        assert_eq!(updated.rating_count, 1);

        let duplicate = service
            .create_review(
                &reviewer,
                CreateReviewRequest {
                    resource_id: resource.id,
                    rating: 4,
                    title: None,
                    body: Some("Again".into()),
                },
            )
            .await;

        assert!(matches!(duplicate, Err(ReviewError::Conflict)));

        pool.close().await;
        let _ = std::fs::remove_file(db_path);
    }
}
