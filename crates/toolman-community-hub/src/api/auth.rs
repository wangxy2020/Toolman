use axum::body::Body;
use axum::extract::{FromRef, FromRequestParts, State};
use axum::http::request::Parts;
use axum::http::{HeaderMap, Request, StatusCode};
use axum::middleware::Next;
use axum::response::Response;

use crate::domain::{CommunityUser, UserPermission};
use crate::repositories::UserRepository;
use crate::state::AppState;

use super::error::ApiError;

pub const HEADER_COMMUNITY_USER_ID: &str = "x-community-user-id";

#[derive(Debug, Clone)]
pub struct AuthUser(pub CommunityUser);

impl AuthUser {
    pub fn user(&self) -> &CommunityUser {
        &self.0
    }

    pub fn into_user(self) -> CommunityUser {
        self.0
    }
}

pub fn identity_id_from_headers(headers: &HeaderMap) -> Option<&str> {
    headers
        .get(HEADER_COMMUNITY_USER_ID)
        .and_then(|value| value.to_str().ok())
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

pub async fn load_auth_user(state: &AppState, identity_id: &str) -> Result<AuthUser, ApiError> {
    let repo = UserRepository::new(state.db.clone());
    let user = repo
        .find_or_create_by_identity_id(identity_id, None)
        .await?;
    Ok(AuthUser(user))
}

pub fn require_permission(user: &CommunityUser, permission: UserPermission) -> Result<(), ApiError> {
    user.ensure_permission(permission).map_err(ApiError::from)
}

pub async fn permission_middleware(
    State(state): State<AppState>,
    mut request: Request<Body>,
    next: Next,
) -> Result<Response, ApiError> {
    let identity_id = identity_id_from_headers(request.headers())
        .ok_or_else(|| ApiError::unauthorized("missing X-Community-User-Id"))?;

    let auth_user = load_auth_user(&state, identity_id).await?;
    auth_user.user().ensure_permission(UserPermission::Publish)?;

    request.extensions_mut().insert(auth_user);
    Ok(next.run(request).await)
}

impl<S> FromRequestParts<S> for AuthUser
where
    S: Send + Sync,
    AppState: FromRef<S>,
{
    type Rejection = ApiError;

    fn from_request_parts(
        parts: &mut Parts,
        state: &S,
    ) -> impl std::future::Future<Output = Result<Self, Self::Rejection>> + Send {
        let identity_id = identity_id_from_headers(&parts.headers).map(str::to_string);
        let state = AppState::from_ref(state);

        async move {
            let identity_id = identity_id
                .filter(|value| !value.is_empty())
                .ok_or_else(|| ApiError::unauthorized("missing X-Community-User-Id"))?;

            load_auth_user(&state, &identity_id).await
        }
    }
}

pub async fn publish_guard(user: AuthUser) -> Result<AuthUser, ApiError> {
    require_permission(user.user(), UserPermission::Publish)?;
    Ok(user)
}

pub async fn create_resource_guard(user: AuthUser) -> Result<AuthUser, ApiError> {
    require_permission(user.user(), UserPermission::CreateResource)?;
    Ok(user)
}

pub async fn accept_task_guard(user: AuthUser) -> Result<AuthUser, ApiError> {
    require_permission(user.user(), UserPermission::AcceptTask)?;
    Ok(user)
}

pub async fn require_publish_handler(
    State(state): State<AppState>,
    headers: HeaderMap,
) -> Result<StatusCode, ApiError> {
    let identity_id = identity_id_from_headers(&headers)
        .ok_or_else(|| ApiError::unauthorized("missing X-Community-User-Id"))?;
    let auth_user = load_auth_user(&state, identity_id).await?;
    require_permission(auth_user.user(), UserPermission::Publish)?;
    Ok(StatusCode::NO_CONTENT)
}
