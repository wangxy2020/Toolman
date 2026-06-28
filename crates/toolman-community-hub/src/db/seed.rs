use sqlx::SqlitePool;

pub const DEFAULT_IDENTITY_ID: &str = "00000000-0000-0000-0000-000000000001";
pub const DEFAULT_ADMIN_USER_ID: &str = "00000000-0000-0000-0000-000000000100";

const ENV_DEFAULT_IDENTITY_ID: &str = "COMMUNITY_HUB_DEFAULT_IDENTITY_ID";

#[derive(Debug, thiserror::Error)]
pub enum SeedError {
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
    #[error("rss source seed error: {0}")]
    RssSource(#[from] crate::repositories::RssSourceRepositoryError),
}

pub fn resolve_default_identity_id() -> String {
    std::env::var(ENV_DEFAULT_IDENTITY_ID)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| DEFAULT_IDENTITY_ID.to_string())
}

pub async fn seed_default_admin_user(pool: &SqlitePool) -> Result<(), SeedError> {
    let identity_id = resolve_default_identity_id();

    // Bootstrap a community_users row for the default identity only. Role stays `user`
    // until Authing-synced JWT community_role promotes admin/founder.
    if identity_id != DEFAULT_IDENTITY_ID {
        return Ok(());
    }

    let now = chrono::Utc::now().timestamp_millis();

    sqlx::query(
        r#"
        INSERT INTO community_users (
          id,
          identity_id,
          display_name,
          role,
          can_publish,
          can_accept_task,
          can_create_resource,
          is_banned,
          stats_json,
          created_at,
          updated_at
        ) VALUES (?1, ?2, ?3, 'user', 1, 1, 1, 0, '{}', ?4, ?4)
        ON CONFLICT(identity_id) DO NOTHING
        "#,
    )
    .bind(DEFAULT_ADMIN_USER_ID)
    .bind(&identity_id)
    .bind("本地用户")
    .bind(now)
    .execute(pool)
    .await?;

    Ok(())
}

/// Promote the seeded default identity to founder for unit/integration tests.
/// Production admin comes from Authing JWT `community_role`, not this helper.
pub async fn admin_user_for_tests(
    pool: &SqlitePool,
) -> Result<crate::domain::CommunityUser, crate::repositories::UserRepositoryError> {
    use crate::domain::UserRole;
    use crate::repositories::UserRepository;

    let repo = UserRepository::new(pool.clone());
    let user = repo
        .find_by_id(DEFAULT_ADMIN_USER_ID)
        .await?
        .ok_or_else(|| {
            crate::repositories::UserRepositoryError::NotFound(DEFAULT_ADMIN_USER_ID.to_string())
        })?;
    if matches!(user.role, UserRole::Admin | UserRole::Founder) {
        return Ok(user);
    }
    repo.set_role(&user.id, UserRole::Founder).await
}

pub async fn seed_default_rss_sources(pool: &SqlitePool) -> Result<(), SeedError> {
    use crate::config::{default_rss_sources, DEPRECATED_RSS_SOURCE_IDS};
    use crate::repositories::RssSourceRepository;

    let repo = RssSourceRepository::new(pool.clone());
    for source in default_rss_sources() {
        repo.upsert_seed(&source).await?;
    }

    for source_id in DEPRECATED_RSS_SOURCE_IDS {
        sqlx::query("DELETE FROM community_news_articles WHERE source_id = ?1")
            .bind(source_id)
            .execute(pool)
            .await?;
        let _ = repo.delete(source_id).await?;
    }

    Ok(())
}
