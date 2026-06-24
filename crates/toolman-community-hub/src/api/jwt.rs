use axum::http::HeaderMap;
use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};
use serde::{Deserialize, Serialize};

use super::error::ApiError;

pub const HEADER_AUTHORIZATION: &str = "authorization";

#[derive(Debug, Clone)]
pub struct ResolvedIdentity {
    pub identity_id: String,
    pub registration_status: String,
    pub sku: Option<String>,
    pub email: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct HubJwtClaims {
    sub: String,
    iss: String,
    aud: String,
    exp: i64,
    iat: i64,
    registration_status: String,
    #[serde(default)]
    sku: Option<String>,
    #[serde(default)]
    email: Option<String>,
}

pub fn bearer_token_from_headers(headers: &HeaderMap) -> Option<&str> {
    headers
        .get(HEADER_AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .map(str::trim)
        .and_then(|value| {
            value
                .strip_prefix("Bearer ")
                .or_else(|| value.strip_prefix("bearer "))
        })
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

pub fn validate_hub_jwt(token: &str, secret: &str) -> Result<ResolvedIdentity, ApiError> {
    let mut validation = Validation::new(Algorithm::HS256);
    validation.set_audience(&["toolman-community-hub"]);
    validation.set_issuer(&["toolman-desktop"]);

    let decoded = decode::<HubJwtClaims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &validation,
    )
    .map_err(|error| ApiError::unauthorized(format!("invalid hub token: {error}")))?;

    let claims = decoded.claims;
    if claims.sub.trim().is_empty() {
        return Err(ApiError::unauthorized("invalid hub token subject"));
    }

    Ok(ResolvedIdentity {
        identity_id: claims.sub,
        registration_status: claims.registration_status,
        sku: claims.sku,
        email: claims
            .email
            .map(|value| value.trim().to_lowercase())
            .filter(|value| !value.is_empty()),
    })
}

pub fn ensure_registered(identity: &ResolvedIdentity) -> Result<(), ApiError> {
    if identity.registration_status == "guest" {
        return Err(ApiError::forbidden("registration required"));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use jsonwebtoken::{encode, EncodingKey, Header};

    use super::*;

    fn sign_test_token(secret: &str, registration_status: &str) -> String {
        let claims = HubJwtClaims {
            sub: "identity-test".to_string(),
            iss: "toolman-desktop".to_string(),
            aud: "toolman-community-hub".to_string(),
            exp: chrono::Utc::now().timestamp() + 3600,
            iat: chrono::Utc::now().timestamp(),
            registration_status: registration_status.to_string(),
            sku: Some("community".to_string()),
            email: None,
        };

        encode(
            &Header::new(Algorithm::HS256),
            &claims,
            &EncodingKey::from_secret(secret.as_bytes()),
        )
        .expect("sign token")
    }

    #[test]
    fn validates_signed_hub_token() {
        let secret = "test-secret";
        let token = sign_test_token(secret, "registered");
        let identity = validate_hub_jwt(&token, secret).expect("valid token");
        assert_eq!(identity.identity_id, "identity-test");
        assert_eq!(identity.registration_status, "registered");
        assert_eq!(identity.sku.as_deref(), Some("community"));
    }

    #[test]
    fn rejects_guest_for_registered_only_helper() {
        let identity = ResolvedIdentity {
            identity_id: "guest-id".to_string(),
            registration_status: "guest".to_string(),
            sku: None,
            email: None,
        };
        ensure_registered(&identity).expect_err("guest blocked");
    }
}
