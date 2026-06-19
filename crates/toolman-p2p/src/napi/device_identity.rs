use napi_derive::napi;
use once_cell::sync::Lazy;
use std::path::PathBuf;
use std::sync::Mutex;

use crate::crypto::{DeviceIdentity, DeviceIdentityService};

static DEVICE_IDENTITY: Lazy<Mutex<DeviceIdentityService>> =
    Lazy::new(|| Mutex::new(DeviceIdentityService::new()));

#[napi(object)]
pub struct NapiDeviceInfo {
    #[napi(js_name = "deviceId")]
    pub device_id: String,
    #[napi(js_name = "publicKey")]
    pub public_key: String,
    #[napi(js_name = "publicKeyFingerprint")]
    pub public_key_fingerprint: String,
    #[napi(js_name = "privateKeyRef")]
    pub private_key_ref: String,
    #[napi(js_name = "createdAt")]
    pub created_at: f64,
}

fn to_napi_device_info(identity: DeviceIdentity) -> NapiDeviceInfo {
    NapiDeviceInfo {
        device_id: identity.device_id,
        public_key: identity.public_key_b64,
        public_key_fingerprint: identity.public_key_fingerprint,
        private_key_ref: identity.private_key_ref,
        created_at: identity.created_at_ms as f64,
    }
}

#[napi]
pub fn device_identity_ensure(data_dir: String) -> napi::Result<NapiDeviceInfo> {
    let mut service = DEVICE_IDENTITY
        .lock()
        .map_err(|_| napi::Error::from_reason("device identity lock poisoned"))?;

    let identity = service
        .ensure(PathBuf::from(data_dir).as_path())
        .map_err(napi::Error::from_reason)?;

    Ok(to_napi_device_info(identity))
}

#[napi]
pub fn device_identity_get_info() -> napi::Result<NapiDeviceInfo> {
    let service = DEVICE_IDENTITY
        .lock()
        .map_err(|_| napi::Error::from_reason("device identity lock poisoned"))?;

    let identity = service
        .get_info()
        .map_err(napi::Error::from_reason)?;

    Ok(to_napi_device_info(identity))
}

#[napi]
pub fn device_identity_sign(message: String) -> napi::Result<String> {
    let mut service = DEVICE_IDENTITY
        .lock()
        .map_err(|_| napi::Error::from_reason("device identity lock poisoned"))?;

    service
        .sign(&message)
        .map_err(napi::Error::from_reason)
}

#[napi]
pub fn device_identity_verify(
    message: String,
    signature_b64: String,
    public_key_b64: String,
) -> napi::Result<bool> {
    crate::crypto::verify_message(&message, &signature_b64, &public_key_b64)
        .map(|()| true)
        .map_err(napi::Error::from_reason)
}
