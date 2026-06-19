use std::path::PathBuf;

use axum::body::{to_bytes, Body};
use axum::http::{Request, StatusCode};
use axum::Router;
use serde_json::Value;
use sqlx::SqlitePool;
use tower::ServiceExt;
use uuid::Uuid;

use toolman_community_hub::api::{router, HEADER_COMMUNITY_USER_ID};
use toolman_community_hub::config::HubConfig;
use toolman_community_hub::db::init_pool;
use toolman_community_hub::state::AppState;

pub struct TestHarness {
    pub app: Router,
    pub pool: SqlitePool,
    pub data_dir: PathBuf,
}

impl TestHarness {
    pub async fn setup() -> Self {
        let data_dir = temp_data_dir();
        std::fs::create_dir_all(&data_dir).expect("data dir");
        let db_path = data_dir.join("community.db");
        let pool = init_pool(&db_path).await.expect("init pool");
        let config = HubConfig {
            data_dir: data_dir.clone(),
            port: 3721,
            host: "127.0.0.1",
            require_review: false,
            packages_dir: data_dir.join("packages"),
            covers_dir: data_dir.join("covers"),
            deliveries_dir: data_dir.join("deliveries"),
            db_path,
            rss_sources_path: data_dir.join("rss-sources.json"),
        };
        config.bootstrap().expect("bootstrap");
        let state = AppState::new(config, pool.clone());
        let app = router(state);
        Self {
            app,
            pool,
            data_dir,
        }
    }

    pub async fn teardown(self) {
        self.pool.close().await;
        let _ = std::fs::remove_dir_all(self.data_dir);
    }

    pub async fn request(
        &self,
        method: &str,
        uri: &str,
        identity: Option<&str>,
        body: Body,
        content_type: Option<&str>,
    ) -> (StatusCode, Value) {
        let mut builder = Request::builder().method(method).uri(uri);
        if let Some(identity) = identity {
            builder = builder.header(HEADER_COMMUNITY_USER_ID, identity);
        }
        if let Some(content_type) = content_type {
            builder = builder.header("content-type", content_type);
        }

        let response = self
            .app
            .clone()
            .oneshot(builder.body(body).expect("request body"))
            .await
            .expect("response");

        let status = response.status();
        let bytes = to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("body bytes");
        let json = if bytes.is_empty() {
            Value::Null
        } else {
            serde_json::from_slice(&bytes).unwrap_or_else(|_| {
                panic!(
                    "invalid json (status {status}): {}",
                    String::from_utf8_lossy(&bytes)
                )
            })
        };
        (status, json)
    }

    pub async fn get_json(&self, uri: &str, identity: &str) -> (StatusCode, Value) {
        self.request("GET", uri, Some(identity), Body::empty(), None)
            .await
    }

    pub async fn post_json(
        &self,
        uri: &str,
        identity: &str,
        body: Value,
    ) -> (StatusCode, Value) {
        let bytes = serde_json::to_vec(&body).expect("serialize");
        self.request(
            "POST",
            uri,
            Some(identity),
            Body::from(bytes),
            Some("application/json"),
        )
        .await
    }

    pub async fn post_multipart(
        &self,
        uri: &str,
        identity: &str,
        body: Vec<u8>,
        boundary: &str,
    ) -> (StatusCode, Value) {
        let content_type = format!("multipart/form-data; boundary={boundary}");
        self.request(
            "POST",
            uri,
            Some(identity),
            Body::from(body),
            Some(&content_type),
        )
        .await
    }
}

pub fn temp_data_dir() -> PathBuf {
    std::env::temp_dir().join(format!("toolman-hub-it-{}", Uuid::new_v4()))
}

pub fn multipart_body(
    boundary: &str,
    fields: &[(&str, &str)],
    files: &[(&str, &str, &[u8])],
) -> Vec<u8> {
    let mut body = Vec::new();
    for (name, value) in fields {
        body.extend_from_slice(format!("--{boundary}\r\n").as_bytes());
        body.extend_from_slice(
            format!("Content-Disposition: form-data; name=\"{name}\"\r\n\r\n").as_bytes(),
        );
        body.extend_from_slice(value.as_bytes());
        body.extend_from_slice(b"\r\n");
    }
    for (name, filename, content) in files {
        body.extend_from_slice(format!("--{boundary}\r\n").as_bytes());
        body.extend_from_slice(
            format!(
                "Content-Disposition: form-data; name=\"{name}\"; filename=\"{filename}\"\r\n"
            )
            .as_bytes(),
        );
        body.extend_from_slice(b"Content-Type: application/octet-stream\r\n\r\n");
        body.extend_from_slice(content);
        body.extend_from_slice(b"\r\n");
    }
    body.extend_from_slice(format!("--{boundary}--\r\n").as_bytes());
    body
}

pub fn data_field(json: &Value) -> &Value {
    json.get("data").expect("response data field")
}
