mod common;

use std::net::SocketAddr;

use axum::http::StatusCode;
use serde_json::json;
use tokio::net::TcpListener;

use toolman_community_hub::db::seed::DEFAULT_IDENTITY_ID;
use toolman_community_hub::domain::ResourceType;
use toolman_community_hub::testing::{build_test_package, sample_mcp_manifest_json};

use common::{data_field, multipart_body, TestHarness};

const ADMIN: &str = DEFAULT_IDENTITY_ID;

#[tokio::test]
async fn http_multipart_publish_accepts_package_larger_than_2mb() {
    let harness = TestHarness::setup().await;

    let (status, draft_resp) = harness
        .post_json(
            "/api/v1/marketplace/mcp",
            ADMIN,
            json!({ "title": "HTTP large upload MCP" }),
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    let resource_id = data_field(&draft_resp)["id"]
        .as_str()
        .expect("resource id")
        .to_string();

    let padding = vec![b'x'; 3 * 1024 * 1024];
    let package_bytes = build_test_package(
        ResourceType::Mcp,
        &sample_mcp_manifest_json(),
        &[("padding.bin", &padding)],
    );
    assert!(package_bytes.len() > 2 * 1024 * 1024);

    let boundary = "toolman-http-large-boundary";
    let publish_body = multipart_body(
        boundary,
        &[("version", "1.0.0")],
        &[("package", "http-large.toolman-mcp", &package_bytes)],
    );

    let listener = TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind ephemeral port");
    let addr: SocketAddr = listener.local_addr().expect("local addr");
    let TestHarness {
        app,
        pool,
        data_dir,
        ..
    } = harness;
    tokio::spawn(async move {
        axum::serve(listener, app)
            .await
            .expect("serve test hub");
    });

    let client = reqwest::Client::new();
    let response = client
        .post(format!(
            "http://{addr}/api/v1/marketplace/mcp/{resource_id}/publish"
        ))
        .header("x-community-user-id", ADMIN)
        .header(
            "content-type",
            format!("multipart/form-data; boundary={boundary}"),
        )
        .body(publish_body)
        .send()
        .await
        .expect("publish request");

    let status = response.status();
    let body = response.text().await.unwrap_or_default();
    assert_eq!(status, StatusCode::OK, "body={body}");

    pool.close().await;
    let _ = std::fs::remove_dir_all(data_dir);
}
