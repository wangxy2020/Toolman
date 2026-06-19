mod common;

use axum::http::StatusCode;
use serde_json::json;

use toolman_community_hub::db::seed::DEFAULT_IDENTITY_ID;
use toolman_community_hub::domain::ResourceType;
use toolman_community_hub::testing::{build_test_package, sample_mcp_manifest_json};

use common::{data_field, multipart_body, TestHarness};

const ADMIN: &str = DEFAULT_IDENTITY_ID;

#[tokio::test]
async fn mcp_publish_install_and_history_main_path() {
    let harness = TestHarness::setup().await;

    let (status, draft_resp) = harness
        .post_json(
            "/api/v1/marketplace/mcp",
            ADMIN,
            json!({
                "title": "Integration MCP",
                "description": "publish + install test"
            }),
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    let resource_id = data_field(&draft_resp)["id"]
        .as_str()
        .expect("resource id")
        .to_string();

    let package_bytes =
        build_test_package(ResourceType::Mcp, &sample_mcp_manifest_json(), &[]);
    let boundary = "toolman-it-boundary";
    let publish_body = multipart_body(
        boundary,
        &[("version", "1.0.0"), ("changelog", "initial release")],
        &[("package", "integration.toolman-mcp", &package_bytes)],
    );

    let (status, published_resp) = harness
        .post_multipart(
            &format!("/api/v1/marketplace/mcp/{resource_id}/publish"),
            ADMIN,
            publish_body,
            boundary,
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(data_field(&published_resp)["status"], "published");

    let (status, install_resp) = harness
        .post_json(
            &format!("/api/v1/install/mcp/{resource_id}"),
            ADMIN,
            json!({ "version": "1.0.0" }),
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    let install_id = data_field(&install_resp)["install_id"]
        .as_str()
        .expect("install id")
        .to_string();

    let (status, complete_resp) = harness
        .post_json(
            &format!("/api/v1/install/{install_id}/complete"),
            ADMIN,
            json!({
                "status": "success",
                "local_ref": "workspace://mcp/integration"
            }),
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(data_field(&complete_resp)["install_status"], "success");

    let (status, history_resp) = harness
        .get_json("/api/v1/install/history?resource_type=mcp", ADMIN)
        .await;
    assert_eq!(status, StatusCode::OK);
    let history = data_field(&history_resp).as_array().expect("history array");
    assert_eq!(history.len(), 1);
    assert_eq!(history[0]["resource_id"], resource_id);
    assert_eq!(history[0]["install_status"], "success");

    harness.teardown().await;
}
