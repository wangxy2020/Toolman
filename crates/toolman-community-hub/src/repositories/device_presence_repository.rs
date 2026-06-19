use sqlx::SqlitePool;

pub const DEVICE_ONLINE_TTL_MS: i64 = 90_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DeviceKind {
    Desktop,
    Mobile,
}

impl DeviceKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Desktop => "desktop",
            Self::Mobile => "mobile",
        }
    }

    pub fn parse(value: &str) -> Result<Self, String> {
        match value.trim().to_lowercase().as_str() {
            "desktop" => Ok(Self::Desktop),
            "mobile" => Ok(Self::Mobile),
            other => Err(format!("invalid device kind: {other}")),
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub enum DevicePresenceRepositoryError {
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
}

#[derive(Debug, Clone)]
pub struct UpsertDevicePresenceInput {
    pub device_id: String,
    pub user_id: String,
    pub device_name: String,
    pub device_kind: DeviceKind,
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct DevicePresenceRecord {
    pub device_id: String,
    pub user_id: String,
    pub device_name: String,
    pub device_kind: String,
    pub last_seen_at: i64,
    pub created_at: i64,
}

#[derive(Clone)]
pub struct DevicePresenceRepository {
    pool: SqlitePool,
}

impl DevicePresenceRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn upsert_heartbeat(
        &self,
        input: UpsertDevicePresenceInput,
    ) -> Result<DevicePresenceRecord, DevicePresenceRepositoryError> {
        let now = chrono::Utc::now().timestamp_millis();
        let device_kind = input.device_kind.as_str();

        sqlx::query(
            r#"
            INSERT INTO community_device_presence (
              device_id,
              user_id,
              device_name,
              device_kind,
              last_seen_at,
              created_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?5)
            ON CONFLICT(device_id) DO UPDATE SET
              user_id = excluded.user_id,
              device_name = excluded.device_name,
              device_kind = excluded.device_kind,
              last_seen_at = excluded.last_seen_at
            "#,
        )
        .bind(&input.device_id)
        .bind(&input.user_id)
        .bind(&input.device_name)
        .bind(device_kind)
        .bind(now)
        .execute(&self.pool)
        .await?;

        self.find_by_device_id(&input.device_id)
            .await?
            .ok_or_else(|| {
                DevicePresenceRepositoryError::Database(sqlx::Error::RowNotFound)
            })
    }

    pub async fn find_by_device_id(
        &self,
        device_id: &str,
    ) -> Result<Option<DevicePresenceRecord>, DevicePresenceRepositoryError> {
        let record = sqlx::query_as::<_, DevicePresenceRecord>(
            r#"
            SELECT device_id, user_id, device_name, device_kind, last_seen_at, created_at
            FROM community_device_presence
            WHERE device_id = ?1
            "#,
        )
        .bind(device_id)
        .fetch_optional(&self.pool)
        .await?;

        Ok(record)
    }

    pub async fn list_online(
        &self,
        device_kind: DeviceKind,
        limit: i64,
    ) -> Result<Vec<DevicePresenceRecord>, DevicePresenceRepositoryError> {
        let cutoff = chrono::Utc::now().timestamp_millis() - DEVICE_ONLINE_TTL_MS;

        let records = sqlx::query_as::<_, DevicePresenceRecord>(
            r#"
            SELECT device_id, user_id, device_name, device_kind, last_seen_at, created_at
            FROM community_device_presence
            WHERE last_seen_at >= ?1
              AND device_kind = ?2
            ORDER BY last_seen_at DESC
            LIMIT ?3
            "#,
        )
        .bind(cutoff)
        .bind(device_kind.as_str())
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;

        Ok(records)
    }

    pub async fn count_online(
        &self,
        device_kind: DeviceKind,
    ) -> Result<i64, DevicePresenceRepositoryError> {
        let cutoff = chrono::Utc::now().timestamp_millis() - DEVICE_ONLINE_TTL_MS;

        let count: (i64,) = sqlx::query_as(
            r#"
            SELECT COUNT(*)
            FROM community_device_presence
            WHERE last_seen_at >= ?1
              AND device_kind = ?2
            "#,
        )
        .bind(cutoff)
        .bind(device_kind.as_str())
        .fetch_one(&self.pool)
        .await?;

        Ok(count.0)
    }
}
