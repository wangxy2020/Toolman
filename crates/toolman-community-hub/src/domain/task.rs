use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TaskType {
    Development,
    Design,
    Translation,
    Tender,
    Other,
}

impl TaskType {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Development => "development",
            Self::Design => "design",
            Self::Translation => "translation",
            Self::Tender => "tender",
            Self::Other => "other",
        }
    }

    pub fn parse(value: &str) -> Result<Self, TaskError> {
        match value {
            "development" => Ok(Self::Development),
            "design" => Ok(Self::Design),
            "translation" => Ok(Self::Translation),
            "tender" => Ok(Self::Tender),
            "other" => Ok(Self::Other),
            other => Err(TaskError::InvalidTaskType(other.to_string())),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskStatus {
    Draft,
    PendingReview,
    Open,
    Assigned,
    InProgress,
    Delivered,
    Completed,
    Cancelled,
    Disputed,
}

impl TaskStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Draft => "draft",
            Self::PendingReview => "pending_review",
            Self::Open => "open",
            Self::Assigned => "assigned",
            Self::InProgress => "in_progress",
            Self::Delivered => "delivered",
            Self::Completed => "completed",
            Self::Cancelled => "cancelled",
            Self::Disputed => "disputed",
        }
    }

    pub fn parse(value: &str) -> Result<Self, TaskError> {
        match value {
            "draft" => Ok(Self::Draft),
            "pending_review" => Ok(Self::PendingReview),
            "open" => Ok(Self::Open),
            "assigned" => Ok(Self::Assigned),
            "in_progress" => Ok(Self::InProgress),
            "delivered" => Ok(Self::Delivered),
            "completed" => Ok(Self::Completed),
            "cancelled" => Ok(Self::Cancelled),
            "disputed" => Ok(Self::Disputed),
            other => Err(TaskError::InvalidStatus(other.to_string())),
        }
    }

    pub fn can_transition_to(self, next: Self) -> bool {
        use TaskStatus::*;
        matches!(
            (self, next),
            (Draft, Open)
                | (Draft, PendingReview)
                | (Draft, Cancelled)
                | (PendingReview, Open)
                | (PendingReview, Cancelled)
                | (Open, Cancelled)
                | (Open, Assigned)
                | (Assigned, InProgress)
                | (Assigned, Delivered)
                | (Assigned, Cancelled)
                | (InProgress, Delivered)
                | (InProgress, Disputed)
                | (Delivered, Completed)
                | (Delivered, InProgress)
                | (Delivered, Disputed)
                | (Disputed, InProgress)
                | (Disputed, Cancelled)
                | (Completed, Completed)
        )
    }

    pub fn validate_transition(from: Self, to: Self) -> Result<(), TaskError> {
        if from.can_transition_to(to) {
            Ok(())
        } else {
            Err(TaskError::InvalidStatusTransition {
                from: from.as_str().to_string(),
                to: to.as_str().to_string(),
            })
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ApplicationStatus {
    Pending,
    Accepted,
    Rejected,
}

impl ApplicationStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::Accepted => "accepted",
            Self::Rejected => "rejected",
        }
    }

    pub fn parse(value: &str) -> Result<Self, TaskError> {
        match value {
            "pending" => Ok(Self::Pending),
            "accepted" => Ok(Self::Accepted),
            "rejected" => Ok(Self::Rejected),
            other => Err(TaskError::InvalidApplicationStatus(other.to_string())),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DeliveryStatus {
    Submitted,
    Accepted,
    Rejected,
}

impl DeliveryStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Submitted => "submitted",
            Self::Accepted => "accepted",
            Self::Rejected => "rejected",
        }
    }

    pub fn parse(value: &str) -> Result<Self, TaskError> {
        match value {
            "submitted" => Ok(Self::Submitted),
            "accepted" => Ok(Self::Accepted),
            "rejected" => Ok(Self::Rejected),
            other => Err(TaskError::InvalidDeliveryStatus(other.to_string())),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommunityTaskApplication {
    pub id: String,
    pub task_id: String,
    pub applicant_id: String,
    pub proposal: String,
    pub quoted_amount: f64,
    pub status: ApplicationStatus,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommunityTaskDelivery {
    pub id: String,
    pub task_id: String,
    pub submitter_id: String,
    pub package_path: String,
    pub notes: Option<String>,
    pub status: DeliveryStatus,
    pub created_at: i64,
}

#[derive(Debug, Clone)]
pub struct CreateTaskApplicationInput {
    pub task_id: String,
    pub applicant_id: String,
    pub proposal: String,
    pub quoted_amount: f64,
}

#[derive(Debug, Clone)]
pub struct CreateTaskDeliveryInput {
    pub id: String,
    pub task_id: String,
    pub submitter_id: String,
    pub package_path: String,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommunityTaskReview {
    pub id: String,
    pub task_id: String,
    pub reviewer_id: String,
    pub reviewee_id: String,
    pub rating: i64,
    pub body: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone)]
pub struct CreateTaskReviewInput {
    pub task_id: String,
    pub reviewer_id: String,
    pub reviewee_id: String,
    pub rating: i64,
    pub body: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommunityTask {
    pub id: String,
    pub publisher_id: String,
    pub assignee_id: Option<String>,
    pub resource_id: Option<String>,
    pub title: String,
    pub description: String,
    pub task_type: TaskType,
    pub budget_amount: f64,
    pub budget_currency: String,
    pub deadline_at: Option<i64>,
    pub status: TaskStatus,
    pub tags: Vec<String>,
    pub attachments_json: Value,
    pub created_at: i64,
    pub updated_at: i64,
    pub completed_at: Option<i64>,
}

#[derive(Debug, Clone)]
pub struct CreateTaskInput {
    pub publisher_id: String,
    pub title: String,
    pub description: Option<String>,
    pub task_type: TaskType,
    pub budget_amount: Option<f64>,
    pub budget_currency: Option<String>,
    pub deadline_at: Option<i64>,
    pub tags: Option<Vec<String>>,
    pub resource_id: Option<String>,
    pub attachments_json: Option<Value>,
}

#[derive(Debug, Clone, Default)]
pub struct UpdateTaskInput {
    pub title: Option<String>,
    pub description: Option<String>,
    pub task_type: Option<TaskType>,
    pub budget_amount: Option<f64>,
    pub budget_currency: Option<String>,
    pub deadline_at: Option<Option<i64>>,
    pub tags: Option<Vec<String>>,
    pub resource_id: Option<Option<String>>,
    pub attachments_json: Option<Value>,
}

#[derive(Debug, Clone, Default)]
pub struct TaskListFilter {
    pub task_type: Option<TaskType>,
    pub status: Option<TaskStatus>,
    pub publisher_id: Option<String>,
    pub q: Option<String>,
    pub limit: i64,
    pub offset: i64,
}

#[derive(Debug, thiserror::Error)]
pub enum TaskError {
    #[error("invalid task type: {0}")]
    InvalidTaskType(String),
    #[error("invalid status: {0}")]
    InvalidStatus(String),
    #[error("invalid status transition: {from} -> {to}")]
    InvalidStatusTransition { from: String, to: String },
    #[error("title must not be empty")]
    EmptyTitle,
    #[error("budget amount must be non-negative")]
    NegativeBudget,
    #[error("task can only be edited while in draft status")]
    NotEditable,
    #[error("invalid application status: {0}")]
    InvalidApplicationStatus(String),
    #[error("invalid delivery status: {0}")]
    InvalidDeliveryStatus(String),
    #[error("application already exists for this task")]
    ApplicationConflict,
    #[error("cannot apply to your own task")]
    CannotApplyToOwnTask,
    #[error("task is not open for applications")]
    NotOpenForApplications,
    #[error("invalid task state for operation")]
    InvalidTaskState,
    #[error("task is not completed")]
    TaskNotCompleted,
    #[error("invalid review participant")]
    InvalidReviewParticipant,
    #[error("task review already exists")]
    TaskReviewConflict,
    #[error("invalid rating: must be between 1 and 5")]
    InvalidRating,
}

impl CreateTaskInput {
    pub fn validate(&self) -> Result<(), TaskError> {
        if self.title.trim().is_empty() {
            return Err(TaskError::EmptyTitle);
        }
        if self.budget_amount.is_some_and(|amount| amount < 0.0) {
            return Err(TaskError::NegativeBudget);
        }
        Ok(())
    }
}

impl UpdateTaskInput {
    pub fn validate(&self) -> Result<(), TaskError> {
        if let Some(title) = &self.title {
            if title.trim().is_empty() {
                return Err(TaskError::EmptyTitle);
            }
        }
        if self.budget_amount.is_some_and(|amount| amount < 0.0) {
            return Err(TaskError::NegativeBudget);
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_publish_and_cancel_transitions() {
        assert!(TaskStatus::Draft.can_transition_to(TaskStatus::Open));
        assert!(TaskStatus::Draft.can_transition_to(TaskStatus::PendingReview));
        assert!(TaskStatus::PendingReview.can_transition_to(TaskStatus::Open));
        assert!(TaskStatus::Draft.can_transition_to(TaskStatus::Cancelled));
        assert!(TaskStatus::Open.can_transition_to(TaskStatus::Cancelled));
    }

    #[test]
    fn rejects_illegal_transitions() {
        assert!(!TaskStatus::Draft.can_transition_to(TaskStatus::Completed));
        assert!(!TaskStatus::Open.can_transition_to(TaskStatus::Delivered));
        assert!(TaskStatus::validate_transition(TaskStatus::Draft, TaskStatus::Assigned).is_err());
    }
}
