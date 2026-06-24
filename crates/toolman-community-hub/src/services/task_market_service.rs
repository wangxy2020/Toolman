use serde::Serialize;
use sqlx::SqlitePool;
use std::path::PathBuf;
use std::sync::Arc;

use crate::config::HubConfig;
use crate::domain::{
    ApplicationStatus, CommunityTask, CommunityTaskApplication, CommunityTaskDelivery,
    CommunityUser, CreateTaskApplicationInput, CreateTaskDeliveryInput, CreateTaskInput,
    DeliveryStatus, TaskListFilter, TaskStatus, TaskType, UpdateTaskInput, UserPermission,
    UserRole,
};
use crate::repositories::task_application_repository::{
    TaskApplicationRepository, TaskApplicationRepositoryError,
};
use crate::repositories::task_delivery_repository::{
    TaskDeliveryRepository, TaskDeliveryRepositoryError,
};
use crate::repositories::task_repository::{TaskRepository, TaskRepositoryError};
use crate::repositories::UserRepository;

#[derive(Debug, Clone)]
pub struct CreateTaskRequest {
    pub title: String,
    pub description: Option<String>,
    pub task_type: TaskType,
    pub budget_amount: Option<f64>,
    pub budget_currency: Option<String>,
    pub deadline_at: Option<i64>,
    pub tags: Option<Vec<String>>,
    pub resource_id: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub struct UpdateTaskRequest {
    pub title: Option<String>,
    pub description: Option<String>,
    pub task_type: Option<TaskType>,
    pub budget_amount: Option<f64>,
    pub budget_currency: Option<String>,
    pub deadline_at: Option<Option<i64>>,
    pub tags: Option<Vec<String>>,
    pub resource_id: Option<Option<String>>,
}

#[derive(Debug, Clone)]
pub struct ApplyTaskRequest {
    pub proposal: String,
    pub quoted_amount: f64,
}

#[derive(Debug, Clone)]
pub struct DeliverTaskRequest {
    pub package_bytes: Vec<u8>,
    pub original_filename: Option<String>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub struct RejectDeliveryRequest {
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub struct TaskListQuery {
    pub task_type: Option<TaskType>,
    pub status: Option<TaskStatus>,
    pub publisher_id: Option<String>,
    pub q: Option<String>,
    pub limit: i64,
    pub offset: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct TaskPublisherSummary {
    pub id: String,
    pub display_name: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct TaskMarketItem {
    pub id: String,
    pub title: String,
    pub description: String,
    pub publisher: TaskPublisherSummary,
    pub assignee_id: Option<String>,
    pub resource_id: Option<String>,
    pub task_type: String,
    pub budget_amount: f64,
    pub budget_currency: String,
    pub deadline_at: Option<i64>,
    pub status: String,
    pub tags: Vec<String>,
    pub attachments_json: serde_json::Value,
    pub created_at: i64,
    pub updated_at: i64,
    pub completed_at: Option<i64>,
}

#[derive(Debug, thiserror::Error)]
pub enum TaskMarketError {
    #[error("forbidden")]
    Forbidden,
    #[error("task not found: {0}")]
    NotFound(String),
    #[error("validation error: {0}")]
    Validation(String),
    #[error("invalid status transition: {from} -> {to}")]
    InvalidTransition { from: String, to: String },
    #[error("task can only be edited while in draft status")]
    NotEditable,
    #[error("application not found: {0}")]
    ApplicationNotFound(String),
    #[error("application already exists for this task")]
    ApplicationConflict,
    #[error("cannot apply to your own task")]
    CannotApplyToOwnTask,
    #[error("task is not open for applications")]
    NotOpenForApplications,
    #[error("delivery not found for task: {0}")]
    DeliveryNotFound(String),
    #[error("invalid task state for operation")]
    InvalidTaskState,
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
    #[error("repository error: {0}")]
    Repository(#[from] TaskRepositoryError),
    #[error("user repository error: {0}")]
    UserRepository(#[from] crate::repositories::UserRepositoryError),
}

pub struct TaskMarketService {
    config: Arc<HubConfig>,
    pool: SqlitePool,
}

impl TaskMarketService {
    pub fn new(config: Arc<HubConfig>, pool: SqlitePool) -> Self {
        Self { config, pool }
    }

    pub async fn create_task(
        &self,
        actor: &CommunityUser,
        input: CreateTaskRequest,
    ) -> Result<TaskMarketItem, TaskMarketError> {
        actor
            .ensure_permission(UserPermission::Publish)
            .map_err(|_| TaskMarketError::Forbidden)?;

        let task = TaskRepository::new(self.pool.clone())
            .create(CreateTaskInput {
                publisher_id: actor.id.clone(),
                title: input.title,
                description: input.description,
                task_type: input.task_type,
                budget_amount: input.budget_amount,
                budget_currency: input.budget_currency,
                deadline_at: input.deadline_at,
                tags: input.tags,
                resource_id: input.resource_id,
                attachments_json: None,
            })
            .await
            .map_err(map_repo_error)?;

        self.to_item(task).await
    }

    pub async fn list_tasks(
        &self,
        query: &TaskListQuery,
    ) -> Result<Vec<TaskMarketItem>, TaskMarketError> {
        let default_status = if query.publisher_id.is_some() {
            None
        } else {
            Some(TaskStatus::Open)
        };
        let tasks = TaskRepository::new(self.pool.clone())
            .list(&TaskListFilter {
                task_type: query.task_type,
                status: query.status.or(default_status),
                publisher_id: query.publisher_id.clone(),
                q: query.q.clone(),
                limit: query.limit,
                offset: query.offset,
            })
            .await?;

        let mut items = Vec::with_capacity(tasks.len());
        for task in tasks {
            items.push(self.to_item(task).await?);
        }
        Ok(items)
    }

    pub async fn get_task(&self, id: &str) -> Result<TaskMarketItem, TaskMarketError> {
        let task = self.require_task(id).await?;
        self.to_item(task).await
    }

    pub async fn update_task(
        &self,
        actor: &CommunityUser,
        id: &str,
        input: UpdateTaskRequest,
    ) -> Result<TaskMarketItem, TaskMarketError> {
        let current = self.require_task(id).await?;
        ensure_publisher_or_admin(actor, &current.publisher_id)?;

        let task = TaskRepository::new(self.pool.clone())
            .update(
                id,
                UpdateTaskInput {
                    title: input.title,
                    description: input.description,
                    task_type: input.task_type,
                    budget_amount: input.budget_amount,
                    budget_currency: input.budget_currency,
                    deadline_at: input.deadline_at,
                    tags: input.tags,
                    resource_id: input.resource_id,
                    attachments_json: None,
                },
            )
            .await
            .map_err(map_repo_error)?;

        self.to_item(task).await
    }

    pub async fn publish_task(
        &self,
        actor: &CommunityUser,
        id: &str,
    ) -> Result<TaskMarketItem, TaskMarketError> {
        let current = self.require_task(id).await?;
        ensure_publisher_or_admin(actor, &current.publisher_id)?;

        let can_publish = matches!(current.status, TaskStatus::Draft | TaskStatus::Rejected)
            || (current.status == TaskStatus::Cancelled && current.assignee_id.is_none());
        if !can_publish {
            return Err(TaskMarketError::Validation(
                "task can only be published from draft, rejected, or cancelled status".into(),
            ));
        }

        let next_status = if self.config.require_review {
            TaskStatus::PendingReview
        } else {
            TaskStatus::Open
        };

        let task = TaskRepository::new(self.pool.clone())
            .transition_status(id, next_status)
            .await
            .map_err(map_repo_error)?;

        self.to_item(task).await
    }

    pub async fn cancel_task(
        &self,
        actor: &CommunityUser,
        id: &str,
    ) -> Result<TaskMarketItem, TaskMarketError> {
        let current = self.require_task(id).await?;
        ensure_publisher_or_admin(actor, &current.publisher_id)?;

        let next_status = if current.status == TaskStatus::PendingReview {
            TaskStatus::Draft
        } else {
            TaskStatus::Cancelled
        };

        let task = TaskRepository::new(self.pool.clone())
            .transition_status(id, next_status)
            .await
            .map_err(map_repo_error)?;

        self.to_item(task).await
    }

    pub async fn delete_task(
        &self,
        actor: &CommunityUser,
        id: &str,
    ) -> Result<(), TaskMarketError> {
        let current = self.require_task(id).await?;
        ensure_publisher_or_admin(actor, &current.publisher_id)?;

        if !is_deletable_task(&current) {
            return Err(TaskMarketError::Validation(
                "当前状态的任务不可删除".to_string(),
            ));
        }

        let deleted = TaskRepository::new(self.pool.clone())
            .delete(id)
            .await
            .map_err(map_repo_error)?;

        if deleted {
            Ok(())
        } else {
            Err(TaskMarketError::NotFound(id.to_string()))
        }
    }

    pub async fn apply_task(
        &self,
        actor: &CommunityUser,
        task_id: &str,
        input: ApplyTaskRequest,
    ) -> Result<CommunityTaskApplication, TaskMarketError> {
        actor
            .ensure_permission(UserPermission::AcceptTask)
            .map_err(|_| TaskMarketError::Forbidden)?;

        let task = self.require_task(task_id).await?;
        if task.publisher_id == actor.id {
            return Err(TaskMarketError::CannotApplyToOwnTask);
        }
        if task.status != TaskStatus::Open {
            return Err(TaskMarketError::NotOpenForApplications);
        }

        TaskApplicationRepository::new(self.pool.clone())
            .create(CreateTaskApplicationInput {
                task_id: task_id.to_string(),
                applicant_id: actor.id.clone(),
                proposal: input.proposal,
                quoted_amount: input.quoted_amount,
            })
            .await
            .map_err(map_application_repo_error)
    }

    pub async fn list_applications(
        &self,
        actor: &CommunityUser,
        task_id: &str,
    ) -> Result<Vec<CommunityTaskApplication>, TaskMarketError> {
        let task = self.require_task(task_id).await?;
        ensure_publisher_or_admin(actor, &task.publisher_id)?;

        TaskApplicationRepository::new(self.pool.clone())
            .list_by_task_id(task_id)
            .await
            .map_err(map_application_repo_error)
    }

    pub async fn accept_application(
        &self,
        actor: &CommunityUser,
        task_id: &str,
        application_id: &str,
    ) -> Result<TaskMarketItem, TaskMarketError> {
        let task = self.require_task(task_id).await?;
        ensure_publisher_or_admin(actor, &task.publisher_id)?;

        if task.status != TaskStatus::Open {
            return Err(TaskMarketError::NotOpenForApplications);
        }

        let application = TaskApplicationRepository::new(self.pool.clone())
            .find_by_id(application_id)
            .await
            .map_err(map_application_repo_error)?
            .ok_or_else(|| TaskMarketError::ApplicationNotFound(application_id.to_string()))?;

        if application.task_id != task_id {
            return Err(TaskMarketError::ApplicationNotFound(application_id.to_string()));
        }
        if application.status != ApplicationStatus::Pending {
            return Err(TaskMarketError::InvalidTaskState);
        }

        let app_repo = TaskApplicationRepository::new(self.pool.clone());
        app_repo
            .update_status(application_id, ApplicationStatus::Accepted)
            .await
            .map_err(map_application_repo_error)?;
        app_repo
            .reject_pending_for_task_except(task_id, application_id)
            .await
            .map_err(map_application_repo_error)?;

        let task = TaskRepository::new(self.pool.clone())
            .assign_and_transition(task_id, &application.applicant_id, TaskStatus::Assigned)
            .await
            .map_err(map_repo_error)?;

        self.to_item(task).await
    }

    pub async fn deliver_task(
        &self,
        actor: &CommunityUser,
        task_id: &str,
        input: DeliverTaskRequest,
    ) -> Result<CommunityTaskDelivery, TaskMarketError> {
        let task = self.require_task(task_id).await?;
        if task.assignee_id.as_deref() != Some(actor.id.as_str()) {
            return Err(TaskMarketError::Forbidden);
        }
        if !matches!(task.status, TaskStatus::Assigned | TaskStatus::InProgress) {
            return Err(TaskMarketError::InvalidTaskState);
        }
        if input.package_bytes.is_empty() {
            return Err(TaskMarketError::Validation("package file is required".to_string()));
        }

        let delivery_id = uuid::Uuid::new_v4().to_string();
        let package_path = store_delivery_package(
            &self.config.deliveries_dir,
            task_id,
            &delivery_id,
            &input.package_bytes,
            input.original_filename.as_deref(),
        )?;

        let delivery = TaskDeliveryRepository::new(self.pool.clone())
            .create(CreateTaskDeliveryInput {
                id: delivery_id.clone(),
                task_id: task_id.to_string(),
                submitter_id: actor.id.clone(),
                package_path: package_path.to_string_lossy().to_string(),
                notes: input.notes,
            })
            .await
            .map_err(map_delivery_repo_error)?;

        TaskRepository::new(self.pool.clone())
            .transition_status(task_id, TaskStatus::Delivered)
            .await
            .map_err(map_repo_error)?;

        Ok(delivery)
    }

    pub async fn accept_delivery(
        &self,
        actor: &CommunityUser,
        task_id: &str,
    ) -> Result<TaskMarketItem, TaskMarketError> {
        let task = self.require_task(task_id).await?;
        ensure_publisher_or_admin(actor, &task.publisher_id)?;

        if task.status != TaskStatus::Delivered {
            return Err(TaskMarketError::InvalidTaskState);
        }

        let delivery = TaskDeliveryRepository::new(self.pool.clone())
            .find_latest_submitted_by_task_id(task_id)
            .await
            .map_err(map_delivery_repo_error)?
            .ok_or_else(|| TaskMarketError::DeliveryNotFound(task_id.to_string()))?;

        TaskDeliveryRepository::new(self.pool.clone())
            .update_status(&delivery.id, DeliveryStatus::Accepted)
            .await
            .map_err(map_delivery_repo_error)?;

        let task = TaskRepository::new(self.pool.clone())
            .transition_status(task_id, TaskStatus::Completed)
            .await
            .map_err(map_repo_error)?;

        self.to_item(task).await
    }

    pub async fn reject_delivery(
        &self,
        actor: &CommunityUser,
        task_id: &str,
        input: RejectDeliveryRequest,
    ) -> Result<TaskMarketItem, TaskMarketError> {
        let task = self.require_task(task_id).await?;
        ensure_publisher_or_admin(actor, &task.publisher_id)?;

        if task.status != TaskStatus::Delivered {
            return Err(TaskMarketError::InvalidTaskState);
        }

        let delivery = TaskDeliveryRepository::new(self.pool.clone())
            .find_latest_submitted_by_task_id(task_id)
            .await
            .map_err(map_delivery_repo_error)?
            .ok_or_else(|| TaskMarketError::DeliveryNotFound(task_id.to_string()))?;

        let notes = input.reason.filter(|value| !value.trim().is_empty());
        if notes.is_some() {
            sqlx::query(
                r#"
                UPDATE community_task_deliveries
                SET notes = COALESCE(?1, notes), status = 'rejected'
                WHERE id = ?2
                "#,
            )
            .bind(&notes)
            .bind(&delivery.id)
            .execute(&self.pool)
            .await?;
        } else {
            TaskDeliveryRepository::new(self.pool.clone())
                .update_status(&delivery.id, DeliveryStatus::Rejected)
                .await
                .map_err(map_delivery_repo_error)?;
        }

        let task = TaskRepository::new(self.pool.clone())
            .transition_status(task_id, TaskStatus::InProgress)
            .await
            .map_err(map_repo_error)?;

        self.to_item(task).await
    }

    async fn require_task(&self, id: &str) -> Result<CommunityTask, TaskMarketError> {
        TaskRepository::new(self.pool.clone())
            .find_by_id(id)
            .await?
            .ok_or_else(|| TaskMarketError::NotFound(id.to_string()))
    }

    async fn to_item(&self, task: CommunityTask) -> Result<TaskMarketItem, TaskMarketError> {
        let publisher = UserRepository::new(self.pool.clone())
            .find_by_id(&task.publisher_id)
            .await?
            .ok_or_else(|| TaskMarketError::NotFound(task.publisher_id.clone()))?;

        Ok(TaskMarketItem {
            id: task.id,
            title: task.title,
            description: task.description,
            publisher: TaskPublisherSummary {
                id: publisher.id,
                display_name: publisher.display_name,
            },
            assignee_id: task.assignee_id,
            resource_id: task.resource_id,
            task_type: task.task_type.as_str().to_string(),
            budget_amount: task.budget_amount,
            budget_currency: task.budget_currency,
            deadline_at: task.deadline_at,
            status: task.status.as_str().to_string(),
            tags: task.tags,
            attachments_json: task.attachments_json,
            created_at: task.created_at,
            updated_at: task.updated_at,
            completed_at: task.completed_at,
        })
    }
}

fn ensure_publisher_or_admin(actor: &CommunityUser, publisher_id: &str) -> Result<(), TaskMarketError> {
    if actor.is_moderator() || actor.id == publisher_id {
        Ok(())
    } else {
        Err(TaskMarketError::Forbidden)
    }
}

fn is_deletable_task(task: &CommunityTask) -> bool {
    use TaskStatus::*;
    matches!(
        task.status,
        Draft | PendingReview | Rejected | Cancelled
    ) || (task.status == Open && task.assignee_id.is_none())
}

fn map_repo_error(error: TaskRepositoryError) -> TaskMarketError {
    match error {
        TaskRepositoryError::NotFound(value) => TaskMarketError::NotFound(value),
        TaskRepositoryError::Validation(task_error) => match task_error {
            crate::domain::TaskError::InvalidStatusTransition { from, to } => {
                TaskMarketError::InvalidTransition { from, to }
            }
            crate::domain::TaskError::NotEditable => TaskMarketError::NotEditable,
            other => TaskMarketError::Validation(other.to_string()),
        },
        other => TaskMarketError::Repository(other),
    }
}

fn map_application_repo_error(error: TaskApplicationRepositoryError) -> TaskMarketError {
    match error {
        TaskApplicationRepositoryError::NotFound(value) => {
            TaskMarketError::ApplicationNotFound(value)
        }
        TaskApplicationRepositoryError::Conflict => TaskMarketError::ApplicationConflict,
        TaskApplicationRepositoryError::Validation(task_error) => {
            TaskMarketError::Validation(task_error.to_string())
        }
        TaskApplicationRepositoryError::Database(error) => TaskMarketError::Validation(error.to_string()),
    }
}

fn map_delivery_repo_error(error: TaskDeliveryRepositoryError) -> TaskMarketError {
    match error {
        TaskDeliveryRepositoryError::NotFound(value) => TaskMarketError::DeliveryNotFound(value),
        TaskDeliveryRepositoryError::Validation(task_error) => {
            TaskMarketError::Validation(task_error.to_string())
        }
        TaskDeliveryRepositoryError::Database(error) => TaskMarketError::Validation(error.to_string()),
    }
}

fn store_delivery_package(
    deliveries_dir: &std::path::Path,
    task_id: &str,
    delivery_id: &str,
    package_bytes: &[u8],
    original_filename: Option<&str>,
) -> Result<PathBuf, TaskMarketError> {
    let extension = original_filename
        .and_then(|name| std::path::Path::new(name).extension())
        .and_then(|ext| ext.to_str())
        .unwrap_or("bin");

    let dir = deliveries_dir.join("tasks").join(task_id).join(delivery_id);
    std::fs::create_dir_all(&dir)?;
    let package_path = dir.join(format!("package.{extension}"));
    std::fs::write(&package_path, package_bytes)?;
    Ok(package_path)
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

    use super::*;

    fn temp_data_dir() -> PathBuf {
        std::env::temp_dir().join(format!("toolman-task-market-{}", Uuid::new_v4()))
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
            .find_or_create_by_identity_id("contractor-identity", Some("Contractor"))
            .await
            .expect("contractor")
    }

    #[tokio::test]
    async fn create_publish_and_list_open_tasks() {
        let data_dir = temp_data_dir();
        std::fs::create_dir_all(&data_dir).expect("data dir");
        let db_path = data_dir.join("community.db");
        let pool = init_pool(&db_path).await.expect("init pool");
        let service = TaskMarketService::new(hub_config(&data_dir), pool.clone());
        let admin = admin_user(&pool).await;

        let draft = service
            .create_task(
                &admin,
                CreateTaskRequest {
                    title: "Toolman plugin".to_string(),
                    description: Some("Build a plugin".to_string()),
                    task_type: TaskType::Development,
                    budget_amount: Some(5000.0),
                    budget_currency: Some("CNY".to_string()),
                    deadline_at: None,
                    tags: Some(vec!["rust".to_string(), "electron".to_string()]),
                    resource_id: None,
                },
            )
            .await
            .expect("create");
        assert_eq!(draft.status, "draft");

        let published = service.publish_task(&admin, &draft.id).await.expect("publish");
        assert_eq!(published.status, "open");

        let listed = service
            .list_tasks(&TaskListQuery {
                task_type: Some(TaskType::Development),
                limit: 10,
                offset: 0,
                ..Default::default()
            })
            .await
            .expect("list");
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].id, draft.id);

        pool.close().await;
        let _ = std::fs::remove_dir_all(data_dir);
    }

    #[tokio::test]
    async fn rejects_publish_when_already_open() {
        let data_dir = temp_data_dir();
        std::fs::create_dir_all(&data_dir).expect("data dir");
        let db_path = data_dir.join("community.db");
        let pool = init_pool(&db_path).await.expect("init pool");
        let service = TaskMarketService::new(hub_config(&data_dir), pool.clone());
        let admin = admin_user(&pool).await;

        let draft = service
            .create_task(
                &admin,
                CreateTaskRequest {
                    title: "Open task".to_string(),
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

        service.publish_task(&admin, &draft.id).await.expect("publish");

        let error = service.publish_task(&admin, &draft.id).await;
        assert!(matches!(error, Err(TaskMarketError::Validation(_))));

        pool.close().await;
        let _ = std::fs::remove_dir_all(data_dir);
    }

    #[tokio::test]
    async fn full_task_workflow_from_apply_to_completed() {
        let data_dir = temp_data_dir();
        std::fs::create_dir_all(&data_dir).expect("data dir");
        let db_path = data_dir.join("community.db");
        let pool = init_pool(&db_path).await.expect("init pool");
        let service = TaskMarketService::new(hub_config(&data_dir), pool.clone());
        let admin = admin_user(&pool).await;
        let contractor = contractor_user(&pool).await;

        let draft = service
            .create_task(
                &admin,
                CreateTaskRequest {
                    title: "Workflow task".to_string(),
                    description: Some("End-to-end".to_string()),
                    task_type: TaskType::Development,
                    budget_amount: Some(1000.0),
                    budget_currency: Some("CNY".to_string()),
                    deadline_at: None,
                    tags: None,
                    resource_id: None,
                },
            )
            .await
            .expect("create");
        assert_eq!(draft.status, "draft");

        let open = service.publish_task(&admin, &draft.id).await.expect("publish");
        assert_eq!(open.status, "open");

        let application = service
            .apply_task(
                &contractor,
                &draft.id,
                ApplyTaskRequest {
                    proposal: "I can do this".to_string(),
                    quoted_amount: 900.0,
                },
            )
            .await
            .expect("apply");
        assert_eq!(application.status, ApplicationStatus::Pending);

        let applications = service
            .list_applications(&admin, &draft.id)
            .await
            .expect("list applications");
        assert_eq!(applications.len(), 1);

        let assigned = service
            .accept_application(&admin, &draft.id, &application.id)
            .await
            .expect("accept");
        assert_eq!(assigned.status, "assigned");
        assert_eq!(assigned.assignee_id.as_deref(), Some(contractor.id.as_str()));

        let delivery = service
            .deliver_task(
                &contractor,
                &draft.id,
                DeliverTaskRequest {
                    package_bytes: b"deliverable".to_vec(),
                    original_filename: Some("result.zip".to_string()),
                    notes: Some("done".to_string()),
                },
            )
            .await
            .expect("deliver");
        assert_eq!(delivery.status, DeliveryStatus::Submitted);
        assert!(std::path::Path::new(&delivery.package_path).is_file());

        let delivered = service.get_task(&draft.id).await.expect("get");
        assert_eq!(delivered.status, "delivered");

        let completed = service
            .accept_delivery(&admin, &draft.id)
            .await
            .expect("accept delivery");
        assert_eq!(completed.status, "completed");
        assert!(completed.completed_at.is_some());

        pool.close().await;
        let _ = std::fs::remove_dir_all(data_dir);
    }
}
