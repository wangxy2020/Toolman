use serde::{Deserialize, Serialize};
use serde_json::Value;
use thiserror::Error;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum UserRole {
    Guest,
    User,
    Enterprise,
    Admin,
    Founder,
}

impl UserRole {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Guest => "guest",
            Self::User => "user",
            Self::Enterprise => "enterprise",
            Self::Admin => "admin",
            Self::Founder => "founder",
        }
    }

    pub fn parse(value: &str) -> Result<Self, UserError> {
        match value {
            "guest" => Ok(Self::Guest),
            "user" => Ok(Self::User),
            "enterprise" => Ok(Self::Enterprise),
            "admin" => Ok(Self::Admin),
            "founder" => Ok(Self::Founder),
            other => Err(UserError::InvalidRole(other.to_string())),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum UserPermission {
    Publish,
    AcceptTask,
    CreateResource,
}

impl UserPermission {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Publish => "can_publish",
            Self::AcceptTask => "can_accept_task",
            Self::CreateResource => "can_create_resource",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommunityUser {
    pub id: String,
    pub identity_id: String,
    pub display_name: String,
    pub avatar_path: Option<String>,
    pub bio: Option<String>,
    pub role: UserRole,
    pub can_publish: bool,
    pub can_accept_task: bool,
    pub can_create_resource: bool,
    pub is_banned: bool,
    pub banned_until: Option<i64>,
    pub enterprise_name: Option<String>,
    pub stats_json: Value,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Default)]
pub struct UpdateUserProfileInput {
    pub display_name: Option<String>,
    pub bio: Option<String>,
    pub avatar_path: Option<Option<String>>,
}

#[derive(Debug, Error)]
pub enum UserError {
    #[error("invalid role: {0}")]
    InvalidRole(String),
    #[error("user not found: {0}")]
    NotFound(String),
    #[error("display name must not be empty")]
    EmptyDisplayName,
    #[error("user is banned")]
    Banned,
    #[error("permission denied: {0}")]
    PermissionDenied(&'static str),
}

impl CommunityUser {
    pub fn is_active(&self, now_ms: i64) -> bool {
        if !self.is_banned {
            return true;
        }

        match self.banned_until {
            Some(until) => now_ms >= until,
            None => false,
        }
    }

    pub fn ensure_active(&self) -> Result<(), UserError> {
        let now = chrono::Utc::now().timestamp_millis();
        if self.is_active(now) {
            Ok(())
        } else {
            Err(UserError::Banned)
        }
    }

    pub fn has_permission(&self, permission: UserPermission) -> bool {
        if self.is_moderator() {
            return true;
        }

        match permission {
            UserPermission::Publish => self.can_publish,
            UserPermission::AcceptTask => self.can_accept_task,
            UserPermission::CreateResource => self.can_create_resource,
        }
    }

    pub fn ensure_permission(&self, permission: UserPermission) -> Result<(), UserError> {
        self.ensure_active()?;
        if self.has_permission(permission) {
            Ok(())
        } else {
            Err(UserError::PermissionDenied(permission.as_str()))
        }
    }

    pub fn is_founder(&self) -> bool {
        self.role == UserRole::Founder
    }

    pub fn is_moderator(&self) -> bool {
        matches!(self.role, UserRole::Founder | UserRole::Admin)
    }
}

impl UpdateUserProfileInput {
    pub fn validate(&self) -> Result<(), UserError> {
        if let Some(display_name) = &self.display_name {
            if display_name.trim().is_empty() {
                return Err(UserError::EmptyDisplayName);
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_user() -> CommunityUser {
        CommunityUser {
            id: "user-1".to_string(),
            identity_id: "identity-1".to_string(),
            display_name: "Demo".to_string(),
            avatar_path: None,
            bio: None,
            role: UserRole::User,
            can_publish: true,
            can_accept_task: true,
            can_create_resource: true,
            is_banned: false,
            banned_until: None,
            enterprise_name: None,
            stats_json: serde_json::json!({}),
            created_at: 0,
            updated_at: 0,
        }
    }

    #[test]
    fn admin_has_all_permissions() {
        let mut user = sample_user();
        user.role = UserRole::Admin;
        user.can_publish = false;
        assert!(user.has_permission(UserPermission::Publish));
    }

    #[test]
    fn denied_when_flag_disabled() {
        let mut user = sample_user();
        user.can_publish = false;
        let error = user
            .ensure_permission(UserPermission::Publish)
            .expect_err("publish denied");
        assert!(matches!(error, UserError::PermissionDenied("can_publish")));
    }

    #[test]
    fn banned_user_is_not_active() {
        let mut user = sample_user();
        user.is_banned = true;
        assert!(!user.is_active(1_000));
    }
}
