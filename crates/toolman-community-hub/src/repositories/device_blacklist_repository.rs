use sqlx::SqlitePool;

#[derive(Debug, thiserror::Error)]
pub enum DeviceBlacklistRepositoryError {
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct DeviceBlacklistRecord {
    pub device_id: String,
    pub user_id: String,
    pub device_name: String,
    pub reason: Option<String>,
    pub banned_by: String,
    pub banned_at: i64,
    pub banned_until: Option<i64>,
}

#[derive(Debug, Clone)]
pub struct BanDeviceInput {
    pub device_id: String,
    pub user_id: String,
    pub device_name: String,
    pub reason: Option<String>,
    pub banned_by: String,
    pub banned_until: Option<i64>,
}

#[derive(Clone)]
pub struct DeviceBlacklistRepository {
    pool: SqlitePool,
}

impl DeviceBlacklistRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn ban_device(
        &self,
        input: BanDeviceInput,
    ) -> Result<DeviceBlacklistRecord, DeviceBlacklistRepositoryError> {
        let now = chrono::Utc::now().timestamp_millis();

        sqlx::query(
            r#"
            INSERT INTO community_device_blacklist (
              device_id,
              user_id,
              device_name,
              reason,
              banned_by,
              banned_at,
              banned_until
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
            ON CONFLICT(device_id) DO UPDATE SET
              user_id = excluded.user_id,
              device_name = excluded.device_name,
              reason = excluded.reason,
              banned_by = excluded.banned_by,
              banned_at = excluded.banned_at,
              banned_until = excluded.banned_until
            "#,
        )
        .bind(&input.device_id)
        .bind(&input.user_id)
        .bind(&input.device_name)
        .bind(&input.reason)
        .bind(&input.banned_by)
        .bind(now)
        .bind(input.banned_until)
        .execute(&self.pool)
        .await?;

        self.find_by_device_id(&input.device_id)
            .await?
            .ok_or_else(|| DeviceBlacklistRepositoryError::Database(sqlx::Error::RowNotFound))
    }

    pub async fn find_by_device_id(
        &self,
        device_id: &str,
    ) -> Result<Option<DeviceBlacklistRecord>, DeviceBlacklistRepositoryError> {
        let record = sqlx::query_as::<_, DeviceBlacklistRecord>(
            r#"
            SELECT device_id, user_id, device_name, reason, banned_by, banned_at, banned_until
            FROM community_device_blacklist
            WHERE device_id = ?1
            "#,
        )
        .bind(device_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(record)
    }

    pub async fn is_active_ban(
        &self,
        device_id: &str,
        now_ms: i64,
    ) -> Result<bool, DeviceBlacklistRepositoryError> {
        let Some(record) = self.find_by_device_id(device_id).await? else {
            return Ok(false);
        };

        Ok(record
            .banned_until
            .map(|until| until > now_ms)
            .unwrap_or(true))
    }

    pub async fn list_active(
        &self,
        limit: i64,
    ) -> Result<Vec<DeviceBlacklistRecord>, DeviceBlacklistRepositoryError> {
        let now = chrono::Utc::now().timestamp_millis();
        let records = sqlx::query_as::<_, DeviceBlacklistRecord>(
            r#"
            SELECT device_id, user_id, device_name, reason, banned_by, banned_at, banned_until
            FROM community_device_blacklist
            WHERE banned_until IS NULL OR banned_until > ?1
            ORDER BY banned_at DESC
            LIMIT ?2
            "#,
        )
        .bind(now)
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;

        Ok(records)
    }

    pub async fn unban_device(
        &self,
        device_id: &str,
    ) -> Result<(), DeviceBlacklistRepositoryError> {
        let rows = sqlx::query(
            r#"
            DELETE FROM community_device_blacklist
            WHERE device_id = ?1
            "#,
        )
        .bind(device_id)
        .execute(&self.pool)
        .await?
        .rows_affected();

        if rows == 0 {
            return Err(DeviceBlacklistRepositoryError::Database(sqlx::Error::RowNotFound));
        }

        Ok(())
    }
}
