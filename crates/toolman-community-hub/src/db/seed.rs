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
        ) VALUES (?1, ?2, ?3, ?4, 1, 1, 1, 0, '{}', ?5, ?5)
        ON CONFLICT(identity_id) DO NOTHING
        "#,
    )
    .bind(DEFAULT_ADMIN_USER_ID)
    .bind(&identity_id)
    .bind("本地用户")
    .bind("founder")
    .bind(now)
    .execute(pool)
    .await?;

    sqlx::query(
        r#"
        UPDATE community_users
        SET role = 'founder'
        WHERE id = ?1
        "#,
    )
    .bind(DEFAULT_ADMIN_USER_ID)
    .execute(pool)
    .await?;

    Ok(())
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
