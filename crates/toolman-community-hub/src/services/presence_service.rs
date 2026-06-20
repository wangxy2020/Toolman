use sqlx::SqlitePool;

use crate::domain::CommunityUser;
use crate::repositories::device_presence_repository::{
    DeviceKind, DevicePresenceRecord, DevicePresenceRepository, UpsertDevicePresenceInput,
};
use crate::repositories::{DeviceBlacklistRepository, UserRepository};

#[derive(Debug, Clone, serde::Serialize)]
pub struct DevicePresenceItem {
    pub device_id: String,
    pub device_name: String,
    pub device_kind: String,
    pub user_id: String,
    pub user_name: String,
    pub last_seen_at: i64,
}

#[derive(Debug, thiserror::Error)]
pub enum PresenceServiceError {
    #[error("device id is required")]
    MissingDeviceId,
    #[error("device name is required")]
    MissingDeviceName,
    #[error("device is banned")]
    DeviceBanned,
    #[error("{0}")]
    InvalidDeviceKind(String),
    #[error("user repository error: {0}")]
    UserRepository(#[from] crate::repositories::UserRepositoryError),
    #[error("device presence repository error: {0}")]
    DevicePresence(#[from] crate::repositories::DevicePresenceRepositoryError),
    #[error("device blacklist repository error: {0}")]
    DeviceBlacklist(#[from] crate::repositories::DeviceBlacklistRepositoryError),
}

pub struct PresenceService {
    pool: SqlitePool,
}

impl PresenceService {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn heartbeat(
        &self,
        actor: &CommunityUser,
        device_id: &str,
        device_name: &str,
        device_kind: &str,
    ) -> Result<DevicePresenceItem, PresenceServiceError> {
        let device_id = device_id.trim();
        let device_name = device_name.trim();
        if device_id.is_empty() {
            return Err(PresenceServiceError::MissingDeviceId);
        }
        if device_name.is_empty() {
            return Err(PresenceServiceError::MissingDeviceName);
        }

        let device_kind = DeviceKind::parse(device_kind)
            .map_err(PresenceServiceError::InvalidDeviceKind)?;

        let now = chrono::Utc::now().timestamp_millis();
        if DeviceBlacklistRepository::new(self.pool.clone())
            .is_active_ban(device_id, now)
            .await?
        {
            return Err(PresenceServiceError::DeviceBanned);
        }

        let record = DevicePresenceRepository::new(self.pool.clone())
            .upsert_heartbeat(UpsertDevicePresenceInput {
                device_id: device_id.to_string(),
                user_id: actor.id.clone(),
                device_name: device_name.to_string(),
                device_kind,
            })
            .await?;

        Ok(to_presence_item(record, actor.display_name.clone()))
    }

    pub async fn list_online_devices(
        &self,
        device_kind: DeviceKind,
        limit: i64,
    ) -> Result<Vec<DevicePresenceItem>, PresenceServiceError> {
        let repo = DevicePresenceRepository::new(self.pool.clone());
        let users = UserRepository::new(self.pool.clone());
        let records = repo.list_online(device_kind, limit).await?;

        let mut items = Vec::with_capacity(records.len());
        for record in records {
            let user_name = users
                .find_by_id(&record.user_id)
                .await?
                .map(|user| user.display_name)
                .unwrap_or_else(|| "Unknown".to_string());
            items.push(to_presence_item(record, user_name));
        }

        Ok(items)
    }

    pub async fn count_online_devices(
        &self,
        device_kind: DeviceKind,
    ) -> Result<i64, PresenceServiceError> {
        Ok(DevicePresenceRepository::new(self.pool.clone())
            .count_online(device_kind)
            .await?)
    }
}

fn to_presence_item(record: DevicePresenceRecord, user_name: String) -> DevicePresenceItem {
    DevicePresenceItem {
        device_id: record.device_id,
        device_name: record.device_name,
        device_kind: record.device_kind,
        user_id: record.user_id,
        user_name,
        last_seen_at: record.last_seen_at,
    }
}
