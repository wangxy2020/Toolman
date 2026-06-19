use axum::extract::{Path, Query, State};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};

use crate::domain::{CommunityUser, UpdateUserProfileInput};
use crate::repositories::UserRepository;
use crate::services::admin_management_service::{AdminManagementService, ModeratorUserItem};
use crate::state::AppState;

use super::auth::AuthUser;
use super::error::ApiError;
use super::response::ApiResponse;

#[derive(Debug, Deserialize)]
pub struct PatchUserMeRequest {
    pub display_name: Option<String>,
    pub bio: Option<String>,
    pub avatar_path: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct UserProfileResponse {
    pub id: String,
    pub identity_id: String,
    pub display_name: String,
    pub avatar_path: Option<String>,
    pub bio: Option<String>,
    pub role: String,
    pub can_publish: bool,
    pub can_accept_task: bool,
    pub can_create_resource: bool,
    pub is_banned: bool,
    pub banned_until: Option<i64>,
    pub enterprise_name: Option<String>,
    pub stats_json: serde_json::Value,
    pub created_at: i64,
    pub updated_at: i64,
}

impl From<CommunityUser> for UserProfileResponse {
    fn from(user: CommunityUser) -> Self {
        Self {
            id: user.id,
            identity_id: user.identity_id,
            display_name: user.display_name,
            avatar_path: user.avatar_path,
            bio: user.bio,
            role: user.role.as_str().to_string(),
            can_publish: user.can_publish,
            can_accept_task: user.can_accept_task,
            can_create_resource: user.can_create_resource,
            is_banned: user.is_banned,
            banned_until: user.banned_until,
            enterprise_name: user.enterprise_name,
            stats_json: user.stats_json,
            created_at: user.created_at,
            updated_at: user.updated_at,
        }
    }
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/users/me", get(get_me).patch(patch_me))
        .route(
            "/users/me/publish-check",
            get(super::auth::require_publish_handler),
        )
        .route("/users/moderators", get(list_moderators))
        .route("/users/search", get(search_users))
        .route("/users/{id}/appoint-admin", post(appoint_admin))
        .route("/users/{id}/revoke-admin", post(revoke_admin))
}

fn admin_service(state: &AppState) -> AdminManagementService {
    AdminManagementService::new(state.db.clone())
}

async fn get_me(AuthUser(user): AuthUser) -> Json<ApiResponse<UserProfileResponse>> {
    Json(ApiResponse::ok(UserProfileResponse::from(user)))
}

async fn patch_me(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Json(body): Json<PatchUserMeRequest>,
) -> Result<Json<ApiResponse<UserProfileResponse>>, ApiError> {
    let repo = UserRepository::new(state.db);
    let updated = repo
        .update_profile(
            &user.id,
            UpdateUserProfileInput {
                display_name: body.display_name,
                bio: body.bio,
                avatar_path: body.avatar_path.map(Some),
            },
        )
        .await?;

    Ok(Json(ApiResponse::ok(UserProfileResponse::from(updated))))
}

#[derive(Debug, Deserialize)]
pub struct SearchUsersParams {
    pub q: Option<String>,
    pub limit: Option<i64>,
}

async fn list_moderators(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> Result<Json<ApiResponse<Vec<ModeratorUserItem>>>, ApiError> {
    let items = admin_service(&state).list_moderators(&user).await?;
    Ok(Json(ApiResponse::ok(items)))
}

async fn search_users(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Query(params): Query<SearchUsersParams>,
) -> Result<Json<ApiResponse<Vec<ModeratorUserItem>>>, ApiError> {
    let items = admin_service(&state)
        .search_users(
            &user,
            params.q.as_deref().unwrap_or(""),
            params.limit.unwrap_or(20),
        )
        .await?;
    Ok(Json(ApiResponse::ok(items)))
}

async fn appoint_admin(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<ModeratorUserItem>>, ApiError> {
    let item = admin_service(&state).appoint_admin(&user, &id).await?;
    Ok(Json(ApiResponse::ok(item)))
}

async fn revoke_admin(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<ModeratorUserItem>>, ApiError> {
    let item = admin_service(&state).revoke_admin(&user, &id).await?;
    Ok(Json(ApiResponse::ok(item)))
}
