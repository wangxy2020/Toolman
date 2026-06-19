use serde::Serialize;
use sqlx::SqlitePool;

use crate::domain::{CommunityUser, UserRole};
use crate::repositories::UserRepository;

#[derive(Debug, Clone, Serialize)]
pub struct ModeratorUserItem {
    pub id: String,
    pub identity_id: String,
    pub display_name: String,
    pub role: String,
    pub created_at: i64,
}

#[derive(Debug, thiserror::Error)]
pub enum AdminManagementError {
    #[error("forbidden")]
    Forbidden,
    #[error("user not found: {0}")]
    NotFound(String),
    #[error("validation error: {0}")]
    Validation(String),
    #[error("user repository error: {0}")]
    UserRepository(#[from] crate::repositories::UserRepositoryError),
}

pub struct AdminManagementService {
    pool: SqlitePool,
}

impl AdminManagementService {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn list_moderators(
        &self,
        actor: &CommunityUser,
    ) -> Result<Vec<ModeratorUserItem>, AdminManagementError> {
        ensure_moderator(actor)?;

        let users = UserRepository::new(self.pool.clone())
            .list_moderators(50)
            .await?;

        Ok(users.into_iter().map(to_moderator_item).collect())
    }

    pub async fn search_users(
        &self,
        actor: &CommunityUser,
        query: &str,
        limit: i64,
    ) -> Result<Vec<ModeratorUserItem>, AdminManagementError> {
        ensure_founder(actor)?;

        let users = UserRepository::new(self.pool.clone())
            .search_users(query, limit.clamp(1, 50))
            .await?;

        Ok(users.into_iter().map(to_moderator_item).collect())
    }

    pub async fn appoint_admin(
        &self,
        actor: &CommunityUser,
        user_id: &str,
    ) -> Result<ModeratorUserItem, AdminManagementError> {
        ensure_founder(actor)?;

        let target = self.require_user(user_id).await?;
        if target.role == UserRole::Founder {
            return Err(AdminManagementError::Validation(
                "cannot change founder role".to_string(),
            ));
        }
        if target.role == UserRole::Admin {
            return Ok(to_moderator_item(target));
        }
        if !matches!(target.role, UserRole::User | UserRole::Enterprise) {
            return Err(AdminManagementError::Validation(
                "only regular users can be appointed as admin".to_string(),
            ));
        }

        let updated = UserRepository::new(self.pool.clone())
            .set_role(user_id, UserRole::Admin)
            .await?;

        Ok(to_moderator_item(updated))
    }

    pub async fn revoke_admin(
        &self,
        actor: &CommunityUser,
        user_id: &str,
    ) -> Result<ModeratorUserItem, AdminManagementError> {
        ensure_founder(actor)?;

        if actor.id == user_id {
            return Err(AdminManagementError::Validation(
                "founder cannot revoke own role".to_string(),
            ));
        }

        let target = self.require_user(user_id).await?;
        if target.role == UserRole::Founder {
            return Err(AdminManagementError::Validation(
                "cannot revoke founder role".to_string(),
            ));
        }
        if target.role != UserRole::Admin {
            return Err(AdminManagementError::Validation(
                "target user is not an admin".to_string(),
            ));
        }

        let updated = UserRepository::new(self.pool.clone())
            .set_role(user_id, UserRole::User)
            .await?;

        Ok(to_moderator_item(updated))
    }

    async fn require_user(&self, user_id: &str) -> Result<CommunityUser, AdminManagementError> {
        UserRepository::new(self.pool.clone())
            .find_by_id(user_id)
            .await?
            .ok_or_else(|| AdminManagementError::NotFound(user_id.to_string()))
    }
}

fn ensure_founder(actor: &CommunityUser) -> Result<(), AdminManagementError> {
    if actor.is_founder() {
        Ok(())
    } else {
        Err(AdminManagementError::Forbidden)
    }
}

fn ensure_moderator(actor: &CommunityUser) -> Result<(), AdminManagementError> {
    if actor.is_moderator() {
        Ok(())
    } else {
        Err(AdminManagementError::Forbidden)
    }
}

fn to_moderator_item(user: CommunityUser) -> ModeratorUserItem {
    ModeratorUserItem {
        id: user.id,
        identity_id: user.identity_id,
        display_name: user.display_name,
        role: user.role.as_str().to_string(),
        created_at: user.created_at,
    }
}
