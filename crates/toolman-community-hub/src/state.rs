use std::sync::Arc;

use sqlx::SqlitePool;

use crate::rate_limit::HubRateLimiter;
use crate::config::HubConfig;

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<HubConfig>,
    pub db: SqlitePool,
    pub rate_limiter: Arc<HubRateLimiter>,
}

impl AppState {
    pub fn new(config: HubConfig, db: SqlitePool) -> Self {
        let rate_limiter = Arc::new(HubRateLimiter::new(config.rate_limit_rpm));
        Self {
            config: Arc::new(config),
            db,
            rate_limiter,
        }
    }
}
