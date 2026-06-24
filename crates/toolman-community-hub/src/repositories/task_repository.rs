use sqlx::{QueryBuilder, Sqlite, SqlitePool};
use uuid::Uuid;

use crate::domain::{
    CommunityTask, CreateTaskInput, TaskError, TaskListFilter, TaskStatus, TaskType,
    UpdateTaskInput,
};

#[derive(Debug, thiserror::Error)]
pub enum TaskRepositoryError {
    #[error("task not found: {0}")]
    NotFound(String),
    #[error("validation error: {0}")]
    Validation(#[from] TaskError),
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
    #[error("serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
}

#[derive(Clone)]
pub struct TaskRepository {
    pool: SqlitePool,
}

#[derive(sqlx::FromRow)]
struct TaskRecord {
    id: String,
    publisher_id: String,
    assignee_id: Option<String>,
    resource_id: Option<String>,
    title: String,
    description: String,
    task_type: String,
    budget_amount: f64,
    budget_currency: String,
    deadline_at: Option<i64>,
    status: String,
    tags: String,
    attachments_json: String,
    created_at: i64,
    updated_at: i64,
    completed_at: Option<i64>,
}

const TASK_SELECT: &str = r#"
SELECT
  id,
  publisher_id,
  assignee_id,
  resource_id,
  title,
  description,
  task_type,
  budget_amount,
  budget_currency,
  deadline_at,
  status,
  tags,
  attachments_json,
  created_at,
  updated_at,
  completed_at
FROM community_tasks
"#;

impl TaskRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn create(&self, input: CreateTaskInput) -> Result<CommunityTask, TaskRepositoryError> {
        input.validate()?;

        let id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().timestamp_millis();
        let tags = serde_json::to_string(&input.tags.unwrap_or_default())?;
        let attachments_json = serde_json::to_string(
            &input
                .attachments_json
                .unwrap_or_else(|| serde_json::json!([])),
        )?;

        sqlx::query(
            r#"
            INSERT INTO community_tasks (
              id, publisher_id, assignee_id, resource_id, title, description, task_type,
              budget_amount, budget_currency, deadline_at, status, tags, attachments_json,
              created_at, updated_at
            ) VALUES (?1, ?2, NULL, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'draft', ?10, ?11, ?12, ?12)
            "#,
        )
        .bind(&id)
        .bind(&input.publisher_id)
        .bind(&input.resource_id)
        .bind(input.title.trim())
        .bind(input.description.unwrap_or_default())
        .bind(input.task_type.as_str())
        .bind(input.budget_amount.unwrap_or(0.0))
        .bind(input.budget_currency.unwrap_or_else(|| "CNY".to_string()))
        .bind(input.deadline_at)
        .bind(&tags)
        .bind(&attachments_json)
        .bind(now)
        .execute(&self.pool)
        .await?;

        self.find_by_id(&id)
            .await?
            .ok_or_else(|| TaskRepositoryError::NotFound(id))
    }

    pub async fn find_by_id(&self, id: &str) -> Result<Option<CommunityTask>, TaskRepositoryError> {
        let query = format!("{TASK_SELECT} WHERE id = ?1");
        let record = sqlx::query_as::<_, TaskRecord>(&query)
            .bind(id)
            .fetch_optional(&self.pool)
            .await?;

        record.map(TryInto::try_into).transpose()
    }

    pub async fn list(&self, filter: &TaskListFilter) -> Result<Vec<CommunityTask>, TaskRepositoryError> {
        let mut builder = QueryBuilder::<Sqlite>::new(TASK_SELECT);
        builder.push(" WHERE 1=1");

        if let Some(task_type) = filter.task_type {
            builder.push(" AND task_type = ");
            builder.push_bind(task_type.as_str());
        }
        if let Some(status) = filter.status {
            builder.push(" AND status = ");
            builder.push_bind(status.as_str());
        }
        if let Some(publisher_id) = &filter.publisher_id {
            builder.push(" AND publisher_id = ");
            builder.push_bind(publisher_id);
        }
        if let Some(q) = &filter.q {
            let pattern = format!("%{}%", q.trim());
            builder.push(" AND (title LIKE ");
            builder.push_bind(pattern.clone());
            builder.push(" OR description LIKE ");
            builder.push_bind(pattern);
            builder.push(")");
        }

        builder.push(" ORDER BY created_at DESC LIMIT ");
        builder.push_bind(filter.limit);
        builder.push(" OFFSET ");
        builder.push_bind(filter.offset);

        let records = builder
            .build_query_as::<TaskRecord>()
            .fetch_all(&self.pool)
            .await?;

        records.into_iter().map(TryInto::try_into).collect()
    }

    pub async fn count_open(&self) -> Result<i64, TaskRepositoryError> {
        let count: (i64,) = sqlx::query_as(
            r#"
            SELECT COUNT(*)
            FROM community_tasks
            WHERE status = 'open'
            "#,
        )
        .fetch_one(&self.pool)
        .await?;

        Ok(count.0)
    }

    pub async fn update(
        &self,
        id: &str,
        input: UpdateTaskInput,
    ) -> Result<CommunityTask, TaskRepositoryError> {
        input.validate()?;

        let current = self
            .find_by_id(id)
            .await?
            .ok_or_else(|| TaskRepositoryError::NotFound(id.to_string()))?;

        let editable = matches!(current.status, TaskStatus::Draft | TaskStatus::Rejected)
            || (current.status == TaskStatus::Cancelled && current.assignee_id.is_none());
        if !editable {
            return Err(TaskRepositoryError::Validation(TaskError::NotEditable));
        }

        let now = chrono::Utc::now().timestamp_millis();
        let title = input.title.unwrap_or(current.title);
        let description = input.description.unwrap_or(current.description);
        let task_type = input.task_type.unwrap_or(current.task_type);
        let budget_amount = input.budget_amount.unwrap_or(current.budget_amount);
        let budget_currency = input.budget_currency.unwrap_or(current.budget_currency);
        let deadline_at = input.deadline_at.unwrap_or(current.deadline_at);
        let tags = serde_json::to_string(&input.tags.unwrap_or(current.tags))?;
        let resource_id = input.resource_id.unwrap_or(current.resource_id);
        let attachments_json = serde_json::to_string(
            &input.attachments_json.unwrap_or(current.attachments_json),
        )?;

        let rows = sqlx::query(
            r#"
            UPDATE community_tasks
            SET
              title = ?1,
              description = ?2,
              task_type = ?3,
              budget_amount = ?4,
              budget_currency = ?5,
              deadline_at = ?6,
              tags = ?7,
              resource_id = ?8,
              attachments_json = ?9,
              updated_at = ?10
            WHERE id = ?11
            "#,
        )
        .bind(title.trim())
        .bind(&description)
        .bind(task_type.as_str())
        .bind(budget_amount)
        .bind(&budget_currency)
        .bind(deadline_at)
        .bind(&tags)
        .bind(&resource_id)
        .bind(&attachments_json)
        .bind(now)
        .bind(id)
        .execute(&self.pool)
        .await?
        .rows_affected();

        if rows == 0 {
            return Err(TaskRepositoryError::NotFound(id.to_string()));
        }

        self.find_by_id(id)
            .await?
            .ok_or_else(|| TaskRepositoryError::NotFound(id.to_string()))
    }

    pub async fn transition_status(
        &self,
        id: &str,
        next_status: TaskStatus,
    ) -> Result<CommunityTask, TaskRepositoryError> {
        let current = self
            .find_by_id(id)
            .await?
            .ok_or_else(|| TaskRepositoryError::NotFound(id.to_string()))?;

        TaskStatus::validate_transition(current.status, next_status)?;

        let now = chrono::Utc::now().timestamp_millis();
        let completed_at = if next_status == TaskStatus::Completed {
            Some(now)
        } else {
            current.completed_at
        };

        let rows = sqlx::query(
            r#"
            UPDATE community_tasks
            SET status = ?1, updated_at = ?2, completed_at = ?3
            WHERE id = ?4
            "#,
        )
        .bind(next_status.as_str())
        .bind(now)
        .bind(completed_at)
        .bind(id)
        .execute(&self.pool)
        .await?
        .rows_affected();

        if rows == 0 {
            return Err(TaskRepositoryError::NotFound(id.to_string()));
        }

        self.find_by_id(id)
            .await?
            .ok_or_else(|| TaskRepositoryError::NotFound(id.to_string()))
    }

    pub async fn assign_and_transition(
        &self,
        id: &str,
        assignee_id: &str,
        next_status: TaskStatus,
    ) -> Result<CommunityTask, TaskRepositoryError> {
        let current = self
            .find_by_id(id)
            .await?
            .ok_or_else(|| TaskRepositoryError::NotFound(id.to_string()))?;

        TaskStatus::validate_transition(current.status, next_status)?;

        let now = chrono::Utc::now().timestamp_millis();
        let completed_at = if next_status == TaskStatus::Completed {
            Some(now)
        } else {
            current.completed_at
        };

        let rows = sqlx::query(
            r#"
            UPDATE community_tasks
            SET assignee_id = ?1, status = ?2, updated_at = ?3, completed_at = ?4
            WHERE id = ?5
            "#,
        )
        .bind(assignee_id)
        .bind(next_status.as_str())
        .bind(now)
        .bind(completed_at)
        .bind(id)
        .execute(&self.pool)
        .await?
        .rows_affected();

        if rows == 0 {
            return Err(TaskRepositoryError::NotFound(id.to_string()));
        }

        self.find_by_id(id)
            .await?
            .ok_or_else(|| TaskRepositoryError::NotFound(id.to_string()))
    }

    pub async fn delete(&self, id: &str) -> Result<bool, TaskRepositoryError> {
        let rows = sqlx::query("DELETE FROM community_tasks WHERE id = ?1")
            .bind(id)
            .execute(&self.pool)
            .await?
            .rows_affected();

        Ok(rows > 0)
    }
}

impl TryFrom<TaskRecord> for CommunityTask {
    type Error = TaskRepositoryError;

    fn try_from(record: TaskRecord) -> Result<Self, Self::Error> {
        Ok(Self {
            id: record.id,
            publisher_id: record.publisher_id,
            assignee_id: record.assignee_id,
            resource_id: record.resource_id,
            title: record.title,
            description: record.description,
            task_type: TaskType::parse(&record.task_type).map_err(TaskRepositoryError::Validation)?,
            budget_amount: record.budget_amount,
            budget_currency: record.budget_currency,
            deadline_at: record.deadline_at,
            status: TaskStatus::parse(&record.status).map_err(TaskRepositoryError::Validation)?,
            tags: serde_json::from_str(&record.tags)?,
            attachments_json: serde_json::from_str(&record.attachments_json)?,
            created_at: record.created_at,
            updated_at: record.updated_at,
            completed_at: record.completed_at,
        })
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use uuid::Uuid;

    use crate::db::init_pool;
    use crate::db::seed::DEFAULT_ADMIN_USER_ID;
    use crate::domain::TaskType;

    use super::*;

    fn temp_db_path() -> PathBuf {
        std::env::temp_dir().join(format!("toolman-task-repo-{}", Uuid::new_v4()))
    }

    #[tokio::test]
    async fn publish_and_cancel_follow_state_machine() {
        let db_path = temp_db_path();
        let pool = init_pool(&db_path).await.expect("init pool");
        let repo = TaskRepository::new(pool.clone());

        let task = repo
            .create(CreateTaskInput {
                publisher_id: DEFAULT_ADMIN_USER_ID.to_string(),
                title: "Build plugin".to_string(),
                description: Some("Need a plugin".to_string()),
                task_type: TaskType::Development,
                budget_amount: Some(5000.0),
                budget_currency: Some("CNY".to_string()),
                deadline_at: None,
                tags: Some(vec!["rust".to_string()]),
                resource_id: None,
                attachments_json: None,
            })
            .await
            .expect("create");

        assert_eq!(task.status, TaskStatus::Draft);

        let published = repo
            .transition_status(&task.id, TaskStatus::Open)
            .await
            .expect("publish");
        assert_eq!(published.status, TaskStatus::Open);

        let cancelled = repo
            .transition_status(&task.id, TaskStatus::Cancelled)
            .await
            .expect("cancel");
        assert_eq!(cancelled.status, TaskStatus::Cancelled);

        let illegal = repo
            .transition_status(&task.id, TaskStatus::Completed)
            .await;
        assert!(illegal.is_err());

        pool.close().await;
        let _ = std::fs::remove_file(db_path);
    }
}
