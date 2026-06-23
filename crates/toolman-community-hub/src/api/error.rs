use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde::Serialize;

use crate::domain::UserError;
use crate::repositories::user_repository::UserRepositoryError;
use crate::repositories::RepositoryError;
use crate::services::McpMarketError;

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ApiErrorCode {
    ValidationError,
    Unauthorized,
    Forbidden,
    NotFound,
    Conflict,
    TooManyRequests,
    NotImplemented,
    InternalError,
}

#[derive(Debug, Serialize)]
pub struct ApiErrorBody {
    pub code: ApiErrorCode,
    pub message: String,
    pub retryable: bool,
}

#[derive(Debug, Serialize)]
pub struct ApiErrorResponse {
    pub ok: bool,
    pub error: ApiErrorBody,
}

#[derive(Debug)]
pub struct ApiError {
    pub status: StatusCode,
    pub code: ApiErrorCode,
    pub message: String,
    pub retryable: bool,
}

impl ApiError {
    pub fn unauthorized(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::UNAUTHORIZED,
            code: ApiErrorCode::Unauthorized,
            message: message.into(),
            retryable: false,
        }
    }

    pub fn forbidden(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::FORBIDDEN,
            code: ApiErrorCode::Forbidden,
            message: message.into(),
            retryable: false,
        }
    }

    pub fn not_found(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::NOT_FOUND,
            code: ApiErrorCode::NotFound,
            message: message.into(),
            retryable: false,
        }
    }

    pub fn validation(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::BAD_REQUEST,
            code: ApiErrorCode::ValidationError,
            message: message.into(),
            retryable: false,
        }
    }

    pub fn conflict(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::CONFLICT,
            code: ApiErrorCode::Conflict,
            message: message.into(),
            retryable: false,
        }
    }

    pub fn too_many_requests(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::TOO_MANY_REQUESTS,
            code: ApiErrorCode::TooManyRequests,
            message: message.into(),
            retryable: true,
        }
    }

    pub fn not_implemented(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::NOT_IMPLEMENTED,
            code: ApiErrorCode::NotImplemented,
            message: message.into(),
            retryable: false,
        }
    }

    pub fn internal(message: impl Into<String>) -> Self {
        Self {
            status: StatusCode::INTERNAL_SERVER_ERROR,
            code: ApiErrorCode::InternalError,
            message: message.into(),
            retryable: false,
        }
    }
}

impl From<UserError> for ApiError {
    fn from(error: UserError) -> Self {
        match error {
            UserError::EmptyDisplayName => Self::validation(error.to_string()),
            UserError::Banned | UserError::PermissionDenied(_) => Self::forbidden(error.to_string()),
            UserError::NotFound(value) => Self::not_found(value),
            UserError::InvalidRole(_) => Self::validation(error.to_string()),
        }
    }
}

impl From<UserRepositoryError> for ApiError {
    fn from(error: UserRepositoryError) -> Self {
        match error {
            UserRepositoryError::NotFound(value) => Self::not_found(value),
            UserRepositoryError::Validation(user_error) => user_error.into(),
            UserRepositoryError::Database(error) => Self::internal(error.to_string()),
            UserRepositoryError::Serialization(error) => Self::internal(error.to_string()),
        }
    }
}

impl From<RepositoryError> for ApiError {
    fn from(error: RepositoryError) -> Self {
        match error {
            RepositoryError::NotFound(value) => Self::not_found(value),
            RepositoryError::Validation(resource_error) => {
                Self::validation(resource_error.to_string())
            }
            RepositoryError::InvalidCounterDelta => Self::validation("counter delta must be positive"),
            RepositoryError::Database(error) => Self::internal(error.to_string()),
            RepositoryError::Serialization(error) => Self::internal(error.to_string()),
        }
    }
}

impl From<McpMarketError> for ApiError {
    fn from(error: McpMarketError) -> Self {
        match error {
            McpMarketError::Forbidden => Self::forbidden("permission denied"),
            McpMarketError::NotFound(value) => Self::not_found(value),
            McpMarketError::NotMcpResource => Self::validation("resource is not an MCP package"),
            McpMarketError::VersionConflict {
                resource_id,
                version,
            } => Self::conflict(format!("version already exists: {resource_id}@{version}")),
            McpMarketError::Validation(message) => Self::validation(message),
            McpMarketError::Repository(error) => error.into(),
            McpMarketError::VersionRepository(error) => Self::internal(error.to_string()),
            McpMarketError::Storage(error) => Self::validation(error.to_string()),
            McpMarketError::UserRepository(error) => error.into(),
        }
    }
}

impl From<crate::services::SkillMarketError> for ApiError {
    fn from(error: crate::services::SkillMarketError) -> Self {
        match error {
            crate::services::SkillMarketError::Forbidden => Self::forbidden("permission denied"),
            crate::services::SkillMarketError::NotFound(value) => Self::not_found(value),
            crate::services::SkillMarketError::NotSkillResource => {
                Self::validation("resource is not a Skill package")
            }
            crate::services::SkillMarketError::VersionConflict {
                resource_id,
                version,
            } => Self::conflict(format!("version already exists: {resource_id}@{version}")),
            crate::services::SkillMarketError::Validation(message) => Self::validation(message),
            crate::services::SkillMarketError::Repository(error) => error.into(),
            crate::services::SkillMarketError::VersionRepository(error) => {
                Self::internal(error.to_string())
            }
            crate::services::SkillMarketError::Storage(error) => Self::validation(error.to_string()),
            crate::services::SkillMarketError::UserRepository(error) => error.into(),
            crate::services::SkillMarketError::Io(error) => Self::validation(error.to_string()),
            crate::services::SkillMarketError::Zip(error) => Self::validation(error.to_string()),
        }
    }
}

impl From<crate::services::WorkflowMarketError> for ApiError {
    fn from(error: crate::services::WorkflowMarketError) -> Self {
        match error {
            crate::services::WorkflowMarketError::Forbidden => Self::forbidden("permission denied"),
            crate::services::WorkflowMarketError::NotFound(value) => Self::not_found(value),
            crate::services::WorkflowMarketError::NotWorkflowResource => {
                Self::validation("resource is not a Workflow package")
            }
            crate::services::WorkflowMarketError::VersionConflict {
                resource_id,
                version,
            } => Self::conflict(format!("version already exists: {resource_id}@{version}")),
            crate::services::WorkflowMarketError::Validation(message) => Self::validation(message),
            crate::services::WorkflowMarketError::Repository(error) => error.into(),
            crate::services::WorkflowMarketError::VersionRepository(error) => {
                Self::internal(error.to_string())
            }
            crate::services::WorkflowMarketError::Storage(error) => Self::validation(error.to_string()),
            crate::services::WorkflowMarketError::UserRepository(error) => error.into(),
        }
    }
}

impl From<crate::services::MarketplaceError> for ApiError {
    fn from(error: crate::services::MarketplaceError) -> Self {
        match error {
            crate::services::MarketplaceError::Forbidden => Self::forbidden("permission denied"),
            crate::services::MarketplaceError::NotFound(value) => Self::not_found(value),
            crate::services::MarketplaceError::Validation(message) => Self::validation(message),
            crate::services::MarketplaceError::Repository(error) => error.into(),
            crate::services::MarketplaceError::VersionRepository(error) => {
                Self::internal(error.to_string())
            }
            crate::services::MarketplaceError::UserRepository(error) => error.into(),
            crate::services::MarketplaceError::Search(error) => Self::validation(error.to_string()),
            crate::services::MarketplaceError::Like(error) => Self::internal(error.to_string()),
            crate::services::MarketplaceError::Dislike(error) => Self::internal(error.to_string()),
            crate::services::MarketplaceError::Favorite(error) => Self::internal(error.to_string()),
        }
    }
}

impl From<crate::services::ReviewError> for ApiError {
    fn from(error: crate::services::ReviewError) -> Self {
        match error {
            crate::services::ReviewError::Forbidden => Self::forbidden("permission denied"),
            crate::services::ReviewError::NotFound(value) => Self::not_found(value),
            crate::services::ReviewError::ResourceNotFound(value) => Self::not_found(value),
            crate::services::ReviewError::Conflict => {
                Self::conflict("review already exists for this resource")
            }
            crate::services::ReviewError::InvalidRating => {
                Self::validation("rating must be between 1 and 5")
            }
            crate::services::ReviewError::MissingResourceId => {
                Self::validation("resource_id is required")
            }
            crate::services::ReviewError::Repository(repo_error) => match repo_error {
                crate::repositories::ReviewRepositoryError::Conflict { .. } => {
                    Self::conflict("review already exists for this resource")
                }
                crate::repositories::ReviewRepositoryError::NotFound(value) => Self::not_found(value),
                crate::repositories::ReviewRepositoryError::ResourceNotFound(value) => {
                    Self::not_found(value)
                }
                crate::repositories::ReviewRepositoryError::InvalidRating => {
                    Self::validation("rating must be between 1 and 5")
                }
                other => Self::internal(other.to_string()),
            },
            crate::services::ReviewError::UserRepository(error) => error.into(),
            crate::services::ReviewError::Rating(error) => Self::internal(error.to_string()),
        }
    }
}

impl From<crate::services::NewsServiceError> for ApiError {
    fn from(error: crate::services::NewsServiceError) -> Self {
        match error {
            crate::services::NewsServiceError::SourceNotFound(value)
            | crate::services::NewsServiceError::ArticleNotFound(value) => Self::not_found(value),
            crate::services::NewsServiceError::SourceDisabled => {
                Self::validation("rss source is disabled")
            }
            crate::services::NewsServiceError::FeedUrlConflict => {
                Self::conflict("feed_url already exists")
            }
            crate::services::NewsServiceError::Validation(message) => Self::validation(message),
            crate::services::NewsServiceError::Fetch(fetch_error) => Self::validation(fetch_error.to_string()),
            crate::services::NewsServiceError::RssSource(repo_error) => match repo_error {
                crate::repositories::RssSourceRepositoryError::FeedUrlConflict(url) => {
                    Self::conflict(format!("feed_url already exists: {url}"))
                }
                crate::repositories::RssSourceRepositoryError::NotFound(value) => Self::not_found(value),
                crate::repositories::RssSourceRepositoryError::Validation(news_error) => {
                    Self::validation(news_error.to_string())
                }
                other => Self::internal(other.to_string()),
            },
            crate::services::NewsServiceError::Article(article_error) => match article_error {
                crate::repositories::NewsArticleRepositoryError::NotFound(value) => Self::not_found(value),
                other => Self::internal(other.to_string()),
            },
            crate::services::NewsServiceError::FetchLog(error) => Self::internal(error.to_string()),
            crate::services::NewsServiceError::FavoriteConflict => {
                Self::conflict("favorite already exists for this article")
            }
            crate::services::NewsServiceError::LikeConflict => {
                Self::conflict("like already exists for this article")
            }
            crate::services::NewsServiceError::Forbidden => Self::forbidden("permission denied"),
            crate::services::NewsServiceError::Favorite(error) => match error {
                crate::repositories::FavoriteRepositoryError::Conflict => {
                    Self::conflict("favorite already exists for this article")
                }
                other => Self::internal(other.to_string()),
            },
            crate::services::NewsServiceError::Like(error) => match error {
                crate::repositories::LikeRepositoryError::Conflict => {
                    Self::conflict("like already exists for this article")
                }
                other => Self::internal(other.to_string()),
            },
            crate::services::NewsServiceError::Comment(error) => match error {
                crate::repositories::CommentRepositoryError::Validation(social_error) => {
                    Self::validation(social_error.to_string())
                }
                crate::repositories::CommentRepositoryError::NotFound(value) => Self::not_found(value),
                other => Self::internal(other.to_string()),
            },
            crate::services::NewsServiceError::UserRepository(error) => error.into(),
            crate::services::NewsServiceError::Search(error) => Self::validation(error.to_string()),
        }
    }
}

impl From<crate::services::BoardServiceError> for ApiError {
    fn from(error: crate::services::BoardServiceError) -> Self {
        match error {
            crate::services::BoardServiceError::NotFound(value) => Self::not_found(value),
            crate::services::BoardServiceError::Validation(message) => Self::validation(message),
            crate::services::BoardServiceError::Forbidden => Self::forbidden("permission denied"),
            crate::services::BoardServiceError::User(error) => error.into(),
            crate::services::BoardServiceError::Comment(error) => match error {
                crate::repositories::CommentRepositoryError::Validation(social_error) => {
                    Self::validation(social_error.to_string())
                }
                crate::repositories::CommentRepositoryError::NotFound(value) => Self::not_found(value),
                other => Self::internal(other.to_string()),
            },
        }
    }
}

impl From<crate::services::TaskMarketError> for ApiError {
    fn from(error: crate::services::TaskMarketError) -> Self {
        match error {
            crate::services::TaskMarketError::Forbidden => Self::forbidden("permission denied"),
            crate::services::TaskMarketError::NotFound(value) => Self::not_found(value),
            crate::services::TaskMarketError::Validation(message) => Self::validation(message),
            crate::services::TaskMarketError::InvalidTransition { from, to } => {
                Self::validation(format!("invalid status transition: {from} -> {to}"))
            }
            crate::services::TaskMarketError::NotEditable => {
                Self::validation("task can only be edited while in draft status")
            }
            crate::services::TaskMarketError::ApplicationConflict => {
                Self::conflict("application already exists for this task")
            }
            crate::services::TaskMarketError::CannotApplyToOwnTask => {
                Self::validation("cannot apply to your own task")
            }
            crate::services::TaskMarketError::NotOpenForApplications => {
                Self::validation("task is not open for applications")
            }
            crate::services::TaskMarketError::ApplicationNotFound(value) => Self::not_found(value),
            crate::services::TaskMarketError::DeliveryNotFound(value) => Self::not_found(value),
            crate::services::TaskMarketError::InvalidTaskState => {
                Self::validation("invalid task state for operation")
            }
            crate::services::TaskMarketError::Database(error) => Self::internal(error.to_string()),
            crate::services::TaskMarketError::Io(error) => Self::validation(error.to_string()),
            crate::services::TaskMarketError::Repository(repo_error) => match repo_error {
                crate::repositories::TaskRepositoryError::Validation(task_error) => {
                    match task_error {
                        crate::domain::TaskError::InvalidStatusTransition { from, to } => {
                            Self::validation(format!("invalid status transition: {from} -> {to}"))
                        }
                        crate::domain::TaskError::NotEditable => {
                            Self::validation("task can only be edited while in draft status")
                        }
                        other => Self::validation(other.to_string()),
                    }
                }
                crate::repositories::TaskRepositoryError::NotFound(value) => Self::not_found(value),
                other => Self::internal(other.to_string()),
            },
            crate::services::TaskMarketError::UserRepository(error) => error.into(),
        }
    }
}

impl From<crate::services::OrderServiceError> for ApiError {
    fn from(error: crate::services::OrderServiceError) -> Self {
        match error {
            crate::services::OrderServiceError::Forbidden => Self::forbidden("permission denied"),
            crate::services::OrderServiceError::NotFound(value)
            | crate::services::OrderServiceError::TaskNotFound(value) => Self::not_found(value),
            crate::services::OrderServiceError::OrderConflict => {
                Self::conflict("order already exists for this task")
            }
            crate::services::OrderServiceError::TaskNotCompleted => {
                Self::validation("task is not completed")
            }
            crate::services::OrderServiceError::TaskMissingAssignee => {
                Self::validation("task has no assignee")
            }
            crate::services::OrderServiceError::InvalidTransition { from, to } => {
                Self::validation(format!("invalid order status transition: {from} -> {to}"))
            }
            crate::services::OrderServiceError::Validation(message) => Self::validation(message),
            crate::services::OrderServiceError::OrderRepository(repo_error) => match repo_error {
                crate::repositories::OrderRepositoryError::Conflict => {
                    Self::conflict("order already exists for this task")
                }
                crate::repositories::OrderRepositoryError::NotFound(value) => Self::not_found(value),
                crate::repositories::OrderRepositoryError::Validation(order_error) => {
                    match order_error {
                        crate::domain::OrderError::InvalidStatusTransition { from, to } => {
                            Self::validation(format!("invalid order status transition: {from} -> {to}"))
                        }
                        other => Self::validation(other.to_string()),
                    }
                }
                other => Self::internal(other.to_string()),
            },
            crate::services::OrderServiceError::TaskRepository(repo_error) => match repo_error {
                crate::repositories::TaskRepositoryError::NotFound(value) => Self::not_found(value),
                other => Self::internal(other.to_string()),
            },
        }
    }
}

impl From<crate::services::TaskReviewServiceError> for ApiError {
    fn from(error: crate::services::TaskReviewServiceError) -> Self {
        match error {
            crate::services::TaskReviewServiceError::Forbidden => {
                Self::forbidden("permission denied")
            }
            crate::services::TaskReviewServiceError::TaskNotFound(value)
            | crate::services::TaskReviewServiceError::UserNotFound(value) => Self::not_found(value),
            crate::services::TaskReviewServiceError::TaskNotCompleted => {
                Self::validation("task is not completed")
            }
            crate::services::TaskReviewServiceError::InvalidReviewParticipant => {
                Self::validation("invalid review participant")
            }
            crate::services::TaskReviewServiceError::TaskReviewConflict => {
                Self::conflict("task review already exists")
            }
            crate::services::TaskReviewServiceError::InvalidRating => {
                Self::validation("rating must be between 1 and 5")
            }
            crate::services::TaskReviewServiceError::Validation(message) => Self::validation(message),
            crate::services::TaskReviewServiceError::TaskRepository(repo_error) => match repo_error {
                crate::repositories::TaskRepositoryError::NotFound(value) => Self::not_found(value),
                other => Self::internal(other.to_string()),
            },
            crate::services::TaskReviewServiceError::TaskReviewRepository(repo_error) => {
                match repo_error {
                    crate::repositories::TaskReviewRepositoryError::Conflict => {
                        Self::conflict("task review already exists")
                    }
                    crate::repositories::TaskReviewRepositoryError::InvalidRating => {
                        Self::validation("rating must be between 1 and 5")
                    }
                    crate::repositories::TaskReviewRepositoryError::NotFound(value) => {
                        Self::not_found(value)
                    }
                    other => Self::internal(other.to_string()),
                }
            }
            crate::services::TaskReviewServiceError::UserRepository(error) => error.into(),
        }
    }
}

impl From<crate::services::ModerationServiceError> for ApiError {
    fn from(error: crate::services::ModerationServiceError) -> Self {
        match error {
            crate::services::ModerationServiceError::Forbidden => {
                Self::forbidden("permission denied")
            }
            crate::services::ModerationServiceError::ReportNotFound(value)
            | crate::services::ModerationServiceError::ResourceNotFound(value)
            | crate::services::ModerationServiceError::UserNotFound(value) => Self::not_found(value),
            crate::services::ModerationServiceError::InvalidAction(action) => {
                Self::validation(format!("invalid moderation action: {action}"))
            }
            crate::services::ModerationServiceError::NotPendingReview => {
                Self::validation("resource is not pending review")
            }
            crate::services::ModerationServiceError::Validation(message) => Self::validation(message),
            crate::services::ModerationServiceError::ReportRepository(repo_error) => match repo_error {
                crate::repositories::ReportRepositoryError::NotFound(value) => Self::not_found(value),
                other => Self::internal(other.to_string()),
            },
            crate::services::ModerationServiceError::ModerationLogRepository(error) => {
                Self::internal(error.to_string())
            }
            crate::services::ModerationServiceError::ResourceRepository(repo_error) => {
                repo_error.into()
            }
            crate::services::ModerationServiceError::UserRepository(error) => error.into(),
            crate::services::ModerationServiceError::DeviceBlacklist(error) => {
                Self::internal(error.to_string())
            }
        }
    }
}

impl From<crate::services::AdminManagementError> for ApiError {
    fn from(error: crate::services::AdminManagementError) -> Self {
        match error {
            crate::services::AdminManagementError::Forbidden => Self::forbidden("permission denied"),
            crate::services::AdminManagementError::NotFound(value) => Self::not_found(value),
            crate::services::AdminManagementError::Validation(message) => Self::validation(message),
            crate::services::AdminManagementError::UserRepository(error) => error.into(),
        }
    }
}

impl From<crate::services::PresenceServiceError> for ApiError {
    fn from(error: crate::services::PresenceServiceError) -> Self {
        match error {
            crate::services::PresenceServiceError::MissingDeviceId
            | crate::services::PresenceServiceError::MissingDeviceName
            | crate::services::PresenceServiceError::InvalidDeviceKind(_) => {
                Self::validation(error.to_string())
            }
            crate::services::PresenceServiceError::DeviceBanned => {
                Self::forbidden("device is banned")
            }
            crate::services::PresenceServiceError::UserRepository(error) => error.into(),
            crate::services::PresenceServiceError::DevicePresence(error) => {
                Self::internal(error.to_string())
            }
            crate::services::PresenceServiceError::DeviceBlacklist(error) => {
                Self::internal(error.to_string())
            }
        }
    }
}

impl From<crate::services::InstallServiceError> for ApiError {
    fn from(error: crate::services::InstallServiceError) -> Self {
        match error {
            crate::services::InstallServiceError::Forbidden => Self::forbidden("permission denied"),
            crate::services::InstallServiceError::NotFound(value)
            | crate::services::InstallServiceError::ResourceNotFound(value) => Self::not_found(value),
            crate::services::InstallServiceError::VersionNotFound => {
                Self::not_found("version not found for resource")
            }
            crate::services::InstallServiceError::ResourceNotInstallable => {
                Self::validation("resource is not installable")
            }
            crate::services::InstallServiceError::ResourceTypeMismatch => {
                Self::validation("resource type mismatch")
            }
            crate::services::InstallServiceError::AlreadyCompleted => {
                Self::conflict("install already completed")
            }
            crate::services::InstallServiceError::PackageNotAvailable => {
                Self::validation("package not available")
            }
            crate::services::InstallServiceError::Validation(message) => Self::validation(message),
            crate::services::InstallServiceError::InstallRepository(repo_error) => match repo_error {
                crate::repositories::InstallRepositoryError::NotFound(value) => Self::not_found(value),
                crate::repositories::InstallRepositoryError::Validation(install_error) => {
                    match install_error {
                        crate::domain::InstallError::AlreadyCompleted => {
                            Self::conflict("install already completed")
                        }
                        other => Self::validation(other.to_string()),
                    }
                }
                other => Self::internal(other.to_string()),
            },
            crate::services::InstallServiceError::ResourceRepository(repo_error) => repo_error.into(),
            crate::services::InstallServiceError::VersionRepository(error) => {
                Self::internal(error.to_string())
            }
        }
    }
}

impl From<crate::services::ResourceSocialError> for ApiError {
    fn from(error: crate::services::ResourceSocialError) -> Self {
        match error {
            crate::services::ResourceSocialError::Forbidden => Self::forbidden("permission denied"),
            crate::services::ResourceSocialError::NotFound(value) => Self::not_found(value),
            crate::services::ResourceSocialError::AlreadyLiked => Self::conflict("already liked"),
            crate::services::ResourceSocialError::AlreadyDisliked => Self::conflict("already disliked"),
            crate::services::ResourceSocialError::AlreadyFavorited => Self::conflict("already favorited"),
            crate::services::ResourceSocialError::Repository(error) => error.into(),
            crate::services::ResourceSocialError::Like(error) => match error {
                crate::repositories::LikeRepositoryError::Conflict => Self::conflict("already liked"),
                other => Self::internal(other.to_string()),
            },
            crate::services::ResourceSocialError::Dislike(error) => match error {
                crate::repositories::DislikeRepositoryError::Conflict => Self::conflict("already disliked"),
                other => Self::internal(other.to_string()),
            },
            crate::services::ResourceSocialError::Favorite(error) => match error {
                crate::repositories::FavoriteRepositoryError::Conflict => Self::conflict("already favorited"),
                other => Self::internal(other.to_string()),
            },
        }
    }
}

impl From<crate::services::KnowledgeMarketError> for ApiError {
    fn from(error: crate::services::KnowledgeMarketError) -> Self {
        match error {
            crate::services::KnowledgeMarketError::Forbidden => Self::forbidden("permission denied"),
            crate::services::KnowledgeMarketError::NotFound(value) => Self::not_found(value),
            crate::services::KnowledgeMarketError::NotKnowledgeResource => {
                Self::validation("not a knowledge resource")
            }
            crate::services::KnowledgeMarketError::Validation(message) => Self::validation(message),
            crate::services::KnowledgeMarketError::VersionConflict { resource_id, version } => {
                Self::conflict(format!("version conflict: {resource_id}@{version}"))
            }
            crate::services::KnowledgeMarketError::Repository(error) => error.into(),
            crate::services::KnowledgeMarketError::Version(error) => Self::internal(error.to_string()),
            crate::services::KnowledgeMarketError::Storage(error) => Self::validation(error.to_string()),
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let body = ApiErrorResponse {
            ok: false,
            error: ApiErrorBody {
                code: self.code,
                message: self.message,
                retryable: self.retryable,
            },
        };

        (self.status, Json(body)).into_response()
    }
}
