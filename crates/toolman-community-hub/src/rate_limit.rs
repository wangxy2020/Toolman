use std::collections::{HashMap, VecDeque};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use axum::extract::State;
use axum::http::{HeaderMap, Request};
use axum::middleware::Next;
use axum::response::Response;

use crate::api::ApiError;
use crate::api::HEADER_COMMUNITY_USER_ID;
use crate::api::hub_token_subject_from_headers;
use crate::state::AppState;

const MAX_TRACKED_CLIENTS: usize = 10_000;

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

#[derive(Debug)]
pub struct HubRateLimiterRegistry {
    max_per_minute: u64,
    buckets: Mutex<HashMap<String, HubRateLimiter>>,
}

impl HubRateLimiterRegistry {
    pub fn new(max_per_minute: u64) -> Self {
        Self {
            max_per_minute,
            buckets: Mutex::new(HashMap::new()),
        }
    }

    pub fn try_acquire(&self, client_key: &str) -> bool {
        if self.max_per_minute == 0 {
            return true;
        }

        let mut buckets = self
            .buckets
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());

        if buckets.len() > MAX_TRACKED_CLIENTS {
            let evict_count = MAX_TRACKED_CLIENTS / 10;
            let keys: Vec<String> = buckets.keys().take(evict_count).cloned().collect();
            for key in keys {
                buckets.remove(&key);
            }
        }

        buckets
            .entry(client_key.to_string())
            .or_insert_with(|| HubRateLimiter::new(self.max_per_minute))
            .try_acquire()
    }
}

pub fn client_rate_limit_key(headers: &HeaderMap) -> String {
    if let Some(identity) = headers.get(HEADER_COMMUNITY_USER_ID) {
        if let Ok(value) = identity.to_str() {
            let id = value.trim();
            if !id.is_empty() {
                return format!("identity:{id}");
            }
        }
    }

    if let Some(subject) = hub_token_subject_from_headers(headers) {
        return format!("identity:{subject}");
    }

    if let Some(forwarded) = headers.get("x-forwarded-for") {
        if let Ok(value) = forwarded.to_str() {
            if let Some(first) = value.split(',').next() {
                let ip = first.trim();
                if !ip.is_empty() {
                    return format!("ip:{ip}");
                }
            }
        }
    }

    if let Some(real_ip) = headers.get("x-real-ip") {
        if let Ok(value) = real_ip.to_str() {
            let ip = value.trim();
            if !ip.is_empty() {
                return format!("ip:{ip}");
            }
        }
    }

    "anonymous".to_string()
}

pub async fn rate_limit_middleware(
    State(state): State<AppState>,
    request: Request<axum::body::Body>,
    next: Next,
) -> Result<Response, ApiError> {
    if state.config.rate_limit_rpm == 0 {
        return Ok(next.run(request).await);
    }

    let client_key = client_rate_limit_key(request.headers());
    if state.rate_limiter.try_acquire(&client_key) {
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

    #[test]
    fn registry_tracks_clients_independently() {
        let registry = HubRateLimiterRegistry::new(2);
        assert!(registry.try_acquire("client-a"));
        assert!(registry.try_acquire("client-a"));
        assert!(!registry.try_acquire("client-a"));
        assert!(registry.try_acquire("client-b"));
    }

    #[test]
    fn prefers_identity_header_for_client_key() {
        let mut headers = HeaderMap::new();
        headers.insert(
            HEADER_COMMUNITY_USER_ID,
            "00000000-0000-0000-0000-000000000001".parse().unwrap(),
        );
        headers.insert("x-forwarded-for", "203.0.113.1".parse().unwrap());
        assert_eq!(
            client_rate_limit_key(&headers),
            "identity:00000000-0000-0000-0000-000000000001"
        );
    }

    #[test]
    fn prefers_bearer_jwt_subject_when_identity_header_missing() {
        use jsonwebtoken::{encode, EncodingKey, Header};

        #[derive(serde::Serialize)]
        struct Claims {
            sub: String,
            iss: String,
            aud: String,
            exp: i64,
            iat: i64,
            registration_status: String,
        }

        let claims = Claims {
            sub: "jwt-identity-42".to_string(),
            iss: "toolman-desktop".to_string(),
            aud: "toolman-community-hub".to_string(),
            exp: chrono::Utc::now().timestamp() + 3600,
            iat: chrono::Utc::now().timestamp(),
            registration_status: "registered".to_string(),
        };
        let token = encode(
            &Header::new(jsonwebtoken::Algorithm::HS256),
            &claims,
            &EncodingKey::from_secret(b"test-secret"),
        )
        .expect("sign token");

        let mut headers = HeaderMap::new();
        headers.insert(
            "authorization",
            format!("Bearer {token}").parse().expect("auth header"),
        );
        assert_eq!(
            client_rate_limit_key(&headers),
            "identity:jwt-identity-42"
        );
    }
}
