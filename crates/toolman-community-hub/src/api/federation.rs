use axum::extract::{Query, State};
use axum::routing::get;
use axum::{Json, Router};
use serde::Deserialize;

use crate::api::response::ApiResponse;
use crate::domain::ResourceType;
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

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/federation/catalog", get(list_catalog))
        .route("/federation/peering/info", get(peering_info))
        .route("/federation/libp2p-bootstrap", get(libp2p_bootstrap))
}

fn service(state: &AppState) -> FederationService {
    FederationService::new(state.db.clone())
}

fn resolve_base_url(state: &AppState) -> String {
    format!("http://{}:{}", state.config.host, state.config.port)
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
