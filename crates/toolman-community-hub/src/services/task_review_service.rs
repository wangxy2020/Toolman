use serde::Serialize;
use sqlx::SqlitePool;

use crate::domain::{
    CommunityTaskReview, CommunityUser, CreateTaskReviewInput, TaskStatus,
};
use crate::repositories::task_repository::{TaskRepository, TaskRepositoryError};
use crate::repositories::task_review_repository::{
    TaskReviewRepository, TaskReviewRepositoryError,
};
use crate::repositories::UserRepository;

#[derive(Debug, Clone)]
pub struct CreateTaskReviewRequest {
    pub rating: i64,
    pub body: String,
    pub reviewee_id: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct TaskReviewAuthorSummary {
    pub id: String,
    pub display_name: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct TaskReviewItem {
    pub id: String,
    pub task_id: String,
    pub reviewer_id: String,
    pub reviewee_id: String,
    pub reviewer: TaskReviewAuthorSummary,
    pub reviewee: TaskReviewAuthorSummary,
    pub rating: i64,
    pub body: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, thiserror::Error)]
pub enum TaskReviewServiceError {
    #[error("forbidden")]
    Forbidden,
    #[error("task not found: {0}")]
    TaskNotFound(String),
    #[error("user not found: {0}")]
    UserNotFound(String),
    #[error("task is not completed")]
    TaskNotCompleted,
    #[error("invalid review participant")]
    InvalidReviewParticipant,
    #[error("task review already exists")]
    TaskReviewConflict,
    #[error("invalid rating: must be between 1 and 5")]
    InvalidRating,
    #[error("validation error: {0}")]
    Validation(String),
    #[error("task repository error: {0}")]
    TaskRepository(#[from] TaskRepositoryError),
    #[error("task review repository error: {0}")]
    TaskReviewRepository(#[from] TaskReviewRepositoryError),
    #[error("user repository error: {0}")]
    UserRepository(#[from] crate::repositories::UserRepositoryError),
}

pub struct TaskReviewService {
    pool: SqlitePool,
}

impl TaskReviewService {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn create_review(
        &self,
        actor: &CommunityUser,
        task_id: &str,
        input: CreateTaskReviewRequest,
    ) -> Result<TaskReviewItem, TaskReviewServiceError> {
        let task = TaskRepository::new(self.pool.clone())
            .find_by_id(task_id)
            .await?
            .ok_or_else(|| TaskReviewServiceError::TaskNotFound(task_id.to_string()))?;

        if task.status != TaskStatus::Completed {
            return Err(TaskReviewServiceError::TaskNotCompleted);
        }

        let assignee_id = task.assignee_id.as_deref().ok_or(TaskReviewServiceError::InvalidReviewParticipant)?;

        let expected_reviewee = if actor.id == task.publisher_id {
            assignee_id
        } else if actor.id == assignee_id {
            task.publisher_id.as_str()
        } else {
            return Err(TaskReviewServiceError::Forbidden);
        };

        if input.reviewee_id != expected_reviewee {
            return Err(TaskReviewServiceError::InvalidReviewParticipant);
        }

        let body = input.body.trim();
        if body.is_empty() {
            return Err(TaskReviewServiceError::Validation(
                "body is required".to_string(),
            ));
        }

        let review = TaskReviewRepository::new(self.pool.clone())
            .create(CreateTaskReviewInput {
                task_id: task_id.to_string(),
                reviewer_id: actor.id.clone(),
                reviewee_id: input.reviewee_id,
                rating: input.rating,
                body: body.to_string(),
            })
            .await
            .map_err(map_review_repo_error)?;

        self.to_item(review).await
    }

    pub async fn list_reviews(
        &self,
        task_id: &str,
    ) -> Result<Vec<TaskReviewItem>, TaskReviewServiceError> {
        let _ = TaskRepository::new(self.pool.clone())
            .find_by_id(task_id)
            .await?
            .ok_or_else(|| TaskReviewServiceError::TaskNotFound(task_id.to_string()))?;

        let reviews = TaskReviewRepository::new(self.pool.clone())
            .list_by_task_id(task_id)
            .await?;

        let mut items = Vec::with_capacity(reviews.len());
        for review in reviews {
            items.push(self.to_item(review).await?);
        }
        Ok(items)
    }

    async fn to_item(&self, review: CommunityTaskReview) -> Result<TaskReviewItem, TaskReviewServiceError> {
        let reviewer = UserRepository::new(self.pool.clone())
            .find_by_id(&review.reviewer_id)
            .await?
            .ok_or_else(|| TaskReviewServiceError::UserNotFound(review.reviewer_id.clone()))?;
        let reviewee = UserRepository::new(self.pool.clone())
            .find_by_id(&review.reviewee_id)
            .await?
            .ok_or_else(|| TaskReviewServiceError::UserNotFound(review.reviewee_id.clone()))?;

        Ok(TaskReviewItem {
            id: review.id,
            task_id: review.task_id,
            reviewer_id: review.reviewer_id,
            reviewee_id: review.reviewee_id,
            reviewer: TaskReviewAuthorSummary {
                id: reviewer.id,
                display_name: reviewer.display_name,
            },
            reviewee: TaskReviewAuthorSummary {
                id: reviewee.id,
                display_name: reviewee.display_name,
            },
            rating: review.rating,
            body: review.body,
            created_at: review.created_at,
            updated_at: review.updated_at,
        })
    }
}

fn map_review_repo_error(error: TaskReviewRepositoryError) -> TaskReviewServiceError {
    match error {
        TaskReviewRepositoryError::NotFound(value) => TaskReviewServiceError::Validation(value),
        TaskReviewRepositoryError::Conflict => TaskReviewServiceError::TaskReviewConflict,
        TaskReviewRepositoryError::InvalidRating => TaskReviewServiceError::InvalidRating,
        TaskReviewRepositoryError::Validation(task_error) => {
            TaskReviewServiceError::Validation(task_error.to_string())
        }
        TaskReviewRepositoryError::Database(error) => TaskReviewServiceError::Validation(error.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;
    use std::sync::Arc;

    use uuid::Uuid;

    use crate::config::HubConfig;
    use crate::db::init_pool;
    use crate::db::seed::DEFAULT_ADMIN_USER_ID;
    use crate::domain::TaskType;
    use crate::repositories::UserRepository;
    use crate::services::task_market_service::{
        ApplyTaskRequest, CreateTaskRequest, DeliverTaskRequest, TaskMarketService,
    };

    use super::*;

    fn temp_data_dir() -> PathBuf {
        std::env::temp_dir().join(format!("toolman-task-review-{}", Uuid::new_v4()))
    }

    fn hub_config(data_dir: &PathBuf) -> Arc<HubConfig> {
        Arc::new(HubConfig::with_data_dir(data_dir.clone()))
    }

    async fn admin_user(pool: &SqlitePool) -> CommunityUser {
        UserRepository::new(pool.clone())
            .find_by_id(DEFAULT_ADMIN_USER_ID)
            .await
            .expect("find admin")
            .expect("admin")
    }

    async fn contractor_user(pool: &SqlitePool) -> CommunityUser {
        UserRepository::new(pool.clone())
            .find_or_create_by_identity_id("review-contractor", Some("Contractor"))
            .await
            .expect("contractor")
    }

    #[tokio::test]
    async fn bidirectional_task_reviews_after_completion() {
        let data_dir = temp_data_dir();
        std::fs::create_dir_all(&data_dir).expect("data dir");
        let db_path = data_dir.join("community.db");
        let pool = init_pool(&db_path).await.expect("init pool");
        let task_service = TaskMarketService::new(hub_config(&data_dir), pool.clone());
        let review_service = TaskReviewService::new(pool.clone());
        let admin = admin_user(&pool).await;
        let contractor = contractor_user(&pool).await;

        let draft = task_service
            .create_task(
                &admin,
                CreateTaskRequest {
                    title: "Review task".to_string(),
                    description: None,
                    task_type: TaskType::Other,
                    budget_amount: None,
                    budget_currency: None,
                    deadline_at: None,
                    tags: None,
                    resource_id: None,
                },
            )
            .await
            .expect("create");

        task_service.publish_task(&admin, &draft.id).await.expect("publish");
        let application = task_service
            .apply_task(
                &contractor,
                &draft.id,
                ApplyTaskRequest {
                    proposal: "ok".to_string(),
                    quoted_amount: 100.0,
                },
            )
            .await
            .expect("apply");
        task_service
            .accept_application(&admin, &draft.id, &application.id)
            .await
            .expect("accept");
        task_service
            .deliver_task(
                &contractor,
                &draft.id,
                DeliverTaskRequest {
                    package_bytes: b"done".to_vec(),
                    original_filename: None,
                    notes: None,
                },
            )
            .await
            .expect("deliver");
        task_service
            .accept_delivery(&admin, &draft.id)
            .await
            .expect("complete");

        review_service
            .create_review(
                &admin,
                &draft.id,
                CreateTaskReviewRequest {
                    rating: 5,
                    body: "Great work".to_string(),
                    reviewee_id: contractor.id.clone(),
                },
            )
            .await
            .expect("publisher review");

        review_service
            .create_review(
                &contractor,
                &draft.id,
                CreateTaskReviewRequest {
                    rating: 4,
                    body: "Clear requirements".to_string(),
                    reviewee_id: admin.id.clone(),
                },
            )
            .await
            .expect("assignee review");

        let reviews = review_service
            .list_reviews(&draft.id)
            .await
            .expect("list");
        assert_eq!(reviews.len(), 2);

        pool.close().await;
        let _ = std::fs::remove_dir_all(data_dir);
    }
}
