mod auth;
mod board;
mod comments;
mod diagnostics;
mod error;
mod federation;
mod health;
mod install;
mod jwt;
mod marketplace;
mod moderation;
mod news;
mod orders;
mod presence;
mod response;
mod reviews;
mod search_semantic;
mod tasks;
mod users;

use axum::Router;
use axum::extract::DefaultBodyLimit;
use axum::middleware::from_fn_with_state;
use axum::routing::get;
use tower_http::limit::RequestBodyLimitLayer;

use crate::rate_limit;
use crate::services::HUB_MAX_REQUEST_BODY_BYTES;
use crate::state::AppState;

pub use auth::{
    accept_task_guard, create_resource_guard, guest_write_block_middleware,
    identity_id_from_headers, load_auth_user, permission_middleware, publish_guard,
    require_permission, AuthUser, HEADER_COMMUNITY_USER_ID,
};
pub use jwt::{bearer_token_from_headers, validate_hub_jwt, ResolvedIdentity};
pub use error::{ApiError, ApiErrorCode};

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health::health))
        .route("/api/v1/health", get(health::health))
        .nest(
            "/api/v1",
            users::router()
                .merge(marketplace::router())
                .merge(reviews::router())
                .merge(news::router())
                .merge(board::router())
                .merge(comments::router())
                .merge(tasks::router())
                .merge(orders::router())
                .merge(moderation::router())
                .merge(presence::router())
                .merge(install::router())
                .merge(diagnostics::router())
                .merge(search_semantic::router())
                .merge(federation::router())
                .layer(from_fn_with_state(state.clone(), rate_limit::rate_limit_middleware))
                .layer(from_fn_with_state(state.clone(), guest_write_block_middleware)),
        )
        .layer(DefaultBodyLimit::max(HUB_MAX_REQUEST_BODY_BYTES))
        .layer(RequestBodyLimitLayer::new(HUB_MAX_REQUEST_BODY_BYTES))
        .with_state(state)
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use tower::ServiceExt;
    use uuid::Uuid;

    use super::*;
    use crate::config::HubConfig;
    use crate::db::{init_pool, seed::DEFAULT_IDENTITY_ID};
    use crate::domain::UserPermission;
    use crate::repositories::UserRepository;

    fn temp_data_dir() -> PathBuf {
        std::env::temp_dir().join(format!("toolman-user-api-{}", Uuid::new_v4()))
    }

    async fn test_app() -> (Router, sqlx::SqlitePool, PathBuf) {
        let data_dir = temp_data_dir();
        std::fs::create_dir_all(&data_dir).expect("data dir");
        let db_path = data_dir.join("community.db");
        let pool = init_pool(&db_path).await.expect("init pool");
        let config = HubConfig::with_data_dir(data_dir.clone());
        let state = AppState::new(config, pool.clone());
        (router(state), pool, data_dir)
    }

    async fn test_app_with_jwt(secret: &str) -> (Router, sqlx::SqlitePool, PathBuf) {
        let data_dir = temp_data_dir();
        std::fs::create_dir_all(&data_dir).expect("data dir");
        let db_path = data_dir.join("community.db");
        let pool = init_pool(&db_path).await.expect("init pool");
        let config = HubConfig {
            jwt_secret: Some(secret.to_string()),
            ..HubConfig::with_data_dir(data_dir.clone())
        };
        let state = AppState::new(config, pool.clone());
        (router(state), pool, data_dir)
    }

    fn sign_test_hub_token(secret: &str, identity_id: &str, registration_status: &str) -> String {
        use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};

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
            sub: identity_id.to_string(),
            iss: "toolman-desktop".to_string(),
            aud: "toolman-community-hub".to_string(),
            exp: chrono::Utc::now().timestamp() + 3600,
            iat: chrono::Utc::now().timestamp(),
            registration_status: registration_status.to_string(),
        };

        encode(
            &Header::new(Algorithm::HS256),
            &claims,
            &EncodingKey::from_secret(secret.as_bytes()),
        )
        .expect("sign token")
    }

    #[tokio::test]
    async fn get_users_me_accepts_bearer_hub_token() {
        let secret = "test-hub-jwt-secret";
        let (app, pool, data_dir) = test_app_with_jwt(secret).await;
        let token = sign_test_hub_token(secret, DEFAULT_IDENTITY_ID, "registered");

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/v1/users/me")
                    .header("Authorization", format!("Bearer {token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .expect("response");

        assert_eq!(response.status(), StatusCode::OK);

        pool.close().await;
        let _ = std::fs::remove_dir_all(data_dir);
    }

    #[tokio::test]
    async fn guest_jwt_cannot_write() {
        let secret = "test-hub-jwt-secret-guest";
        let (app, pool, data_dir) = test_app_with_jwt(secret).await;
        let token = sign_test_hub_token(secret, DEFAULT_IDENTITY_ID, "guest");

        let response = app
            .oneshot(
                Request::builder()
                    .method("PATCH")
                    .uri("/api/v1/users/me")
                    .header("Authorization", format!("Bearer {token}"))
                    .header("content-type", "application/json")
                    .body(Body::from(r#"{"displayName":"Guest"}"#))
                    .unwrap(),
            )
            .await
            .expect("response");

        assert_eq!(response.status(), StatusCode::FORBIDDEN);

        pool.close().await;
        let _ = std::fs::remove_dir_all(data_dir);
    }

    #[tokio::test]
    async fn get_users_me_requires_identity_header() {
        let (app, pool, data_dir) = test_app().await;

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/v1/users/me")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .expect("response");

        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);

        pool.close().await;
        let _ = std::fs::remove_dir_all(data_dir);
    }

    #[tokio::test]
    async fn get_users_me_returns_seeded_admin() {
        let (app, pool, data_dir) = test_app().await;

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/v1/users/me")
                    .header(HEADER_COMMUNITY_USER_ID, DEFAULT_IDENTITY_ID)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .expect("response");

        assert_eq!(response.status(), StatusCode::OK);

        pool.close().await;
        let _ = std::fs::remove_dir_all(data_dir);
    }

    #[tokio::test]
    async fn publish_check_returns_403_when_permission_disabled() {
        let (app, pool, data_dir) = test_app().await;
        let repo = UserRepository::new(pool.clone());
        let identity = Uuid::new_v4().to_string();
        let user = repo
            .find_or_create_by_identity_id(&identity, Some("Bob"))
            .await
            .expect("create user");
        repo.set_permission(&user.id, UserPermission::Publish, false)
            .await
            .expect("disable publish");

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/v1/users/me/publish-check")
                    .header(HEADER_COMMUNITY_USER_ID, identity)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .expect("response");

        assert_eq!(response.status(), StatusCode::FORBIDDEN);

        pool.close().await;
        let _ = std::fs::remove_dir_all(data_dir);
    }

    #[tokio::test]
    async fn patch_users_me_updates_profile() {
        let (app, pool, data_dir) = test_app().await;

        let response = app
            .oneshot(
                Request::builder()
                    .method("PATCH")
                    .uri("/api/v1/users/me")
                    .header(HEADER_COMMUNITY_USER_ID, DEFAULT_IDENTITY_ID)
                    .header("content-type", "application/json")
                    .body(Body::from(
                        r#"{"display_name":"Updated Name","bio":"Hello community"}"#,
                    ))
                    .unwrap(),
            )
            .await
            .expect("response");

        assert_eq!(response.status(), StatusCode::OK);

        pool.close().await;
        let _ = std::fs::remove_dir_all(data_dir);
    }

    #[tokio::test]
    async fn post_review_returns_409_for_duplicate() {
        let (app, pool, data_dir) = test_app().await;
        let resource_repo = crate::repositories::ResourceRepository::new(pool.clone());
        let user_repo = UserRepository::new(pool.clone());
        let identity = Uuid::new_v4().to_string();
        let _reviewer = user_repo
            .find_or_create_by_identity_id(&identity, Some("Reviewer"))
            .await
            .expect("reviewer");

        let resource = resource_repo
            .create(crate::domain::CreateResourceInput {
                title: "Reviewable Skill".to_string(),
                description: Some("desc".to_string()),
                author_id: crate::db::seed::DEFAULT_ADMIN_USER_ID.to_string(),
                resource_type: crate::domain::ResourceType::Skill,
                version: None,
                tags: None,
                category: None,
                license: None,
                visibility: None,
                status: Some(crate::domain::ResourceStatus::Published),
                cover_path: None,
                package_path: None,
                resource_size: None,
                manifest: serde_json::json!({
                    "schemaVersion": 1,
                    "skillId": "reviewable",
                    "name": "Reviewable",
                    "description": "Reviewable"
                }),
            })
            .await
            .expect("resource");

        let body = format!(
            r#"{{"resource_id":"{}","rating":5,"body":"Great"}}"#,
            resource.id
        );

        let first = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/reviews")
                    .header(HEADER_COMMUNITY_USER_ID, &identity)
                    .header("content-type", "application/json")
                    .body(Body::from(body.clone()))
                    .unwrap(),
            )
            .await
            .expect("first response");
        assert_eq!(first.status(), StatusCode::OK);

        let duplicate = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/reviews")
                    .header(HEADER_COMMUNITY_USER_ID, identity)
                    .header("content-type", "application/json")
                    .body(Body::from(body))
                    .unwrap(),
            )
            .await
            .expect("duplicate response");
        assert_eq!(duplicate.status(), StatusCode::CONFLICT);

        pool.close().await;
        let _ = std::fs::remove_dir_all(data_dir);
    }

    #[tokio::test]
    async fn get_news_sources_returns_seeded_feeds() {
        let (app, pool, data_dir) = test_app().await;

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/v1/news/sources")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .expect("response");

        assert_eq!(response.status(), StatusCode::OK);

        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("body");
        let payload: serde_json::Value = serde_json::from_slice(&body).expect("json");
        let sources = payload["data"]
            .as_array()
            .expect("sources array");
        assert!(sources.len() >= 3);

        let ids: Vec<_> = sources
            .iter()
            .filter_map(|item| item["id"].as_str())
            .collect();
        assert!(ids.contains(&"openai-news"));
        assert!(ids.contains(&"36kr"));
        assert!(ids.contains(&"xinhua-news"));
        assert!(!ids.contains(&"hacker-news"));

        pool.close().await;
        let _ = std::fs::remove_dir_all(data_dir);
    }

    #[tokio::test]
    async fn post_news_source_fetch_ingests_fixture_feed() {
        let (app, pool, data_dir) = test_app().await;
        let news_service = crate::services::NewsService::new(pool.clone());

        let source = news_service
            .create_source(crate::domain::CreateRssSourceInput {
                id: Some("fixture-source".into()),
                title: "Fixture Feed".into(),
                feed_url: format!("https://example.com/feed/{}", Uuid::new_v4()),
                site_url: Some("https://example.com".into()),
                category: Some("ai".into()),
                language: Some("en".into()),
                enabled: Some(true),
                fetch_interval_minutes: Some(60),
            })
            .await
            .expect("create source");

        const SAMPLE_RSS: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Feed</title><item>
<title>HN Story</title><link>https://example.com/1</link><guid>hn-1</guid>
<description>Story</description></item></channel></rss>"#;

        let ingest = news_service
            .ingest_feed_bytes(&source.id, SAMPLE_RSS.as_bytes())
            .await
            .expect("ingest");
        assert_eq!(ingest.articles_added, 1);

        let response = app
            .oneshot(
                Request::builder()
                    .uri(format!("/api/v1/news/articles?source_id={}", source.id))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .expect("response");
        assert_eq!(response.status(), StatusCode::OK);

        pool.close().await;
        let _ = std::fs::remove_dir_all(data_dir);
    }

    #[tokio::test]
    async fn list_news_articles_returns_liked_by_me_with_bearer_token() {
        let secret = "test-hub-jwt-secret";
        let (app, pool, data_dir) = test_app_with_jwt(secret).await;
        let token = sign_test_hub_token(secret, DEFAULT_IDENTITY_ID, "registered");
        let news_service = crate::services::NewsService::new(pool.clone());

        let source = news_service
            .create_source(crate::domain::CreateRssSourceInput {
                id: Some("like-viewer-source".into()),
                title: "Like Viewer Feed".into(),
                feed_url: format!("https://example.com/feed/{}", Uuid::new_v4()),
                site_url: None,
                category: Some("ai".into()),
                language: None,
                enabled: Some(true),
                fetch_interval_minutes: None,
            })
            .await
            .expect("create source");

        const SAMPLE_RSS: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Feed</title><item>
<title>Like Test Story</title><link>https://example.com/like-test</link><guid>like-test-1</guid>
<description>Story</description></item></channel></rss>"#;

        news_service
            .ingest_feed_bytes(&source.id, SAMPLE_RSS.as_bytes())
            .await
            .expect("ingest");

        let articles = news_service
            .list_articles(
                &crate::services::news_service::NewsArticleQuery {
                    source_id: Some(source.id.clone()),
                    limit: 1,
                    offset: 0,
                    ..Default::default()
                },
                None,
            )
            .await
            .expect("list articles");
        let article_id = articles[0].id.clone();

        let like_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/api/v1/news/articles/{article_id}/like"))
                    .header("authorization", format!("Bearer {token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .expect("like response");
        assert_eq!(like_response.status(), StatusCode::OK);

        let list_response = app
            .oneshot(
                Request::builder()
                    .uri(format!(
                        "/api/v1/news/articles?source_id={}&limit=10",
                        source.id
                    ))
                    .header("authorization", format!("Bearer {token}"))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .expect("list response");
        assert_eq!(list_response.status(), StatusCode::OK);

        let body = axum::body::to_bytes(list_response.into_body(), usize::MAX)
            .await
            .expect("body");
        let payload: serde_json::Value = serde_json::from_slice(&body).expect("json");
        let liked_by_me = payload["data"][0]["liked_by_me"]
            .as_bool()
            .expect("liked_by_me boolean");
        assert!(liked_by_me);

        pool.close().await;
        let _ = std::fs::remove_dir_all(data_dir);
    }

    async fn test_app_with_rate_limit(rpm: u64) -> (Router, sqlx::SqlitePool, PathBuf) {
        let data_dir = temp_data_dir();
        std::fs::create_dir_all(&data_dir).expect("data dir");
        let db_path = data_dir.join("community.db");
        let pool = init_pool(&db_path).await.expect("init pool");
        let config = HubConfig {
            rate_limit_rpm: rpm,
            ..HubConfig::with_data_dir(data_dir.clone())
        };
        let state = AppState::new(config, pool.clone());
        (router(state), pool, data_dir)
    }

    #[tokio::test]
    async fn health_includes_rate_limit_and_semantic_search_fields() {
        let (app, pool, data_dir) = test_app().await;

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/v1/health")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .expect("response");

        assert_eq!(response.status(), StatusCode::OK);

        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("body");
        let payload: serde_json::Value = serde_json::from_slice(&body).expect("json");
        assert_eq!(payload["data"]["semantic_search"], "disabled");
        assert_eq!(payload["data"]["rate_limit_rpm"], 600);
        assert_eq!(payload["data"]["federation_peering"], true);

        pool.close().await;
        let _ = std::fs::remove_dir_all(data_dir);
    }

    #[tokio::test]
    async fn semantic_search_falls_back_to_fts_when_disabled() {
        let (app, pool, data_dir) = test_app().await;

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/api/v1/search/semantic?q=toolman")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .expect("response");

        assert_eq!(response.status(), StatusCode::OK);

        let body = axum::body::to_bytes(response.into_body(), usize::MAX)
            .await
            .expect("body");
        let payload: serde_json::Value = serde_json::from_slice(&body).expect("json");
        assert_eq!(payload["data"]["engine"], "fts");
        assert_eq!(payload["data"]["query"], "toolman");

        pool.close().await;
        let _ = std::fs::remove_dir_all(data_dir);
    }

    #[tokio::test]
    async fn rate_limit_returns_429_when_exceeded() {
        let (app, pool, data_dir) = test_app_with_rate_limit(2).await;

        for _ in 0..2 {
            let response = app
                .clone()
                .oneshot(
                    Request::builder()
                        .uri("/api/v1/news/sources")
                        .body(Body::empty())
                        .unwrap(),
                )
                .await
                .expect("response");
            assert_eq!(response.status(), StatusCode::OK);
        }

        let limited = app
            .oneshot(
                Request::builder()
                    .uri("/api/v1/news/sources")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .expect("response");
        assert_eq!(limited.status(), StatusCode::TOO_MANY_REQUESTS);

        pool.close().await;
        let _ = std::fs::remove_dir_all(data_dir);
    }
}
