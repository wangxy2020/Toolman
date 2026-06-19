use napi_derive::napi;

/// Health check for the native P2P module (Task-001).
#[napi]
pub fn ping() -> napi::Result<String> {
    Ok("pong".to_string())
}

/// Native module version string for diagnostics.
#[napi]
pub fn version() -> napi::Result<String> {
    Ok(env!("CARGO_PKG_VERSION").to_string())
}
