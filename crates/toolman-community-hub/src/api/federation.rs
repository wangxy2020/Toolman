use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::routing::get;
use axum::{Json, Router};
use serde::{Deserialize, Serialize};

use crate::api::response::ApiResponse;
use crate::domain::ResourceType;
use crate::repositories::UserRepository;
use crate::services::federation_service::{
    FederationCatalogQuery, FederationService,
};
use crate::state::AppState;

#[derive(Debug, Deserialize)]
pub struct CatalogQueryParams {
    pub updated_after: Option<i64>,
    pub limit: Option<i64>,
    pub resource_type: Option<String>,
}

/// WebFinger query: `?resource=acct:username@domain` or `?resource=https://hub/users/{id}`
#[derive(Debug, Deserialize)]
pub struct WebFingerQuery {
    pub resource: Option<String>,
}

/// Minimal JRD (JSON Resource Descriptor) returned by WebFinger.
/// See RFC 7033.
#[derive(Debug, Serialize)]
pub struct WebFingerJrd {
    pub subject: String,
    pub links: Vec<WebFingerLink>,
}

#[derive(Debug, Serialize)]
pub struct WebFingerLink {
    pub rel: String,
    #[serde(rename = "type")]
    pub content_type: String,
    pub href: String,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/federation/catalog", get(list_catalog))
        .route("/federation/peering/info", get(peering_info))
        .route("/federation/libp2p-bootstrap", get(libp2p_bootstrap))
        // WebFinger alias inside /api/v1 namespace.
        .route("/federation/webfinger", get(webfinger))
}

fn service(state: &AppState) -> FederationService {
    FederationService::new(state.db.clone())
}

fn resolve_base_url(state: &AppState) -> String {
    let host = if state.config.host == "0.0.0.0" || state.config.host == "::" {
        "127.0.0.1"
    } else {
        state.config.host.as_str()
    };
    format!("http://{}:{}", host, state.config.port)
}

async fn list_catalog(
    State(state): State<AppState>,
    Query(params): Query<CatalogQueryParams>,
) -> Json<ApiResponse<crate::services::federation_service::FederationCatalogPage>> {
    let resource_type = params
        .resource_type
        .as_deref()
        .and_then(|value| ResourceType::parse(value).ok());

    let page = service(&state)
        .list_catalog(
            FederationCatalogQuery {
                updated_after: params.updated_after.unwrap_or(0),
                limit: params.limit.unwrap_or(100),
                resource_type,
            },
            &state.config.data_dir,
        )
        .await
        .expect("federation catalog query");

    Json(ApiResponse::ok(page))
}

async fn peering_info(
    State(state): State<AppState>,
) -> Json<ApiResponse<crate::services::federation_service::FederationPeeringInfo>> {
    let info = service(&state)
        .peering_info(&resolve_base_url(&state))
        .await
        .expect("federation peering info");
    Json(ApiResponse::ok(info))
}

async fn libp2p_bootstrap(
    State(_state): State<AppState>,
) -> Json<ApiResponse<crate::services::federation_service::FederationLibp2pBootstrap>> {
    Json(ApiResponse::ok(FederationService::libp2p_bootstrap()))
}

/// Lightweight WebFinger handler (RFC 7033).
///
/// Resolves `acct:username@domain` or a user profile URL to a JRD that
/// links back to the Hub user-profile endpoint.  External Fediverse-aware
/// software can use this to discover Toolman Hub identities.
///
/// Mounted at both `/api/v1/federation/webfinger` and `/.well-known/webfinger`.
pub async fn webfinger_well_known(
    state: State<AppState>,
    query: Query<WebFingerQuery>,
) -> Result<(StatusCode, axum::response::Json<WebFingerJrd>), StatusCode> {
    webfinger(state, query).await
}

async fn webfinger(
    State(state): State<AppState>,
    Query(params): Query<WebFingerQuery>,
) -> Result<(StatusCode, axum::response::Json<WebFingerJrd>), StatusCode> {
    let resource = params.resource.as_deref().unwrap_or("").trim().to_string();
    if resource.is_empty() {
        return Err(StatusCode::BAD_REQUEST);
    }

    let base = resolve_base_url(&state);

    // Resolve the user identity from the resource string.
    // Supported formats:
    //   acct:username@<host>      → look up by display_name (best-effort)
    //   https://<base>/users/<id> → look up by user id
    let repo = UserRepository::new(state.db.clone());

    let user = if let Some(stripped) = resource.strip_prefix("acct:") {
        // Extract the local part before '@'.
        let local = stripped.split('@').next().unwrap_or("").trim();
        if local.is_empty() {
            return Err(StatusCode::NOT_FOUND);
        }
        // Find by display_name (case-insensitive best-effort lookup).
        repo.find_by_display_name(local).await.ok().flatten()
    } else if resource.starts_with("https://") || resource.starts_with("http://") {
        // Extract user id from URL pattern /users/{id}.
        let id = resource
            .trim_end_matches('/')
            .rsplit('/')
            .next()
            .unwrap_or("")
            .to_string();
        if id.is_empty() {
            return Err(StatusCode::NOT_FOUND);
        }
        repo.find_by_id(&id).await.ok().flatten()
    } else {
        return Err(StatusCode::BAD_REQUEST);
    };

    let user = user.ok_or(StatusCode::NOT_FOUND)?;
    let profile_url = format!("{}/api/v1/users/{}", base, user.id);

    Ok((
        StatusCode::OK,
        axum::response::Json(WebFingerJrd {
            subject: resource.clone(),
            links: vec![WebFingerLink {
                rel: "self".to_string(),
                content_type: "application/json".to_string(),
                href: profile_url,
            }],
        }),
    ))
}
