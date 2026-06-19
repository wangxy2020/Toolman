use sqlx::SqlitePool;
use uuid::Uuid;

use crate::domain::{
    CommunityUser, UpdateUserProfileInput, UserError, UserRole,
};

#[derive(Debug, thiserror::Error)]
pub enum UserRepositoryError {
    #[error("user not found: {0}")]
    NotFound(String),
    #[error("user validation failed: {0}")]
    Validation(#[from] UserError),
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
    #[error("serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
}

#[derive(Clone)]
pub struct UserRepository {
    pool: SqlitePool,
}

#[derive(sqlx::FromRow)]
struct UserRecord {
    id: String,
    identity_id: String,
    display_name: String,
    avatar_path: Option<String>,
    bio: Option<String>,
    role: String,
    can_publish: i64,
    can_accept_task: i64,
    can_create_resource: i64,
    is_banned: i64,
    banned_until: Option<i64>,
    enterprise_name: Option<String>,
    stats_json: String,
    created_at: i64,
    updated_at: i64,
}

const USER_SELECT: &str = r#"
SELECT
  id,
  identity_id,
  display_name,
  avatar_path,
  bio,
  role,
  can_publish,
  can_accept_task,
  can_create_resource,
  is_banned,
  banned_until,
  enterprise_name,
  stats_json,
  created_at,
  updated_at
FROM community_users
"#;

impl UserRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn find_by_id(&self, id: &str) -> Result<Option<CommunityUser>, UserRepositoryError> {
        let query = format!("{USER_SELECT} WHERE id = ?1");
        let record = sqlx::query_as::<_, UserRecord>(&query)
            .bind(id)
            .fetch_optional(&self.pool)
            .await?;

        record.map(TryInto::try_into).transpose()
    }

    pub async fn find_by_identity_id(
        &self,
        identity_id: &str,
    ) -> Result<Option<CommunityUser>, UserRepositoryError> {
        let query = format!("{USER_SELECT} WHERE identity_id = ?1");
        let record = sqlx::query_as::<_, UserRecord>(&query)
            .bind(identity_id)
            .fetch_optional(&self.pool)
            .await?;

        record.map(TryInto::try_into).transpose()
    }

    pub async fn find_or_create_by_identity_id(
        &self,
        identity_id: &str,
        display_name: Option<&str>,
    ) -> Result<CommunityUser, UserRepositoryError> {
        if let Some(user) = self.find_by_identity_id(identity_id).await? {
            return Ok(user);
        }

        let id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().timestamp_millis();
        let display_name = display_name
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("Community User");

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
            "#,
        )
        .bind(&id)
        .bind(identity_id)
        .bind(display_name)
        .bind(now)
        .execute(&self.pool)
        .await?;

        self.find_by_id(&id)
            .await?
            .ok_or_else(|| UserRepositoryError::NotFound(id))
    }

    pub async fn update_profile(
        &self,
        id: &str,
        input: UpdateUserProfileInput,
    ) -> Result<CommunityUser, UserRepositoryError> {
        input.validate()?;

        let current = self
            .find_by_id(id)
            .await?
            .ok_or_else(|| UserRepositoryError::NotFound(id.to_string()))?;

        let now = chrono::Utc::now().timestamp_millis();
        let display_name = input
            .display_name
            .unwrap_or(current.display_name)
            .trim()
            .to_string();
        let bio = input.bio.or(current.bio);
        let avatar_path = input.avatar_path.unwrap_or(current.avatar_path);

        let rows = sqlx::query(
            r#"
            UPDATE community_users
            SET display_name = ?1, bio = ?2, avatar_path = ?3, updated_at = ?4
            WHERE id = ?5
            "#,
        )
        .bind(&display_name)
        .bind(&bio)
        .bind(&avatar_path)
        .bind(now)
        .bind(id)
        .execute(&self.pool)
        .await?
        .rows_affected();

        if rows == 0 {
            return Err(UserRepositoryError::NotFound(id.to_string()));
        }

        self.find_by_id(id)
            .await?
            .ok_or_else(|| UserRepositoryError::NotFound(id.to_string()))
    }

    pub async fn set_permission(
        &self,
        id: &str,
        permission: crate::domain::UserPermission,
        enabled: bool,
    ) -> Result<CommunityUser, UserRepositoryError> {
        let column = permission.as_str();
        let query = format!(
            "UPDATE community_users SET {column} = ?1, updated_at = ?2 WHERE id = ?3"
        );
        let now = chrono::Utc::now().timestamp_millis();
        let value = if enabled { 1 } else { 0 };

        let rows = sqlx::query(&query)
            .bind(value)
            .bind(now)
            .bind(id)
            .execute(&self.pool)
            .await?
            .rows_affected();

        if rows == 0 {
            return Err(UserRepositoryError::NotFound(id.to_string()));
        }

        self.find_by_id(id)
            .await?
            .ok_or_else(|| UserRepositoryError::NotFound(id.to_string()))
    }

    pub async fn ban_user(
        &self,
        id: &str,
        banned_until: Option<i64>,
    ) -> Result<CommunityUser, UserRepositoryError> {
        let now = chrono::Utc::now().timestamp_millis();
        let rows = sqlx::query(
            r#"
            UPDATE community_users
            SET is_banned = 1, banned_until = ?1, updated_at = ?2
            WHERE id = ?3
            "#,
        )
        .bind(banned_until)
        .bind(now)
        .bind(id)
        .execute(&self.pool)
        .await?
        .rows_affected();

        if rows == 0 {
            return Err(UserRepositoryError::NotFound(id.to_string()));
        }

        self.find_by_id(id)
            .await?
            .ok_or_else(|| UserRepositoryError::NotFound(id.to_string()))
    }

    pub async fn set_role(
        &self,
        id: &str,
        role: UserRole,
    ) -> Result<CommunityUser, UserRepositoryError> {
        let now = chrono::Utc::now().timestamp_millis();
        let rows = sqlx::query(
            r#"
            UPDATE community_users
            SET role = ?1, updated_at = ?2
            WHERE id = ?3
            "#,
        )
        .bind(role.as_str())
        .bind(now)
        .bind(id)
        .execute(&self.pool)
        .await?
        .rows_affected();

        if rows == 0 {
            return Err(UserRepositoryError::NotFound(id.to_string()));
        }

        self.find_by_id(id)
            .await?
            .ok_or_else(|| UserRepositoryError::NotFound(id.to_string()))
    }

    pub async fn list_moderators(&self, limit: i64) -> Result<Vec<CommunityUser>, UserRepositoryError> {
        let query = format!(
            "{USER_SELECT} WHERE role IN ('founder', 'admin') ORDER BY CASE role WHEN 'founder' THEN 0 ELSE 1 END, created_at ASC LIMIT ?1"
        );
        let records = sqlx::query_as::<_, UserRecord>(&query)
            .bind(limit)
            .fetch_all(&self.pool)
            .await?;

        records.into_iter().map(TryInto::try_into).collect()
    }

    pub async fn search_users(
        &self,
        query: &str,
        limit: i64,
    ) -> Result<Vec<CommunityUser>, UserRepositoryError> {
        let trimmed = query.trim();
        if trimmed.is_empty() {
            return Ok(Vec::new());
        }

        let like = format!("%{trimmed}%");
        let sql = format!(
            "{USER_SELECT} WHERE display_name LIKE ?1 OR id = ?2 OR identity_id = ?2 ORDER BY created_at DESC LIMIT ?3"
        );
        let records = sqlx::query_as::<_, UserRecord>(&sql)
            .bind(&like)
            .bind(trimmed)
            .bind(limit)
            .fetch_all(&self.pool)
            .await?;

        records.into_iter().map(TryInto::try_into).collect()
    }
}

impl TryFrom<UserRecord> for CommunityUser {
    type Error = UserRepositoryError;

    fn try_from(record: UserRecord) -> Result<Self, Self::Error> {
        Ok(Self {
            id: record.id,
            identity_id: record.identity_id,
            display_name: record.display_name,
            avatar_path: record.avatar_path,
            bio: record.bio,
            role: UserRole::parse(&record.role)?,
            can_publish: record.can_publish != 0,
            can_accept_task: record.can_accept_task != 0,
            can_create_resource: record.can_create_resource != 0,
            is_banned: record.is_banned != 0,
            banned_until: record.banned_until,
            enterprise_name: record.enterprise_name,
            stats_json: serde_json::from_str(&record.stats_json)?,
            created_at: record.created_at,
            updated_at: record.updated_at,
        })
    }
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::*;
    use crate::db::{init_pool, seed::DEFAULT_IDENTITY_ID};

    fn temp_db_path() -> PathBuf {
        std::env::temp_dir().join(format!("toolman-user-repo-{}.db", Uuid::new_v4()))
    }

    #[tokio::test]
    async fn creates_user_for_new_identity() {
        let db_path = temp_db_path();
        let pool = init_pool(&db_path).await.expect("init");
        let repo = UserRepository::new(pool.clone());

        let identity = Uuid::new_v4().to_string();
        let user = repo
            .find_or_create_by_identity_id(&identity, Some("Alice"))
            .await
            .expect("create");

        assert_eq!(user.display_name, "Alice");
        assert_eq!(user.role, UserRole::User);

        pool.close().await;
        let _ = std::fs::remove_file(db_path);
    }

    #[tokio::test]
    async fn updates_profile_fields() {
        let db_path = temp_db_path();
        let pool = init_pool(&db_path).await.expect("init");
        let repo = UserRepository::new(pool.clone());

        let user = repo
            .find_by_identity_id(DEFAULT_IDENTITY_ID)
            .await
            .expect("find")
            .expect("seeded admin");

        let updated = repo
            .update_profile(
                &user.id,
                UpdateUserProfileInput {
                    display_name: Some("Admin User".to_string()),
                    bio: Some("Community admin".to_string()),
                    avatar_path: None,
                },
            )
            .await
            .expect("update");

        assert_eq!(updated.display_name, "Admin User");
        assert_eq!(updated.bio.as_deref(), Some("Community admin"));

        pool.close().await;
        let _ = std::fs::remove_file(db_path);
    }
}
