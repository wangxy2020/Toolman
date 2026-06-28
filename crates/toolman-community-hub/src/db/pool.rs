use std::path::Path;
use std::time::Duration;

use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous};
use sqlx::SqlitePool;
use tracing::info;

use crate::db::seed;

#[derive(Debug, thiserror::Error)]
pub enum DbError {
    #[error("database connection failed: {0}")]
    Connect(#[from] sqlx::Error),
    #[error("database migration failed: {0}")]
    Migrate(#[from] sqlx::migrate::MigrateError),
    #[error("database seed failed: {0}")]
    Seed(#[from] seed::SeedError),
}

pub async fn init_pool(db_path: &Path) -> Result<SqlitePool, DbError> {
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent).map_err(|error| {
            sqlx::Error::Configuration(format!("failed to create db parent dir: {error}").into())
        })?;
    }

    let connect_options = SqliteConnectOptions::new()
        .filename(db_path)
        .create_if_missing(true)
        .foreign_keys(true)
        .journal_mode(SqliteJournalMode::Wal)
        .synchronous(SqliteSynchronous::Normal)
        .busy_timeout(Duration::from_secs(5));

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(connect_options)
        .await?;

    run_migrations(&pool).await?;
    seed::seed_default_admin_user(&pool).await?;
    seed::seed_default_rss_sources(&pool).await?;

    info!(path = %db_path.display(), "community database ready");
    Ok(pool)
}

pub async fn run_migrations(pool: &SqlitePool) -> Result<(), DbError> {
    sqlx::migrate!("./src/db/migrations").run(pool).await?;
    Ok(())
}

pub async fn fts_match_count(pool: &SqlitePool, query: &str) -> Result<i64, sqlx::Error> {
    let row: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM community_resources_fts WHERE community_resources_fts MATCH ?1",
    )
    .bind(query)
    .fetch_one(pool)
    .await?;

    Ok(row.0)
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::*;
    use crate::db::seed::{DEFAULT_ADMIN_USER_ID, DEFAULT_IDENTITY_ID};
    use uuid::Uuid;

    fn temp_db_path() -> PathBuf {
        std::env::temp_dir().join(format!(
            "toolman-community-db-{}.db",
            Uuid::new_v4()
        ))
    }

    #[tokio::test]
    async fn migrations_are_idempotent_via_sqlx_tracker() {
        let db_path = temp_db_path();
        let pool = init_pool(&db_path).await.expect("first init");
        run_migrations(&pool).await.expect("second migrate noop");
        pool.close().await;

        let _ = std::fs::remove_file(&db_path);
    }

    #[tokio::test]
    async fn seeds_default_admin_user_once() {
        let db_path = temp_db_path();
        let pool = init_pool(&db_path).await.expect("init");

        let count: (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM community_users WHERE identity_id = ?1")
                .bind(DEFAULT_IDENTITY_ID)
                .fetch_one(&pool)
                .await
                .expect("count");

        assert_eq!(count.0, 1);

        seed::seed_default_admin_user(&pool)
            .await
            .expect("reseed should noop");

        let admin: (String, String) = sqlx::query_as(
            "SELECT id, role FROM community_users WHERE id = ?1",
        )
        .bind(DEFAULT_ADMIN_USER_ID)
        .fetch_one(&pool)
        .await
        .expect("admin row");

        assert_eq!(admin.0, DEFAULT_ADMIN_USER_ID);
        assert_eq!(admin.1, "user");

        pool.close().await;
        let _ = std::fs::remove_file(db_path);
    }

    #[tokio::test]
    async fn skips_founder_seed_for_non_default_identity() {
        let db_path = temp_db_path();
        let pool = SqlitePoolOptions::new()
            .max_connections(1)
            .connect_with(
                SqliteConnectOptions::new()
                    .filename(&db_path)
                    .create_if_missing(true)
                    .foreign_keys(true),
            )
            .await
            .expect("connect");

        run_migrations(&pool).await.expect("migrate");

        std::env::set_var(
            "COMMUNITY_HUB_DEFAULT_IDENTITY_ID",
            "00000000-0000-4000-8000-00000000000b",
        );
        seed::seed_default_admin_user(&pool)
            .await
            .expect("seed should noop for non-founder identity");
        std::env::remove_var("COMMUNITY_HUB_DEFAULT_IDENTITY_ID");

        let count: (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM community_users WHERE id = ?1")
                .bind(DEFAULT_ADMIN_USER_ID)
                .fetch_one(&pool)
                .await
                .expect("count");
        assert_eq!(count.0, 0);

        pool.close().await;
        let _ = std::fs::remove_file(db_path);
    }

    #[tokio::test]
    async fn fts_triggers_index_resources() {
        let db_path = temp_db_path();
        let pool = init_pool(&db_path).await.expect("init");

        let now = chrono::Utc::now().timestamp_millis();
        let resource_id = Uuid::new_v4().to_string();

        sqlx::query(
            r#"
            INSERT INTO community_resources (
              id, title, description, author_id, tags, resource_type, status,
              created_at, updated_at, published_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
            "#,
        )
        .bind(&resource_id)
        .bind("LangGraph Workflow Pack")
        .bind("Automation templates for agents")
        .bind(DEFAULT_ADMIN_USER_ID)
        .bind(r#"["workflow","langgraph"]"#)
        .bind("workflow")
        .bind("published")
        .bind(now)
        .bind(now)
        .bind(now)
        .execute(&pool)
        .await
        .expect("insert resource");

        let hits = fts_match_count(&pool, "LangGraph")
            .await
            .expect("fts search");
        assert_eq!(hits, 1);

        pool.close().await;
        let _ = std::fs::remove_file(db_path);
    }
}
