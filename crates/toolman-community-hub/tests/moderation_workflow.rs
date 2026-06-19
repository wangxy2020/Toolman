mod common;

use axum::http::StatusCode;
use serde_json::json;

use toolman_community_hub::db::seed::DEFAULT_IDENTITY_ID;
use toolman_community_hub::domain::ResourceType;
use toolman_community_hub::testing::{build_test_package, sample_mcp_manifest_json};

use common::{data_field, multipart_body, TestHarness};

const ADMIN: &str = DEFAULT_IDENTITY_ID;
const REPORTER: &str = "integration-reporter-identity";

#[tokio::test]
async fn report_suspend_and_audit_log_main_path() {
    let harness = TestHarness::setup().await;

    let (status, draft_resp) = harness
        .post_json(
            "/api/v1/marketplace/mcp",
            ADMIN,
            json!({
                "title": "Moderation MCP",
                "description": "report + suspend test"
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
    let boundary = "toolman-mod-boundary";
    let publish_body = multipart_body(
        boundary,
        &[("version", "1.0.0")],
        &[("package", "moderation.toolman-mcp", &package_bytes)],
    );
    let (status, _) = harness
        .post_multipart(
            &format!("/api/v1/marketplace/mcp/{resource_id}/publish"),
            ADMIN,
            publish_body,
            boundary,
        )
        .await;
    assert_eq!(status, StatusCode::OK);

    let (status, report_resp) = harness
        .post_json(
            "/api/v1/moderation/reports",
            REPORTER,
            json!({
                "target_type": "resource",
                "target_id": resource_id,
                "reason": "spam",
                "description": "spam content in listing"
            }),
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    let report_id = data_field(&report_resp)["id"]
        .as_str()
        .expect("report id")
        .to_string();
    assert_eq!(data_field(&report_resp)["status"], "open");

    let (status, reports_resp) = harness
        .get_json("/api/v1/moderation/reports?status=open", ADMIN)
        .await;
    assert_eq!(status, StatusCode::OK);
    let reports = data_field(&reports_resp).as_array().expect("reports");
    assert!(reports.iter().any(|row| row["id"] == report_id));

    let (status, suspend_resp) = harness
        .post_json(
            &format!("/api/v1/moderation/resources/{resource_id}/suspend"),
            ADMIN,
            json!({ "reason": "policy violation" }),
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(data_field(&suspend_resp)["status"], "suspended");

    let (status, logs_resp) = harness
        .get_json("/api/v1/moderation/logs", ADMIN)
        .await;
    assert_eq!(status, StatusCode::OK);
    let logs = data_field(&logs_resp).as_array().expect("logs");
    assert!(!logs.is_empty());
    assert!(
        logs.iter()
            .any(|row| row["action"] == "suspend_resource" && row["target_id"] == resource_id)
    );

    harness.teardown().await;
}
