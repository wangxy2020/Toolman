use serde::Serialize;
use sqlx::SqlitePool;

use crate::domain::{
    CommunityReport, CommunityResource, CommunityUser, CreateModerationLogInput, CreateReportInput,
    ModerationLog, ReportReason, ReportStatus, ReportTargetType, ResourceListFilter, ResourceStatus,
    ResourceType, ResourceVisibility, TaskListFilter, TaskStatus, UpdateResourceInput, UserRole,
};
use crate::repositories::moderation_log_repository::{
    ModerationLogListFilter, ModerationLogRepository, ModerationLogRepositoryError,
};
use crate::repositories::report_repository::{
    ReportListFilter, ReportRepository, ReportRepositoryError,
};
use crate::repositories::resource_repository::{RepositoryError, ResourceRepository};
use crate::repositories::task_repository::TaskRepository;
use crate::repositories::UserRepository;
use crate::repositories::device_presence_repository::DeviceKind;
use crate::repositories::{
    BanDeviceInput, DeviceBlacklistRepository, DeviceBlacklistRepositoryError,
};
use crate::services::board_service::{BoardService, BOARD_MAIN_ID};
use crate::services::presence_service::{DevicePresenceItem, PresenceService};
use crate::repositories::{CommentListFilter, CommentRepository};
use crate::domain::InteractionTargetType;

#[derive(Debug, Clone)]
pub struct CreateReportRequest {
    pub target_type: ReportTargetType,
    pub target_id: String,
    pub reason: ReportReason,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub struct ReportListQuery {
    pub status: Option<ReportStatus>,
    pub limit: i64,
    pub offset: i64,
}

#[derive(Debug, Clone)]
pub struct ResolveReportRequest {
    pub action: String,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub struct SuspendResourceRequest {
    pub reason: Option<String>,
}

#[derive(Debug, Clone)]
pub struct BanUserRequest {
    pub duration_hours: Option<i64>,
    pub reason: Option<String>,
}

#[derive(Debug, Clone)]
pub struct BanDeviceRequest {
    pub user_id: String,
    pub device_name: String,
    pub duration_hours: Option<i64>,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub struct ModerationLogListQuery {
    pub limit: i64,
    pub offset: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct ReportItem {
    pub id: String,
    pub reporter_id: String,
    pub target_type: String,
    pub target_id: String,
    pub reason: String,
    pub description: String,
    pub status: String,
    pub created_at: i64,
    pub resolved_at: Option<i64>,
    pub resolved_by: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ModerationLogItem {
    pub id: String,
    pub moderator_id: String,
    pub action: String,
    pub target_type: String,
    pub target_id: String,
    pub reason: Option<String>,
    pub metadata_json: serde_json::Value,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct ScanResourceItem {
    pub id: String,
    pub title: String,
    pub resource_type: String,
    pub status: String,
    pub author_id: String,
    pub author_name: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct ScanMessageItem {
    pub id: String,
    pub user_id: String,
    pub author_name: String,
    pub body: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct ScanTaskItem {
    pub id: String,
    pub title: String,
    pub publisher_id: String,
    pub publisher_name: String,
    pub status: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct ScanBannedUserItem {
    pub user_id: String,
    pub display_name: String,
    pub banned_until: Option<i64>,
    pub banned_at: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct ScanBannedDeviceItem {
    pub device_id: String,
    pub device_name: String,
    pub user_id: String,
    pub user_name: String,
    pub reason: Option<String>,
    pub banned_at: i64,
    pub banned_until: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ScanDeviceItem {
    pub device_id: String,
    pub device_name: String,
    pub device_kind: String,
    pub user_id: String,
    pub user_name: String,
    pub last_seen_at: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct ModerationScanResult {
    pub scanned_at: i64,
    pub online_knowledge_count: i64,
    pub online_mcp_count: i64,
    pub online_skill_count: i64,
    pub online_workflow_count: i64,
    pub online_desktop_device_count: i64,
    pub online_mobile_device_count: i64,
    pub open_report_count: i64,
    pub pending_review_count: i64,
    pub board_message_count: i64,
    pub active_task_count: i64,
    pub online_resources: Vec<ScanResourceItem>,
    pub online_desktop_devices: Vec<ScanDeviceItem>,
    pub online_mobile_devices: Vec<ScanDeviceItem>,
    pub open_reports: Vec<ReportItem>,
    pub pending_review: Vec<ScanResourceItem>,
    pub pending_review_tasks: Vec<ScanTaskItem>,
    pub recent_messages: Vec<ScanMessageItem>,
    pub active_tasks: Vec<ScanTaskItem>,
    pub banned_users: Vec<ScanBannedUserItem>,
    pub banned_devices: Vec<ScanBannedDeviceItem>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ResourceModerationItem {
    pub id: String,
    pub title: String,
    pub status: String,
}

#[derive(Debug, thiserror::Error)]
pub enum ModerationServiceError {
    #[error("forbidden")]
    Forbidden,
    #[error("report not found: {0}")]
    ReportNotFound(String),
    #[error("resource not found: {0}")]
    ResourceNotFound(String),
    #[error("user not found: {0}")]
    UserNotFound(String),
    #[error("invalid moderation action: {0}")]
    InvalidAction(String),
    #[error("resource is not pending review")]
    NotPendingReview,
    #[error("validation error: {0}")]
    Validation(String),
    #[error("report repository error: {0}")]
    ReportRepository(#[from] ReportRepositoryError),
    #[error("moderation log repository error: {0}")]
    ModerationLogRepository(#[from] ModerationLogRepositoryError),
    #[error("resource repository error: {0}")]
    ResourceRepository(#[from] RepositoryError),
    #[error("user repository error: {0}")]
    UserRepository(#[from] crate::repositories::UserRepositoryError),
    #[error("device blacklist repository error: {0}")]
    DeviceBlacklist(#[from] DeviceBlacklistRepositoryError),
}

pub struct ModerationService {
    pool: SqlitePool,
}

impl ModerationService {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn create_report(
        &self,
        actor: &CommunityUser,
        input: CreateReportRequest,
    ) -> Result<ReportItem, ModerationServiceError> {
        if !actor.is_active(chrono::Utc::now().timestamp_millis()) {
            return Err(ModerationServiceError::Forbidden);
        }

        let description = input.description.unwrap_or_default();
        let report = ReportRepository::new(self.pool.clone())
            .create(CreateReportInput {
                reporter_id: actor.id.clone(),
                target_type: input.target_type,
                target_id: input.target_id,
                reason: input.reason,
                description,
            })
            .await?;

        Ok(to_report_item(report))
    }

    pub async fn list_reports(
        &self,
        actor: &CommunityUser,
        query: &ReportListQuery,
    ) -> Result<Vec<ReportItem>, ModerationServiceError> {
        ensure_admin(actor)?;

        let reports = ReportRepository::new(self.pool.clone())
            .list(&ReportListFilter {
                status: query.status,
                limit: query.limit,
                offset: query.offset,
            })
            .await?;

        Ok(reports.into_iter().map(to_report_item).collect())
    }

    pub async fn resolve_report(
        &self,
        actor: &CommunityUser,
        report_id: &str,
        input: ResolveReportRequest,
    ) -> Result<ReportItem, ModerationServiceError> {
        ensure_admin(actor)?;

        let report = ReportRepository::new(self.pool.clone())
            .find_by_id(report_id)
            .await?
            .ok_or_else(|| ModerationServiceError::ReportNotFound(report_id.to_string()))?;

        match input.action.as_str() {
            "suspend_resource" => {
                if report.target_type == ReportTargetType::Resource {
                    self.suspend_resource_internal(
                        actor,
                        &report.target_id,
                        input.note.as_deref(),
                        Some(report_id),
                    )
                    .await?;
                } else {
                    return Err(ModerationServiceError::Validation(
                        "suspend_resource requires a resource target".to_string(),
                    ));
                }
                self.resolve_report_status(actor, report_id, ReportStatus::Resolved)
                    .await
            }
            "suspend_and_ban_author" => {
                if report.target_type != ReportTargetType::Resource {
                    return Err(ModerationServiceError::Validation(
                        "suspend_and_ban_author requires a resource target".to_string(),
                    ));
                }
                let resource = self.require_resource(&report.target_id).await?;
                self.suspend_resource_internal(
                    actor,
                    &report.target_id,
                    input.note.as_deref(),
                    Some(report_id),
                )
                .await?;
                self.ban_user_internal(
                    actor,
                    &resource.author_id,
                    Some(168),
                    input.note.as_deref(),
                    Some(report_id),
                )
                .await?;
                self.resolve_report_status(actor, report_id, ReportStatus::Resolved)
                    .await
            }
            "ban_user" => {
                let user_id = self.resolve_subject_user_id(&report).await?;
                self.ban_user_internal(
                    actor,
                    &user_id,
                    Some(168),
                    input.note.as_deref(),
                    Some(report_id),
                )
                .await?;
                self.resolve_report_status(actor, report_id, ReportStatus::Resolved)
                    .await
            }
            "delete_comment" => {
                if report.target_type != ReportTargetType::Comment {
                    return Err(ModerationServiceError::Validation(
                        "delete_comment requires a comment target".to_string(),
                    ));
                }
                self.delete_comment_internal(
                    actor,
                    &report.target_id,
                    input.note.as_deref(),
                    Some(report_id),
                )
                .await?;
                self.resolve_report_status(actor, report_id, ReportStatus::Resolved)
                    .await
            }
            "cancel_task" => {
                if report.target_type != ReportTargetType::Task {
                    return Err(ModerationServiceError::Validation(
                        "cancel_task requires a task target".to_string(),
                    ));
                }
                self.cancel_task_internal(
                    actor,
                    &report.target_id,
                    input.note.as_deref(),
                    Some(report_id),
                )
                .await?;
                self.resolve_report_status(actor, report_id, ReportStatus::Resolved)
                    .await
            }
            "dismiss_report" => {
                self.resolve_report_status(actor, report_id, ReportStatus::Dismissed)
                    .await
            }
            other => Err(ModerationServiceError::InvalidAction(other.to_string())),
        }
    }

    pub async fn suspend_resource(
        &self,
        actor: &CommunityUser,
        resource_id: &str,
        input: SuspendResourceRequest,
    ) -> Result<ResourceModerationItem, ModerationServiceError> {
        ensure_admin(actor)?;
        self.suspend_resource_internal(actor, resource_id, input.reason.as_deref(), None)
            .await
    }

    pub async fn approve_resource(
        &self,
        actor: &CommunityUser,
        resource_id: &str,
        note: Option<String>,
    ) -> Result<ResourceModerationItem, ModerationServiceError> {
        ensure_admin(actor)?;

        let resource = ResourceRepository::new(self.pool.clone())
            .find_by_id(resource_id)
            .await?
            .ok_or_else(|| ModerationServiceError::ResourceNotFound(resource_id.to_string()))?;

        if resource.status != ResourceStatus::PendingReview {
            return Err(ModerationServiceError::NotPendingReview);
        }

        let updated = ResourceRepository::new(self.pool.clone())
            .update(
                resource_id,
                UpdateResourceInput {
                    status: Some(ResourceStatus::Published),
                    ..Default::default()
                },
            )
            .await?;

        self.write_log(
            actor,
            "approve_resource",
            "resource",
            resource_id,
            note.as_deref(),
            None,
        )
        .await?;

        Ok(ResourceModerationItem {
            id: updated.id,
            title: updated.title,
            status: updated.status.as_str().to_string(),
        })
    }

    pub async fn approve_task(
        &self,
        actor: &CommunityUser,
        task_id: &str,
        note: Option<String>,
    ) -> Result<ResourceModerationItem, ModerationServiceError> {
        ensure_admin(actor)?;

        let task = TaskRepository::new(self.pool.clone())
            .find_by_id(task_id)
            .await
            .map_err(|error| ModerationServiceError::Validation(error.to_string()))?
            .ok_or_else(|| ModerationServiceError::Validation(format!("task not found: {task_id}")))?;

        if task.status != TaskStatus::PendingReview {
            return Err(ModerationServiceError::NotPendingReview);
        }

        let updated = TaskRepository::new(self.pool.clone())
            .transition_status(task_id, TaskStatus::Open)
            .await
            .map_err(|error| ModerationServiceError::Validation(error.to_string()))?;

        self.write_log(
            actor,
            "approve_task",
            "task",
            task_id,
            note.as_deref(),
            None,
        )
        .await?;

        Ok(ResourceModerationItem {
            id: updated.id,
            title: updated.title,
            status: updated.status.as_str().to_string(),
        })
    }

    pub async fn reject_task(
        &self,
        actor: &CommunityUser,
        task_id: &str,
        note: Option<String>,
    ) -> Result<ResourceModerationItem, ModerationServiceError> {
        ensure_admin(actor)?;

        let task = TaskRepository::new(self.pool.clone())
            .find_by_id(task_id)
            .await
            .map_err(|error| ModerationServiceError::Validation(error.to_string()))?
            .ok_or_else(|| ModerationServiceError::Validation(format!("task not found: {task_id}")))?;

        if task.status != TaskStatus::PendingReview {
            return Err(ModerationServiceError::NotPendingReview);
        }

        self.cancel_task_internal(actor, task_id, note.as_deref(), None)
            .await?;

        let updated = TaskRepository::new(self.pool.clone())
            .find_by_id(task_id)
            .await
            .map_err(|error| ModerationServiceError::Validation(error.to_string()))?
            .ok_or_else(|| ModerationServiceError::Validation(format!("task not found: {task_id}")))?;

        Ok(ResourceModerationItem {
            id: updated.id,
            title: updated.title,
            status: updated.status.as_str().to_string(),
        })
    }

    pub async fn ban_user(
        &self,
        actor: &CommunityUser,
        user_id: &str,
        input: BanUserRequest,
    ) -> Result<(), ModerationServiceError> {
        ensure_admin(actor)?;
        self.ban_user_internal(
            actor,
            user_id,
            input.duration_hours,
            input.reason.as_deref(),
            None,
        )
        .await
    }

    pub async fn ban_device(
        &self,
        actor: &CommunityUser,
        device_id: &str,
        input: BanDeviceRequest,
    ) -> Result<(), ModerationServiceError> {
        ensure_admin(actor)?;

        let device_id = device_id.trim();
        if device_id.is_empty() {
            return Err(ModerationServiceError::Validation(
                "device id is required".to_string(),
            ));
        }

        let user_id = input.user_id.trim();
        if user_id.is_empty() {
            return Err(ModerationServiceError::Validation(
                "user id is required".to_string(),
            ));
        }

        let banned_until = input
            .duration_hours
            .map(|hours| chrono::Utc::now().timestamp_millis() + hours * 3_600_000);

        DeviceBlacklistRepository::new(self.pool.clone())
            .ban_device(BanDeviceInput {
                device_id: device_id.to_string(),
                user_id: user_id.to_string(),
                device_name: input.device_name.trim().to_string(),
                reason: input.reason.clone(),
                banned_by: actor.id.clone(),
                banned_until,
            })
            .await?;

        self.write_log(
            actor,
            "ban_device",
            "device",
            device_id,
            input.reason.as_deref(),
            Some(serde_json::json!({
                "user_id": user_id,
                "device_name": input.device_name,
                "duration_hours": input.duration_hours,
            })),
        )
        .await?;

        Ok(())
    }

    pub async fn unban_user(&self, actor: &CommunityUser, user_id: &str) -> Result<(), ModerationServiceError> {
        ensure_admin(actor)?;

        UserRepository::new(self.pool.clone())
            .unban_user(user_id)
            .await?;

        self.write_log(
            actor,
            "unban_user",
            "user",
            user_id,
            Some("管理员解除用户封禁"),
            None,
        )
        .await?;

        Ok(())
    }

    pub async fn unban_device(
        &self,
        actor: &CommunityUser,
        device_id: &str,
    ) -> Result<(), ModerationServiceError> {
        ensure_admin(actor)?;

        let device_id = device_id.trim();
        if device_id.is_empty() {
            return Err(ModerationServiceError::Validation(
                "device id is required".to_string(),
            ));
        }

        DeviceBlacklistRepository::new(self.pool.clone())
            .unban_device(device_id)
            .await?;

        self.write_log(
            actor,
            "unban_device",
            "device",
            device_id,
            Some("管理员解除设备封禁"),
            None,
        )
        .await?;

        Ok(())
    }

    pub async fn list_logs(
        &self,
        actor: &CommunityUser,
        query: &ModerationLogListQuery,
    ) -> Result<Vec<ModerationLogItem>, ModerationServiceError> {
        ensure_admin(actor)?;

        let logs = ModerationLogRepository::new(self.pool.clone())
            .list(&ModerationLogListFilter {
                limit: query.limit,
                offset: query.offset,
            })
            .await?;

        Ok(logs.into_iter().map(to_log_item).collect())
    }

    pub async fn scan_online_content(
        &self,
        actor: &CommunityUser,
    ) -> Result<ModerationScanResult, ModerationServiceError> {
        ensure_admin(actor)?;

        const SCAN_LIMIT: i64 = 100;
        let users = UserRepository::new(self.pool.clone());
        let resources = ResourceRepository::new(self.pool.clone());

        let online_knowledge_count = resources.count_published_online(ResourceType::Knowledge).await?;
        let online_mcp_count = resources.count_published_online(ResourceType::Mcp).await?;
        let online_skill_count = resources.count_published_online(ResourceType::Skill).await?;
        let online_workflow_count = resources.count_published_online(ResourceType::Workflow).await?;

        let published = resources
            .list(&ResourceListFilter {
                status: Some(ResourceStatus::Published),
                visibility: Some(ResourceVisibility::Public),
                limit: Some(SCAN_LIMIT),
                offset: Some(0),
                ..Default::default()
            })
            .await?;

        let pending_review = resources
            .list(&ResourceListFilter {
                status: Some(ResourceStatus::PendingReview),
                limit: Some(SCAN_LIMIT),
                offset: Some(0),
                ..Default::default()
            })
            .await?;

        let mut online_resources = Vec::new();
        for resource in published {
            online_resources.push(self.to_scan_resource(&users, resource).await?);
        }

        let mut pending_items = Vec::new();
        for resource in pending_review {
            pending_items.push(self.to_scan_resource(&users, resource).await?);
        }

        let pending_review_task_records = TaskRepository::new(self.pool.clone())
            .list(&TaskListFilter {
                status: Some(TaskStatus::PendingReview),
                limit: SCAN_LIMIT,
                offset: 0,
                ..Default::default()
            })
            .await
            .map_err(|error| ModerationServiceError::Validation(error.to_string()))?;

        let mut pending_review_tasks = Vec::with_capacity(pending_review_task_records.len());
        for task in pending_review_task_records {
            let publisher_name = users
                .find_by_id(&task.publisher_id)
                .await?
                .map(|user| user.display_name)
                .unwrap_or_else(|| "Unknown".to_string());
            pending_review_tasks.push(ScanTaskItem {
                id: task.id,
                title: task.title,
                publisher_id: task.publisher_id,
                publisher_name,
                status: task.status.as_str().to_string(),
                created_at: task.created_at,
            });
        }

        let open_reports = ReportRepository::new(self.pool.clone())
            .list(&ReportListFilter {
                status: Some(ReportStatus::Open),
                limit: SCAN_LIMIT,
                offset: 0,
            })
            .await?
            .into_iter()
            .map(to_report_item)
            .collect::<Vec<_>>();

        let comments = CommentRepository::new(self.pool.clone())
            .list(&CommentListFilter {
                target_type: InteractionTargetType::Board,
                target_id: BOARD_MAIN_ID.to_string(),
                user_id: None,
                parent_id: Some(None),
                limit: SCAN_LIMIT,
                offset: 0,
            })
            .await
            .map_err(|error| ModerationServiceError::Validation(error.to_string()))?;

        let board_message_count = CommentRepository::new(self.pool.clone())
            .count_board_root_messages(BOARD_MAIN_ID)
            .await
            .map_err(|error| ModerationServiceError::Validation(error.to_string()))?;

        let mut recent_messages = Vec::with_capacity(comments.len());
        for comment in comments {
            let author_name = users
                .find_by_id(&comment.user_id)
                .await?
                .map(|user| user.display_name)
                .unwrap_or_else(|| "Unknown".to_string());
            recent_messages.push(ScanMessageItem {
                id: comment.id,
                user_id: comment.user_id,
                author_name,
                body: comment.body,
                created_at: comment.created_at,
            });
        }

        let tasks = TaskRepository::new(self.pool.clone())
            .list(&TaskListFilter {
                status: Some(TaskStatus::Open),
                limit: SCAN_LIMIT,
                offset: 0,
                ..Default::default()
            })
            .await
            .map_err(|error| ModerationServiceError::Validation(error.to_string()))?;

        let active_task_count = TaskRepository::new(self.pool.clone())
            .count_open()
            .await
            .map_err(|error| ModerationServiceError::Validation(error.to_string()))?;

        let mut active_tasks = Vec::with_capacity(tasks.len());
        for task in tasks {
            let publisher_name = users
                .find_by_id(&task.publisher_id)
                .await?
                .map(|user| user.display_name)
                .unwrap_or_else(|| "Unknown".to_string());
            active_tasks.push(ScanTaskItem {
                id: task.id,
                title: task.title,
                publisher_id: task.publisher_id,
                publisher_name,
                status: task.status.as_str().to_string(),
                created_at: task.created_at,
            });
        }

        let presence = PresenceService::new(self.pool.clone());
        let online_desktop_devices = presence
            .list_online_devices(DeviceKind::Desktop, SCAN_LIMIT)
            .await
            .map_err(|error| ModerationServiceError::Validation(error.to_string()))?;
        let online_mobile_devices = presence
            .list_online_devices(DeviceKind::Mobile, SCAN_LIMIT)
            .await
            .map_err(|error| ModerationServiceError::Validation(error.to_string()))?;
        let online_desktop_device_count = online_desktop_devices.len() as i64;
        let online_mobile_device_count = online_mobile_devices.len() as i64;

        let banned_user_records = users.list_banned(SCAN_LIMIT).await?;
        let mut banned_users = Vec::with_capacity(banned_user_records.len());
        for user in banned_user_records {
            banned_users.push(ScanBannedUserItem {
                user_id: user.id.clone(),
                display_name: user.display_name,
                banned_until: user.banned_until,
                banned_at: user.updated_at,
            });
        }

        let banned_device_records =
            DeviceBlacklistRepository::new(self.pool.clone())
                .list_active(SCAN_LIMIT)
                .await?;
        let mut banned_devices = Vec::with_capacity(banned_device_records.len());
        for record in banned_device_records {
            let user_name = users
                .find_by_id(&record.user_id)
                .await?
                .map(|user| user.display_name)
                .unwrap_or_else(|| "Unknown".to_string());
            banned_devices.push(ScanBannedDeviceItem {
                device_id: record.device_id,
                device_name: record.device_name,
                user_id: record.user_id,
                user_name,
                reason: record.reason,
                banned_at: record.banned_at,
                banned_until: record.banned_until,
            });
        }

        Ok(ModerationScanResult {
            scanned_at: chrono::Utc::now().timestamp_millis(),
            online_knowledge_count,
            online_mcp_count,
            online_skill_count,
            online_workflow_count,
            online_desktop_device_count,
            online_mobile_device_count,
            open_report_count: open_reports.len() as i64,
            pending_review_count: pending_items.len() as i64 + pending_review_tasks.len() as i64,
            board_message_count,
            active_task_count,
            online_resources,
            online_desktop_devices: map_scan_devices(online_desktop_devices),
            online_mobile_devices: map_scan_devices(online_mobile_devices),
            open_reports,
            pending_review: pending_items,
            pending_review_tasks,
            recent_messages,
            active_tasks,
            banned_users,
            banned_devices,
        })
    }

    async fn resolve_report_status(
        &self,
        actor: &CommunityUser,
        report_id: &str,
        status: ReportStatus,
    ) -> Result<ReportItem, ModerationServiceError> {
        let report = ReportRepository::new(self.pool.clone())
            .resolve(report_id, status, &actor.id)
            .await?;

        self.write_log(
            actor,
            if status == ReportStatus::Dismissed {
                "dismiss_report"
            } else {
                "resolve_report"
            },
            "report",
            report_id,
            None,
            Some(serde_json::json!({ "status": status.as_str() })),
        )
        .await?;

        Ok(to_report_item(report))
    }

    async fn suspend_resource_internal(
        &self,
        actor: &CommunityUser,
        resource_id: &str,
        reason: Option<&str>,
        report_id: Option<&str>,
    ) -> Result<ResourceModerationItem, ModerationServiceError> {
        let resource = ResourceRepository::new(self.pool.clone())
            .find_by_id(resource_id)
            .await?
            .ok_or_else(|| ModerationServiceError::ResourceNotFound(resource_id.to_string()))?;

        let next_status = if resource.status == ResourceStatus::PendingReview {
            ResourceStatus::Rejected
        } else {
            ResourceStatus::Suspended
        };
        let action = if next_status == ResourceStatus::Rejected {
            "reject_resource"
        } else {
            "suspend_resource"
        };

        let updated = ResourceRepository::new(self.pool.clone())
            .update(
                resource_id,
                UpdateResourceInput {
                    status: Some(next_status),
                    ..Default::default()
                },
            )
            .await?;

        self.write_log(
            actor,
            action,
            "resource",
            resource_id,
            reason,
            report_id.map(|id| serde_json::json!({ "report_id": id })),
        )
        .await?;

        Ok(ResourceModerationItem {
            id: updated.id,
            title: resource.title,
            status: updated.status.as_str().to_string(),
        })
    }

    async fn ban_user_internal(
        &self,
        actor: &CommunityUser,
        user_id: &str,
        duration_hours: Option<i64>,
        reason: Option<&str>,
        report_id: Option<&str>,
    ) -> Result<(), ModerationServiceError> {
        let banned_until = duration_hours
            .map(|hours| chrono::Utc::now().timestamp_millis() + hours * 3_600_000);

        UserRepository::new(self.pool.clone())
            .ban_user(user_id, banned_until)
            .await?;

        self.write_log(
            actor,
            "ban_user",
            "user",
            user_id,
            reason,
            Some(serde_json::json!({
                "duration_hours": duration_hours,
                "report_id": report_id,
            })),
        )
        .await?;

        Ok(())
    }

    async fn delete_comment_internal(
        &self,
        actor: &CommunityUser,
        message_id: &str,
        reason: Option<&str>,
        report_id: Option<&str>,
    ) -> Result<(), ModerationServiceError> {
        BoardService::new(self.pool.clone())
            .delete_message(actor, message_id)
            .await
            .map_err(|error| ModerationServiceError::Validation(error.to_string()))?;

        self.write_log(
            actor,
            "delete_comment",
            "comment",
            message_id,
            reason,
            report_id.map(|id| serde_json::json!({ "report_id": id })),
        )
        .await?;

        Ok(())
    }

    async fn cancel_task_internal(
        &self,
        actor: &CommunityUser,
        task_id: &str,
        reason: Option<&str>,
        report_id: Option<&str>,
    ) -> Result<(), ModerationServiceError> {
        let task = TaskRepository::new(self.pool.clone())
            .find_by_id(task_id)
            .await
            .map_err(|error| ModerationServiceError::Validation(error.to_string()))?
            .ok_or_else(|| ModerationServiceError::Validation(format!("task not found: {task_id}")))?;

        let next_status = if task.status == TaskStatus::PendingReview && actor.is_moderator() {
            TaskStatus::Rejected
        } else {
            TaskStatus::Cancelled
        };
        let action = if next_status == TaskStatus::Rejected {
            "reject_task"
        } else {
            "cancel_task"
        };

        TaskRepository::new(self.pool.clone())
            .transition_status(task_id, next_status)
            .await
            .map_err(|error| ModerationServiceError::Validation(error.to_string()))?;

        self.write_log(
            actor,
            action,
            "task",
            task_id,
            reason,
            report_id.map(|id| serde_json::json!({ "report_id": id })),
        )
        .await?;

        Ok(())
    }

    async fn resolve_subject_user_id(
        &self,
        report: &CommunityReport,
    ) -> Result<String, ModerationServiceError> {
        match report.target_type {
            ReportTargetType::User => Ok(report.target_id.clone()),
            ReportTargetType::Comment => {
                let comment = CommentRepository::new(self.pool.clone())
                    .find_by_id(&report.target_id)
                    .await
                    .map_err(|error| ModerationServiceError::Validation(error.to_string()))?
                    .ok_or_else(|| {
                        ModerationServiceError::Validation(format!(
                            "comment not found: {}",
                            report.target_id
                        ))
                    })?;
                Ok(comment.user_id)
            }
            ReportTargetType::Resource => {
                let resource = self.require_resource(&report.target_id).await?;
                Ok(resource.author_id)
            }
            ReportTargetType::Task => {
                let task = TaskRepository::new(self.pool.clone())
                    .find_by_id(&report.target_id)
                    .await
                    .map_err(|error| ModerationServiceError::Validation(error.to_string()))?
                    .ok_or_else(|| {
                        ModerationServiceError::Validation(format!(
                            "task not found: {}",
                            report.target_id
                        ))
                    })?;
                Ok(task.publisher_id)
            }
            ReportTargetType::News => Err(ModerationServiceError::Validation(
                "ban_user is not supported for news targets".to_string(),
            )),
        }
    }

    async fn require_resource(
        &self,
        resource_id: &str,
    ) -> Result<CommunityResource, ModerationServiceError> {
        ResourceRepository::new(self.pool.clone())
            .find_by_id(resource_id)
            .await?
            .ok_or_else(|| ModerationServiceError::ResourceNotFound(resource_id.to_string()))
    }

    async fn to_scan_resource(
        &self,
        users: &UserRepository,
        resource: CommunityResource,
    ) -> Result<ScanResourceItem, ModerationServiceError> {
        let author_name = users
            .find_by_id(&resource.author_id)
            .await?
            .map(|user| user.display_name)
            .unwrap_or_else(|| "Unknown".to_string());

        Ok(ScanResourceItem {
            id: resource.id,
            title: resource.title,
            resource_type: resource.resource_type.as_str().to_string(),
            status: resource.status.as_str().to_string(),
            author_id: resource.author_id,
            author_name,
            created_at: resource.created_at,
        })
    }

    async fn write_log(
        &self,
        actor: &CommunityUser,
        action: &str,
        target_type: &str,
        target_id: &str,
        reason: Option<&str>,
        metadata_json: Option<serde_json::Value>,
    ) -> Result<ModerationLog, ModerationServiceError> {
        ModerationLogRepository::new(self.pool.clone())
            .create(CreateModerationLogInput {
                moderator_id: actor.id.clone(),
                action: action.to_string(),
                target_type: target_type.to_string(),
                target_id: target_id.to_string(),
                reason: reason.map(str::to_string),
                metadata_json,
            })
            .await
            .map_err(Into::into)
    }
}

fn map_scan_devices(devices: Vec<DevicePresenceItem>) -> Vec<ScanDeviceItem> {
    devices
        .into_iter()
        .map(|device| ScanDeviceItem {
            device_id: device.device_id,
            device_name: device.device_name,
            device_kind: device.device_kind,
            user_id: device.user_id,
            user_name: device.user_name,
            last_seen_at: device.last_seen_at,
        })
        .collect()
}

fn ensure_admin(actor: &CommunityUser) -> Result<(), ModerationServiceError> {
    if actor.is_moderator() {
        Ok(())
    } else {
        Err(ModerationServiceError::Forbidden)
    }
}

fn to_report_item(report: CommunityReport) -> ReportItem {
    ReportItem {
        id: report.id,
        reporter_id: report.reporter_id,
        target_type: report.target_type.as_str().to_string(),
        target_id: report.target_id,
        reason: report.reason.as_str().to_string(),
        description: report.description,
        status: report.status.as_str().to_string(),
        created_at: report.created_at,
        resolved_at: report.resolved_at,
        resolved_by: report.resolved_by,
    }
}

fn to_log_item(log: ModerationLog) -> ModerationLogItem {
    ModerationLogItem {
        id: log.id,
        moderator_id: log.moderator_id,
        action: log.action,
        target_type: log.target_type,
        target_id: log.target_id,
        reason: log.reason,
        metadata_json: log.metadata_json,
        created_at: log.created_at,
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
    use crate::domain::{CreateResourceInput, ResourceType, ResourceVisibility};
    use crate::repositories::UserRepository;
    use crate::services::mcp_market_service::{
        CreateMcpDraftInput, McpMarketService, PublishMcpPackageInput,
    };

    use super::*;

    fn temp_data_dir() -> PathBuf {
        std::env::temp_dir().join(format!("toolman-moderation-{}", Uuid::new_v4()))
    }

    fn hub_config(data_dir: &PathBuf, require_review: bool) -> Arc<HubConfig> {
        Arc::new(HubConfig {
            require_review,
            ..HubConfig::with_data_dir(data_dir.clone())
        })
    }

    async fn admin_user(pool: &SqlitePool) -> CommunityUser {
        crate::db::seed::admin_user_for_tests(pool)
            .await
            .expect("test admin user")
    }

    async fn regular_user(pool: &SqlitePool) -> CommunityUser {
        UserRepository::new(pool.clone())
            .find_or_create_by_identity_id("moderation-user", Some("Reporter"))
            .await
            .expect("user")
    }

    async fn published_resource(pool: &SqlitePool) -> String {
        let resource = ResourceRepository::new(pool.clone())
            .create(CreateResourceInput {
                title: "Flagged MCP".to_string(),
                description: Some("test".to_string()),
                author_id: DEFAULT_ADMIN_USER_ID.to_string(),
                resource_type: ResourceType::Mcp,
                version: Some("1.0.0".to_string()),
                tags: None,
                category: None,
                license: None,
                visibility: Some(ResourceVisibility::Public),
                status: Some(ResourceStatus::Published),
                cover_path: None,
                package_path: None,
                resource_size: None,
                manifest: serde_json::json!({
                    "schemaVersion": 1,
                    "mcpId": "flagged-mcp",
                    "transport": "stdio",
                    "command": "npx",
                    "tools": [],
                    "templates": [{ "name": "default", "config": {} }]
                }),
            })
            .await
            .expect("create resource");
        resource.id
    }

    #[tokio::test]
    async fn admin_suspend_resource_writes_audit_log() {
        let data_dir = temp_data_dir();
        std::fs::create_dir_all(&data_dir).expect("data dir");
        let db_path = data_dir.join("community.db");
        let pool = init_pool(&db_path).await.expect("init pool");
        let service = ModerationService::new(pool.clone());
        let admin = admin_user(&pool).await;
        let resource_id = published_resource(&pool).await;

        let suspended = service
            .suspend_resource(
                &admin,
                &resource_id,
                SuspendResourceRequest {
                    reason: Some("policy violation".to_string()),
                },
            )
            .await
            .expect("suspend");
        assert_eq!(suspended.status, "suspended");

        let logs = service
            .list_logs(
                &admin,
                &ModerationLogListQuery {
                    limit: 10,
                    offset: 0,
                },
            )
            .await
            .expect("logs");
        assert_eq!(logs.len(), 1);
        assert_eq!(logs[0].action, "suspend_resource");
        assert_eq!(logs[0].target_id, resource_id);

        pool.close().await;
        let _ = std::fs::remove_dir_all(data_dir);
    }

    #[tokio::test]
    async fn user_can_report_and_admin_can_dismiss() {
        let data_dir = temp_data_dir();
        std::fs::create_dir_all(&data_dir).expect("data dir");
        let db_path = data_dir.join("community.db");
        let pool = init_pool(&db_path).await.expect("init pool");
        let service = ModerationService::new(pool.clone());
        let admin = admin_user(&pool).await;
        let user = regular_user(&pool).await;
        let resource_id = published_resource(&pool).await;

        let report = service
            .create_report(
                &user,
                CreateReportRequest {
                    target_type: ReportTargetType::Resource,
                    target_id: resource_id.clone(),
                    reason: ReportReason::Spam,
                    description: Some("spam content".to_string()),
                },
            )
            .await
            .expect("report");
        assert_eq!(report.status, "open");

        let listed = service
            .list_reports(
                &admin,
                &ReportListQuery {
                    status: Some(ReportStatus::Open),
                    limit: 10,
                    offset: 0,
                },
            )
            .await
            .expect("list");
        assert_eq!(listed.len(), 1);

        let resolved = service
            .resolve_report(
                &admin,
                &report.id,
                ResolveReportRequest {
                    action: "dismiss_report".to_string(),
                    note: Some("false positive".to_string()),
                },
            )
            .await
            .expect("resolve");
        assert_eq!(resolved.status, "dismissed");

        pool.close().await;
        let _ = std::fs::remove_dir_all(data_dir);
    }

    #[tokio::test]
    async fn require_review_publish_flow_approves_pending_resource() {
        use serde_json::json;

        use crate::testing::build_test_package;

        let data_dir = temp_data_dir();
        std::fs::create_dir_all(&data_dir).expect("data dir");
        let config = hub_config(&data_dir, true);
        config.bootstrap().expect("bootstrap");
        let db_path = config.db_path.clone();
        let pool = init_pool(&db_path).await.expect("init pool");
        let moderation = ModerationService::new(pool.clone());
        let mcp_service = McpMarketService::new(config, pool.clone());
        let admin = admin_user(&pool).await;

        let draft = mcp_service
            .create_draft(
                &admin,
                CreateMcpDraftInput {
                    title: "Review MCP".to_string(),
                    description: Some("needs review".to_string()),
                    tags: None,
                    category: None,
                    license: None,
                    visibility: None,
                },
            )
            .await
            .expect("draft");

        let manifest = json!({
            "schemaVersion": 1,
            "mcpId": "review-mcp",
            "transport": "stdio",
            "command": "npx",
            "tools": [{ "name": "ping", "description": "Ping" }],
            "templates": [{ "name": "default", "config": {} }]
        })
        .to_string();
        let package_bytes = build_test_package(ResourceType::Mcp, &manifest, &[]);

        mcp_service
            .publish_package(
                &admin,
                PublishMcpPackageInput {
                    resource_id: draft.id.clone(),
                    version: "1.0.0".to_string(),
                    changelog: None,
                    package_bytes,
                    original_filename: Some("review.toolman-mcp".to_string()),
                },
            )
            .await
            .expect("publish");

        let resource = ResourceRepository::new(pool.clone())
            .find_by_id(&draft.id)
            .await
            .expect("find")
            .expect("row");
        assert_eq!(resource.status, ResourceStatus::PendingReview);

        let approved = moderation
            .approve_resource(&admin, &draft.id, Some("looks good".to_string()))
            .await
            .expect("approve");
        assert_eq!(approved.status, "published");

        pool.close().await;
        let _ = std::fs::remove_dir_all(data_dir);
    }

    #[tokio::test]
    async fn admin_can_ban_user_with_duration() {
        let data_dir = temp_data_dir();
        std::fs::create_dir_all(&data_dir).expect("data dir");
        let db_path = data_dir.join("community.db");
        let pool = init_pool(&db_path).await.expect("init pool");
        let service = ModerationService::new(pool.clone());
        let admin = admin_user(&pool).await;
        let user = regular_user(&pool).await;

        service
            .ban_user(
                &admin,
                &user.id,
                BanUserRequest {
                    duration_hours: Some(24),
                    reason: Some("abuse".to_string()),
                },
            )
            .await
            .expect("ban");

        let banned = UserRepository::new(pool.clone())
            .find_by_id(&user.id)
            .await
            .expect("find")
            .expect("user");
        assert!(banned.is_banned);
        assert!(banned.banned_until.is_some());

        pool.close().await;
        let _ = std::fs::remove_dir_all(data_dir);
    }
}
