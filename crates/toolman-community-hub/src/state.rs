use std::sync::Arc;

use sqlx::SqlitePool;

use crate::config::HubConfig;

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<HubConfig>,
    pub db: SqlitePool,
}

impl AppState {
    pub fn new(config: HubConfig, db: SqlitePool) -> Self {
        Self {
            config: Arc::new(config),
            db,
        }
    }
}
