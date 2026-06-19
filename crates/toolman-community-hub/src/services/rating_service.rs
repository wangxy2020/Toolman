use serde::Serialize;
use sqlx::SqlitePool;

use crate::repositories::review_repository::{
    RatingAggregate, ReviewRepository, ReviewRepositoryError,
};

#[derive(Debug, Clone, Copy, Serialize)]
pub struct RatingSummary {
    pub rating: f64,
    pub rating_count: i64,
}

#[derive(Debug, thiserror::Error)]
pub enum RatingError {
    #[error("resource not found: {0}")]
    NotFound(String),
    #[error("invalid rating")]
    InvalidRating,
    #[error("review repository error: {0}")]
    Review(#[from] ReviewRepositoryError),
}

pub struct RatingService {
    reviews: ReviewRepository,
}

impl RatingService {
    pub fn new(pool: SqlitePool) -> Self {
        Self {
            reviews: ReviewRepository::new(pool),
        }
    }

    pub async fn refresh_resource_rating(
        &self,
        resource_id: &str,
    ) -> Result<RatingSummary, RatingError> {
        let aggregate = self
            .reviews
            .recompute_resource_rating(resource_id)
            .await
            .map_err(map_review_error)?;

        Ok(aggregate.into())
    }

    pub fn review_repository(&self) -> &ReviewRepository {
        &self.reviews
    }
}

impl From<RatingAggregate> for RatingSummary {
    fn from(aggregate: RatingAggregate) -> Self {
        Self {
            rating: aggregate.rating,
            rating_count: aggregate.rating_count,
        }
    }
}

fn map_review_error(error: ReviewRepositoryError) -> RatingError {
    match error {
        ReviewRepositoryError::ResourceNotFound(value) => RatingError::NotFound(value),
        ReviewRepositoryError::InvalidRating => RatingError::InvalidRating,
        other => RatingError::Review(other),
    }
}
