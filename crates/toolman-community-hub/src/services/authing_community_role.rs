use crate::domain::{CommunityUser, UserRole};
use crate::repositories::user_repository::{UserRepository, UserRepositoryError};

pub async fn apply_jwt_community_role(
    repo: &UserRepository,
    user: CommunityUser,
    community_role: Option<&str>,
) -> Result<CommunityUser, UserRepositoryError> {
    let Some(role_str) = community_role else {
        return Ok(user);
    };

    let target_role = match UserRole::parse(role_str) {
        Ok(role) => role,
        Err(_) => return Ok(user),
    };

    if user.role == target_role {
        return Ok(user);
    }

    repo.set_role(&user.id, target_role).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn invalid_role_is_ignored() {
        let user = CommunityUser {
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
        };

        let parsed = UserRole::parse("not-a-role");
        assert!(parsed.is_err());
        assert_eq!(user.role, UserRole::User);
    }
}
