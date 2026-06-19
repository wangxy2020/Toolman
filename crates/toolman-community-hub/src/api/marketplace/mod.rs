pub mod mcp;
pub mod knowledge;
pub mod resources;
pub mod skills;
pub mod workflows;

use axum::Router;

use crate::state::AppState;

pub fn router() -> Router<AppState> {
    resources::router()
        .merge(mcp::router())
        .merge(skills::router())
        .merge(workflows::router())
        .merge(knowledge::router())
}
