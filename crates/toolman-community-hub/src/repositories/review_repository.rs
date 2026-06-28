use sqlx::SqlitePool;
use uuid::Uuid;

#[derive(Debug, Clone, serde::Serialize)]
pub struct CommunityReview {
    pub id: String,
    pub resource_id: String,
    pub user_id: String,
    pub rating: i64,
    pub title: Option<String>,
    pub body: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone)]
pub struct CreateReviewInput {
    pub resource_id: String,
    pub user_id: String,
    pub rating: i64,
    pub title: Option<String>,
    pub body: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub struct UpdateReviewInput {
    pub rating: Option<i64>,
    pub title: Option<Option<String>>,
    pub body: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub struct ReviewListFilter {
    pub resource_id: Option<String>,
    pub user_id: Option<String>,
    pub limit: i64,
    pub offset: i64,
}

#[derive(Debug, Clone, Copy)]
pub struct RatingAggregate {
    pub rating: f64,
    pub rating_count: i64,
}

#[derive(Debug, thiserror::Error)]
pub enum ReviewRepositoryError {
    #[error("review not found: {0}")]
    NotFound(String),
    #[error("review already exists for resource {resource_id} by user {user_id}")]
    Conflict { resource_id: String, user_id: String },
    #[error("invalid rating: must be between 1 and 5")]
    InvalidRating,
    #[error("resource not found: {0}")]
    ResourceNotFound(String),
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
}

#[derive(Clone)]
pub struct ReviewRepository {
    pool: SqlitePool,
}

#[derive(sqlx::FromRow)]
struct ReviewRecord {
    id: String,
    resource_id: String,
    user_id: String,
    rating: i64,
    title: Option<String>,
    body: String,
    created_at: i64,
    updated_at: i64,
}

impl ReviewRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub fn pool(&self) -> &SqlitePool {
        &self.pool
    }

    pub async fn create(
        &self,
        input: CreateReviewInput,
    ) -> Result<CommunityReview, ReviewRepositoryError> {
        validate_rating(input.rating)?;
        ensure_resource_exists(&self.pool, &input.resource_id).await?;

        if self
            .find_by_resource_and_user(&input.resource_id, &input.user_id)
            .await?
            .is_some()
        {
            return Err(ReviewRepositoryError::Conflict {
                resource_id: input.resource_id,
                user_id: input.user_id,
            });
        }

        let now = chrono::Utc::now().timestamp_millis();
        let body = input.body.unwrap_or_default();
        let id = Uuid::new_v4().to_string();

        let result = sqlx::query(
            r#"
            INSERT INTO community_reviews (
              id, resource_id, user_id, rating, title, body, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
            "#,
        )
        .bind(&id)
        .bind(&input.resource_id)
        .bind(&input.user_id)
        .bind(input.rating)
        .bind(&input.title)
        .bind(&body)
        .bind(now)
        .bind(now)
        .execute(&self.pool)
        .await;

        match result {
            Ok(_) => Ok(CommunityReview {
                id,
                resource_id: input.resource_id,
                user_id: input.user_id,
                rating: input.rating,
                title: input.title,
                body,
                created_at: now,
                updated_at: now,
            }),
            Err(error) if is_unique_violation(&error) => Err(ReviewRepositoryError::Conflict {
                resource_id: input.resource_id,
                user_id: input.user_id,
            }),
            Err(error) => Err(error.into()),
        }
    }

    pub async fn find_by_id(&self, id: &str) -> Result<Option<CommunityReview>, ReviewRepositoryError> {
        let record = sqlx::query_as::<_, ReviewRecord>(
            r#"
            SELECT id, resource_id, user_id, rating, title, body, created_at, updated_at
            FROM community_reviews
            WHERE id = ?1
            "#,
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(record.map(Into::into))
    }

    pub async fn find_by_resource_and_user(
        &self,
        resource_id: &str,
        user_id: &str,
    ) -> Result<Option<CommunityReview>, ReviewRepositoryError> {
        let record = sqlx::query_as::<_, ReviewRecord>(
            r#"
            SELECT id, resource_id, user_id, rating, title, body, created_at, updated_at
            FROM community_reviews
            WHERE resource_id = ?1 AND user_id = ?2
            "#,
        )
        .bind(resource_id)
        .bind(user_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(record.map(Into::into))
    }

    pub async fn list(
        &self,
        filter: &ReviewListFilter,
    ) -> Result<Vec<CommunityReview>, ReviewRepositoryError> {
        let mut builder = sqlx::QueryBuilder::new(
            r#"
            SELECT id, resource_id, user_id, rating, title, body, created_at, updated_at
            FROM community_reviews
            WHERE 1=1
            "#,
        );

        if let Some(resource_id) = &filter.resource_id {
            builder.push(" AND resource_id = ");
            builder.push_bind(resource_id);
        }
        if let Some(user_id) = &filter.user_id {
            builder.push(" AND user_id = ");
            builder.push_bind(user_id);
        }

        builder.push(" ORDER BY created_at DESC LIMIT ");
        builder.push_bind(filter.limit);
        builder.push(" OFFSET ");
        builder.push_bind(filter.offset);

        let records = builder
            .build_query_as::<ReviewRecord>()
            .fetch_all(&self.pool)
            .await?;

        Ok(records.into_iter().map(Into::into).collect())
    }

    pub async fn update(
        &self,
        id: &str,
        input: UpdateReviewInput,
    ) -> Result<CommunityReview, ReviewRepositoryError> {
        let current = self
            .find_by_id(id)
            .await?
            .ok_or_else(|| ReviewRepositoryError::NotFound(id.to_string()))?;

        if let Some(rating) = input.rating {
            validate_rating(rating)?;
        }

        let now = chrono::Utc::now().timestamp_millis();
        let rating = input.rating.unwrap_or(current.rating);
        let title = input.title.unwrap_or(current.title);
        let body = input.body.unwrap_or(current.body);

        sqlx::query(
            r#"
            UPDATE community_reviews
            SET rating = ?1, title = ?2, body = ?3, updated_at = ?4
            WHERE id = ?5
            "#,
        )
        .bind(rating)
        .bind(&title)
        .bind(&body)
        .bind(now)
        .bind(id)
        .execute(&self.pool)
        .await?;

        Ok(CommunityReview {
            id: current.id,
            resource_id: current.resource_id,
            user_id: current.user_id,
            rating,
            title,
            body,
            created_at: current.created_at,
            updated_at: now,
        })
    }

    pub async fn delete(&self, id: &str) -> Result<CommunityReview, ReviewRepositoryError> {
        let current = self
            .find_by_id(id)
            .await?
            .ok_or_else(|| ReviewRepositoryError::NotFound(id.to_string()))?;

        sqlx::query("DELETE FROM community_reviews WHERE id = ?1")
            .bind(id)
            .execute(&self.pool)
            .await?;

        Ok(current)
    }

    pub async fn aggregate_for_resource(
        &self,
        resource_id: &str,
    ) -> Result<RatingAggregate, ReviewRepositoryError> {
        let row: (Option<f64>, i64) = sqlx::query_as(
            r#"
            SELECT AVG(rating), COUNT(*)
            FROM community_reviews
            WHERE resource_id = ?1
            "#,
        )
        .bind(resource_id)
        .fetch_one(&self.pool)
        .await?;

        Ok(RatingAggregate {
            rating: row.0.unwrap_or(0.0),
            rating_count: row.1,
        })
    }

    pub async fn recompute_resource_rating(
        &self,
        resource_id: &str,
    ) -> Result<RatingAggregate, ReviewRepositoryError> {
        let aggregate = self.aggregate_for_resource(resource_id).await?;
        let now = chrono::Utc::now().timestamp_millis();

        let rows = sqlx::query(
            r#"
            UPDATE community_resources
            SET rating = ?1, rating_count = ?2, updated_at = ?3
            WHERE id = ?4 AND deleted_at IS NULL
            "#,
        )
        .bind(aggregate.rating)
        .bind(aggregate.rating_count)
        .bind(now)
        .bind(resource_id)
        .execute(&self.pool)
        .await?
        .rows_affected();

        if rows == 0 {
            return Err(ReviewRepositoryError::ResourceNotFound(resource_id.to_string()));
        }

        Ok(aggregate)
    }
}

impl From<ReviewRecord> for CommunityReview {
    fn from(record: ReviewRecord) -> Self {
        Self {
            id: record.id,
            resource_id: record.resource_id,
            user_id: record.user_id,
            rating: record.rating,
            title: record.title,
            body: record.body,
            created_at: record.created_at,
            updated_at: record.updated_at,
        }
    }
}

fn validate_rating(rating: i64) -> Result<(), ReviewRepositoryError> {
    if (1..=5).contains(&rating) {
        Ok(())
    } else {
        Err(ReviewRepositoryError::InvalidRating)
    }
}

async fn ensure_resource_exists(
    pool: &SqlitePool,
    resource_id: &str,
) -> Result<(), ReviewRepositoryError> {
    let exists: Option<(String,)> = sqlx::query_as(
        "SELECT id FROM community_resources WHERE id = ?1 AND deleted_at IS NULL",
    )
    .bind(resource_id)
    .fetch_optional(pool)
    .await?;

    if exists.is_some() {
        Ok(())
    } else {
        Err(ReviewRepositoryError::ResourceNotFound(resource_id.to_string()))
    }
}

fn is_unique_violation(error: &sqlx::Error) -> bool {
    matches!(
        error,
        sqlx::Error::Database(db_error)
            if db_error.code().as_deref() == Some("2067")
                || db_error.message().contains("UNIQUE constraint failed")
    )
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use serde_json::json;
    use uuid::Uuid;

    use crate::db::init_pool;
    use crate::db::seed::DEFAULT_ADMIN_USER_ID;
    use crate::domain::{CreateResourceInput, ResourceStatus, ResourceType};
    use crate::repositories::ResourceRepository;

    use super::*;

    fn temp_db_path() -> PathBuf {
        std::env::temp_dir().join(format!("toolman-review-repo-{}", Uuid::new_v4()))
    }

    async fn seed_resource(pool: &SqlitePool) -> String {
        let resource_repo = ResourceRepository::new(pool.clone());
        let resource = resource_repo
            .create(CreateResourceInput {
                title: "Rated MCP".to_string(),
                description: Some("For rating tests".to_string()),
                author_id: DEFAULT_ADMIN_USER_ID.to_string(),
                resource_type: ResourceType::Mcp,
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
                    "mcpId": "rated-mcp",
                    "transport": "stdio",
                    "command": "echo",
                    "tools": [],
                    "files": ["mcp.manifest.json"]
                }),
            })
            .await
            .expect("create resource");
        resource.id
    }

    #[tokio::test]
    async fn recompute_resource_rating_updates_redundant_fields() {
        let db_path = temp_db_path();
        let pool = init_pool(&db_path).await.expect("init pool");
        let resource_repo = ResourceRepository::new(pool.clone());
        let review_repo = ReviewRepository::new(pool.clone());
        let resource_id = seed_resource(&pool).await;

        review_repo
            .create(CreateReviewInput {
                resource_id: resource_id.clone(),
                user_id: DEFAULT_ADMIN_USER_ID.to_string(),
                rating: 4,
                title: None,
                body: Some("Good".into()),
            })
            .await
            .expect("create review");

        let aggregate = review_repo
            .recompute_resource_rating(&resource_id)
            .await
            .expect("recompute");

        assert!((aggregate.rating - 4.0).abs() < f64::EPSILON);
        assert_eq!(aggregate.rating_count, 1);

        let updated = resource_repo
            .find_by_id(&resource_id)
            .await
            .expect("find")
            .expect("resource");
        assert!((updated.rating - 4.0).abs() < f64::EPSILON);
        assert_eq!(updated.rating_count, 1);

        pool.close().await;
        let _ = std::fs::remove_file(db_path);
    }

    #[tokio::test]
    async fn create_returns_conflict_for_duplicate_review() {
        let db_path = temp_db_path();
        let pool = init_pool(&db_path).await.expect("init pool");
        let review_repo = ReviewRepository::new(pool.clone());
        let resource_id = seed_resource(&pool).await;

        review_repo
            .create(CreateReviewInput {
                resource_id: resource_id.clone(),
                user_id: DEFAULT_ADMIN_USER_ID.to_string(),
                rating: 5,
                title: None,
                body: Some("First".into()),
            })
            .await
            .expect("first review");

        let error = review_repo
            .create(CreateReviewInput {
                resource_id: resource_id.clone(),
                user_id: DEFAULT_ADMIN_USER_ID.to_string(),
                rating: 3,
                title: None,
                body: Some("Duplicate".into()),
            })
            .await
            .expect_err("duplicate review");

        assert!(matches!(
            error,
            ReviewRepositoryError::Conflict { .. }
        ));

        pool.close().await;
        let _ = std::fs::remove_file(db_path);
    }
}
