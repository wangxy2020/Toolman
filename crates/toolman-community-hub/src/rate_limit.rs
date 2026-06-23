use std::collections::VecDeque;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use axum::extract::State;
use axum::http::Request;
use axum::middleware::Next;
use axum::response::Response;

use crate::api::ApiError;
use crate::state::AppState;

#[derive(Debug)]
pub struct HubRateLimiter {
    max_per_minute: u64,
    timestamps: Mutex<VecDeque<Instant>>,
}

impl HubRateLimiter {
    pub fn new(max_per_minute: u64) -> Self {
        Self {
            max_per_minute,
            timestamps: Mutex::new(VecDeque::new()),
        }
    }

    pub fn try_acquire(&self) -> bool {
        if self.max_per_minute == 0 {
            return true;
        }

        let mut queue = self
            .timestamps
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        let now = Instant::now();
        let cutoff = now - Duration::from_secs(60);

        while queue.front().is_some_and(|timestamp| *timestamp < cutoff) {
            queue.pop_front();
        }

        if queue.len() as u64 >= self.max_per_minute {
            return false;
        }

        queue.push_back(now);
        true
    }
}

pub async fn rate_limit_middleware(
    State(state): State<AppState>,
    request: Request<axum::body::Body>,
    next: Next,
) -> Result<Response, ApiError> {
    if state.config.rate_limit_rpm == 0 || state.rate_limiter.try_acquire() {
        return Ok(next.run(request).await);
    }

    Err(ApiError::too_many_requests(
        "Community Hub rate limit exceeded; retry after a short delay",
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn allows_requests_under_limit() {
        let limiter = HubRateLimiter::new(3);
        assert!(limiter.try_acquire());
        assert!(limiter.try_acquire());
        assert!(limiter.try_acquire());
        assert!(!limiter.try_acquire());
    }

    #[test]
    fn zero_limit_disables_throttling() {
        let limiter = HubRateLimiter::new(0);
        for _ in 0..10 {
            assert!(limiter.try_acquire());
        }
    }
}
