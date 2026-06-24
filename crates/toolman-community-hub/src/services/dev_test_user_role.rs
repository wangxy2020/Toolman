use crate::domain::{CommunityUser, UserRole};
use crate::repositories::user_repository::{UserRepository, UserRepositoryError};

const ENV_DEV_TEST_ROLES: &str = "COMMUNITY_HUB_DEV_TEST_ROLES";

/// Dev/test email → community role. Keep in sync with
/// `DEV_TEST_USER_TYPE_BY_EMAIL` in apps/desktop user-account-utils.ts.
fn dev_role_for_email(email: &str) -> Option<UserRole> {
    match email.trim().to_lowercase().as_str() {
        "wxymale@126.com" => Some(UserRole::Admin),
        "31897124@qq.com" => Some(UserRole::User),
        _ => None,
    }
}

pub fn is_dev_test_roles_enabled() -> bool {
    std::env::var(ENV_DEV_TEST_ROLES)
        .ok()
        .map(|value| {
            matches!(
                value.trim().to_lowercase().as_str(),
                "1" | "true" | "yes" | "on"
            )
        })
        .unwrap_or(false)
}

pub async fn apply_dev_test_user_role(
    repo: &UserRepository,
    user: CommunityUser,
    email: Option<&str>,
) -> Result<CommunityUser, UserRepositoryError> {
    if !is_dev_test_roles_enabled() {
        return Ok(user);
    }

    let Some(email) = email else {
        return Ok(user);
    };
    let Some(target_role) = dev_role_for_email(email) else {
        return Ok(user);
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
    fn dev_roles_disabled_by_default() {
        std::env::remove_var(ENV_DEV_TEST_ROLES);
        assert!(!is_dev_test_roles_enabled());
    }

    #[test]
    fn dev_roles_enabled_with_env_flag() {
        std::env::set_var(ENV_DEV_TEST_ROLES, "true");
        assert!(is_dev_test_roles_enabled());
        std::env::remove_var(ENV_DEV_TEST_ROLES);
    }
}
