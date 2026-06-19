use std::net::SocketAddr;

use axum::Router;
use tower_http::trace::TraceLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use toolman_community_hub::{api, init_pool, services::news_service::NewsService, AppState, HubConfig};

#[tokio::main]
async fn main() {
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| {
                "toolman_community_hub=info,tower_http=info,axum=info".into()
            }),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let config = HubConfig::load().unwrap_or_else(|error| {
        panic!("failed to load community hub config: {error}");
    });

    config.bootstrap().unwrap_or_else(|error| {
        panic!(
            "failed to initialize community hub storage at {}: {error}",
            config.data_dir.display()
        );
    });

    let db = init_pool(&config.db_path).await.unwrap_or_else(|error| {
        panic!(
            "failed to initialize community database at {}: {error}",
            config.db_path.display()
        );
    });

    let addr = SocketAddr::from((
        config.host.parse::<std::net::IpAddr>().expect("valid host"),
        config.port,
    ));

    let state = AppState::new(config, db);
    let bootstrap_pool = state.db.clone();
    tokio::spawn(async move {
        let fetched = NewsService::new(bootstrap_pool)
            .bootstrap_fetch_unfetched_sources()
            .await;
        if fetched > 0 {
            tracing::info!("bootstrapped {fetched} rss source(s)");
        }
    });

    let app = Router::new()
        .merge(api::router(state))
        .layer(TraceLayer::new_for_http());

    tracing::info!(
        "toolman-community-hub v{} listening on http://{addr}",
        toolman_community_hub::VERSION
    );

    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .unwrap_or_else(|error| panic!("failed to bind {addr}: {error}"));

    axum::serve(listener, app)
        .await
        .expect("server error");
}
