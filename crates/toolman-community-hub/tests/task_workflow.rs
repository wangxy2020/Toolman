mod common;

use axum::http::StatusCode;
use serde_json::json;

use toolman_community_hub::db::seed::DEFAULT_IDENTITY_ID;

use common::{data_field, multipart_body, TestHarness};

const ADMIN: &str = DEFAULT_IDENTITY_ID;
const CONTRACTOR: &str = "integration-contractor-identity";

#[tokio::test]
async fn task_publish_apply_deliver_and_complete_main_path() {
    let harness = TestHarness::setup().await;

    let (status, create_resp) = harness
        .post_json(
            "/api/v1/tasks",
            ADMIN,
            json!({
                "title": "Integration task",
                "description": "End-to-end via HTTP",
                "task_type": "development",
                "budget_amount": 1000.0,
                "budget_currency": "CNY"
            }),
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    let task_id = data_field(&create_resp)["id"]
        .as_str()
        .expect("task id")
        .to_string();
    assert_eq!(data_field(&create_resp)["status"], "draft");

    let (status, publish_resp) = harness
        .post_json(
            &format!("/api/v1/tasks/{task_id}/publish"),
            ADMIN,
            json!({}),
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(data_field(&publish_resp)["status"], "open");

    let (status, apply_resp) = harness
        .post_json(
            &format!("/api/v1/tasks/{task_id}/apply"),
            CONTRACTOR,
            json!({
                "proposal": "I can deliver this",
                "quoted_amount": 900.0
            }),
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    let application_id = data_field(&apply_resp)["id"]
        .as_str()
        .expect("application id")
        .to_string();

    let (status, apps_resp) = harness
        .get_json(&format!("/api/v1/tasks/{task_id}/applications"), ADMIN)
        .await;
    assert_eq!(status, StatusCode::OK);
    let apps = data_field(&apps_resp).as_array().expect("applications");
    assert_eq!(apps.len(), 1);
    assert_eq!(apps[0]["id"], application_id);

    let (status, assigned_resp) = harness
        .post_json(
            &format!("/api/v1/tasks/{task_id}/applications/{application_id}/accept"),
            ADMIN,
            json!({}),
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(data_field(&assigned_resp)["status"], "assigned");

    let boundary = "toolman-task-delivery";
    let deliver_body = multipart_body(
        boundary,
        &[("notes", "integration deliverable")],
        &[("package", "result.zip", b"deliverable-bytes")],
    );
    let (status, deliver_resp) = harness
        .post_multipart(
            &format!("/api/v1/tasks/{task_id}/deliver"),
            CONTRACTOR,
            deliver_body,
            boundary,
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(data_field(&deliver_resp)["status"], "submitted");

    let (status, delivered_resp) = harness
        .get_json(&format!("/api/v1/tasks/{task_id}"), ADMIN)
        .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(data_field(&delivered_resp)["status"], "delivered");

    let (status, completed_resp) = harness
        .post_json(
            &format!("/api/v1/tasks/{task_id}/accept-delivery"),
            ADMIN,
            json!({}),
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(data_field(&completed_resp)["status"], "completed");
    assert!(data_field(&completed_resp)["completed_at"].is_number());

    harness.teardown().await;
}
