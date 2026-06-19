use napi_derive::napi;

use crate::crypto::workspace_key_from_b64;
use crate::state::{CONNECTIONS, WORKSPACE_KEYS};

#[napi]
pub fn crypto_set_workspace_key(
    workspace_id: String,
    workspace_key_base64: String,
    key_version: Option<u32>,
) -> napi::Result<()> {
    let workspace_key = workspace_key_from_b64(&workspace_key_base64)
        .map_err(napi::Error::from_reason)?;
    let version = key_version.unwrap_or(1);

    let mut registry = WORKSPACE_KEYS
        .lock()
        .map_err(|_| napi::Error::from_reason("workspace key lock poisoned"))?;
    registry.set_workspace_key(&workspace_id, workspace_key, version);
    Ok(())
}

#[napi]
pub async fn crypto_rotate_workspace_key(
    workspace_id: String,
    workspace_key_base64: String,
    key_version: u32,
) -> napi::Result<()> {
    let workspace_key = workspace_key_from_b64(&workspace_key_base64)
        .map_err(napi::Error::from_reason)?;

    {
        let mut registry = WORKSPACE_KEYS
            .lock()
            .map_err(|_| napi::Error::from_reason("workspace key lock poisoned"))?;
        registry.rotate_workspace_key(&workspace_id, workspace_key, key_version);
    }

    let manager = CONNECTIONS.lock().await;
    manager
        .rotate_workspace_key(&workspace_id, workspace_key, key_version)
        .await
        .map_err(napi::Error::from_reason)?;
    Ok(())
}

#[napi]
pub fn crypto_generate_workspace_key() -> napi::Result<String> {
    Ok(crate::crypto::workspace_key_to_b64(
        &crate::crypto::generate_workspace_key(),
    ))
}
