use axum::body::Body;
use axum::extract::{FromRef, FromRequestParts, State};
use axum::http::request::Parts;
use axum::http::{HeaderMap, Method, Request, StatusCode};
use axum::middleware::Next;
use axum::response::Response;

use crate::domain::{CommunityUser, UserPermission};
use crate::repositories::UserRepository;
use crate::state::AppState;

use super::error::ApiError;
use super::jwt::{
    bearer_token_from_headers, ensure_registered, validate_hub_jwt, ResolvedIdentity,
};

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

pub fn resolve_identity_from_headers(
    headers: &HeaderMap,
    jwt_secret: Option<&str>,
) -> Result<ResolvedIdentity, ApiError> {
    if let Some(secret) = jwt_secret {
        if let Some(token) = bearer_token_from_headers(headers) {
            return validate_hub_jwt(token, secret);
        }
        return Err(ApiError::unauthorized(
            "missing Authorization Bearer token",
        ));
    }

    if !crate::config::is_header_auth_allowed() {
        return Err(ApiError::unauthorized(
            "community hub JWT secret not configured; set COMMUNITY_HUB_JWT_SECRET or COMMUNITY_HUB_ALLOW_HEADER_AUTH=1 for local dev",
        ));
    }

    if let Some(identity_id) = identity_id_from_headers(headers) {
        return Ok(ResolvedIdentity {
            identity_id: identity_id.to_string(),
            registration_status: "registered".to_string(),
            sku: None,
            email: None,
        });
    }

    Err(ApiError::unauthorized(
        "missing Authorization Bearer token or X-Community-User-Id",
    ))
}

pub async fn load_auth_user(state: &AppState, identity: &ResolvedIdentity) -> Result<AuthUser, ApiError> {
    let repo = UserRepository::new(state.db.clone());
    let user = repo
        .find_or_create_by_identity_id(&identity.identity_id, None)
        .await?;
    let user = crate::services::dev_test_user_role::apply_dev_test_user_role(
        &repo,
        user,
        identity.email.as_deref(),
    )
    .await?;
    Ok(AuthUser(user))
}

pub async fn load_optional_viewer(
    state: &AppState,
    headers: &HeaderMap,
) -> Result<Option<CommunityUser>, ApiError> {
    let identity = match resolve_identity_from_headers(
        headers,
        state.config.jwt_secret.as_deref(),
    ) {
        Ok(identity) => identity,
        Err(_) => return Ok(None),
    };

    Ok(Some(
        load_auth_user(state, &identity)
            .await?
            .into_user(),
    ))
}

pub fn require_permission(user: &CommunityUser, permission: UserPermission) -> Result<(), ApiError> {
    user.ensure_permission(permission).map_err(ApiError::from)
}

pub async fn guest_write_block_middleware(
    State(state): State<AppState>,
    request: Request<Body>,
    next: Next,
) -> Result<Response, ApiError> {
    let method = request.method().clone();
    if matches!(
        method,
        Method::POST | Method::PUT | Method::PATCH | Method::DELETE
    ) {
        if let Ok(identity) = resolve_identity_from_headers(
            request.headers(),
            state.config.jwt_secret.as_deref(),
        ) {
            ensure_registered(&identity)?;
        }
    }

    Ok(next.run(request).await)
}

pub async fn permission_middleware(
    State(state): State<AppState>,
    mut request: Request<Body>,
    next: Next,
) -> Result<Response, ApiError> {
    let identity = resolve_identity_from_headers(
        request.headers(),
        state.config.jwt_secret.as_deref(),
    )?;

    ensure_registered(&identity)?;
    let auth_user = load_auth_user(&state, &identity).await?;
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
        let state = AppState::from_ref(state);

        async move {
            let identity = resolve_identity_from_headers(
                &parts.headers,
                state.config.jwt_secret.as_deref(),
            )?;

            load_auth_user(&state, &identity).await
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
    let identity = resolve_identity_from_headers(
        &headers,
        state.config.jwt_secret.as_deref(),
    )?;
    ensure_registered(&identity)?;
    let auth_user = load_auth_user(&state, &identity).await?;
    require_permission(auth_user.user(), UserPermission::Publish)?;
    Ok(StatusCode::NO_CONTENT)
}
