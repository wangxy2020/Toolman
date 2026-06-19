use std::fs;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use base64::{engine::general_purpose::STANDARD, Engine};
use keyring::Entry;
use ring::digest::{digest, SHA256};
use ring::rand::SystemRandom;
use ring::signature::{Ed25519KeyPair, KeyPair};
use uuid::Uuid;

pub const KEYCHAIN_SERVICE: &str = "toolman-p2p";
pub const KEYCHAIN_USER: &str = "device-ed25519-private";
pub const PRIVATE_KEY_REF: &str = "keyring:toolman-p2p:device-ed25519-private";

const LEGACY_DEVICE_ID_FILE: &str = "device-id";
const DEVICE_ID_FILE: &str = "p2p/device_id";
const DEVICE_PKCS8_FILE: &str = "p2p/device.pkcs8.b64";

#[derive(Clone, Debug)]
pub struct DeviceIdentity {
    pub device_id: String,
    pub public_key_b64: String,
    pub public_key_fingerprint: String,
    pub private_key_ref: String,
    pub created_at_ms: u64,
}

pub struct DeviceIdentityService {
    identity: Option<DeviceIdentity>,
    pkcs8: Option<Vec<u8>>,
    data_dir: Option<std::path::PathBuf>,
}

impl DeviceIdentityService {
    pub fn new() -> Self {
        Self {
            identity: None,
            pkcs8: None,
            data_dir: None,
        }
    }

    pub fn ensure(&mut self, data_dir: &Path) -> Result<DeviceIdentity, String> {
        if let Some(identity) = self.identity.clone() {
            return Ok(identity);
        }

        let (identity, pkcs8) = load_or_create_identity(data_dir)?;
        self.identity = Some(identity.clone());
        self.pkcs8 = Some(pkcs8);
        self.data_dir = Some(data_dir.to_path_buf());
        Ok(identity)
    }

    pub fn get_info(&self) -> Result<DeviceIdentity, String> {
        self.identity
            .clone()
            .ok_or_else(|| "Device identity not initialized. Call deviceIdentityEnsure first.".to_string())
    }

    pub fn sign(&mut self, message: &str) -> Result<String, String> {
        if self.pkcs8.is_none() {
            if let Some(data_dir) = self.data_dir.clone() {
                let (identity, pkcs8) = load_or_create_identity(&data_dir)?;
                self.identity = Some(identity);
                self.pkcs8 = Some(pkcs8);
            }
        }

        let pkcs8 = self
            .pkcs8
            .as_ref()
            .ok_or_else(|| "Device private key unavailable. Restart the app.".to_string())?;
        let key_pair = Ed25519KeyPair::from_pkcs8(pkcs8.as_ref())
            .map_err(|_| "Stored device private key is invalid Ed25519 PKCS#8".to_string())?;
        let signature = key_pair.sign(message.as_bytes());
        Ok(STANDARD.encode(signature.as_ref()))
    }
}

impl Default for DeviceIdentityService {
    fn default() -> Self {
        Self::new()
    }
}

fn load_or_create_identity(data_dir: &Path) -> Result<(DeviceIdentity, Vec<u8>), String> {
    let device_id_path = data_dir.join(DEVICE_ID_FILE);

    if let Ok(pkcs8) = load_pkcs8_from_storage(data_dir) {
        let device_id = read_device_id(&device_id_path)
            .or_else(|| read_legacy_device_id(data_dir))
            .ok_or_else(|| {
                "Device private key exists but device_id file is missing".to_string()
            })?;
        let key_pair = Ed25519KeyPair::from_pkcs8(pkcs8.as_ref()).map_err(|_| {
            "Stored device private key is invalid Ed25519 PKCS#8".to_string()
        })?;
        write_device_id(&device_id_path, &device_id)?;
        return Ok((
            build_identity(
                device_id,
                &key_pair,
                device_id_created_at(&device_id_path),
            ),
            pkcs8,
        ));
    }

    let device_id = read_device_id(&device_id_path)
        .or_else(|| read_legacy_device_id(data_dir))
        .unwrap_or_else(|| Uuid::new_v4().to_string());

    let rng = SystemRandom::new();
    let pkcs8 = Ed25519KeyPair::generate_pkcs8(&rng)
        .map_err(|_| "Failed to generate Ed25519 key pair".to_string())?
        .as_ref()
        .to_vec();
    let key_pair = Ed25519KeyPair::from_pkcs8(pkcs8.as_ref())
        .map_err(|_| "Failed to parse generated Ed25519 key pair".to_string())?;

    save_pkcs8_to_storage(data_dir, &pkcs8)?;
    write_device_id(&device_id_path, &device_id)?;

    Ok((build_identity(device_id, &key_pair, now_ms()), pkcs8))
}

fn build_identity(
    device_id: String,
    key_pair: &Ed25519KeyPair,
    created_at_ms: u64,
) -> DeviceIdentity {
    let public_key_bytes = key_pair.public_key().as_ref();
    DeviceIdentity {
        device_id,
        public_key_b64: STANDARD.encode(public_key_bytes),
        public_key_fingerprint: fingerprint_public_key(public_key_bytes),
        private_key_ref: PRIVATE_KEY_REF.to_string(),
        created_at_ms,
    }
}

fn fingerprint_public_key(public_key_bytes: &[u8]) -> String {
    let hash = digest(&SHA256, public_key_bytes);
    hash.as_ref()
        .iter()
        .take(8)
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

fn load_pkcs8_from_keychain() -> Result<Vec<u8>, String> {
    let entry = Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_USER).map_err(|e| e.to_string())?;
    let encoded = entry.get_password().map_err(|e| e.to_string())?;
    STANDARD.decode(encoded).map_err(|e| e.to_string())
}

fn load_pkcs8_from_file(data_dir: &Path) -> Result<Vec<u8>, String> {
    let path = data_dir.join(DEVICE_PKCS8_FILE);
    let encoded = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    STANDARD
        .decode(encoded.trim())
        .map_err(|e| e.to_string())
}

fn load_pkcs8_from_storage(data_dir: &Path) -> Result<Vec<u8>, String> {
    load_pkcs8_from_keychain()
        .or_else(|_| load_pkcs8_from_file(data_dir))
}

fn save_pkcs8_to_keychain(pkcs8: &[u8]) -> Result<(), String> {
    let entry = Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_USER).map_err(|e| e.to_string())?;
    entry
        .set_password(&STANDARD.encode(pkcs8))
        .map_err(|e| e.to_string())
}

fn save_pkcs8_to_file(data_dir: &Path, pkcs8: &[u8]) -> Result<(), String> {
    let path = data_dir.join(DEVICE_PKCS8_FILE);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(path, STANDARD.encode(pkcs8)).map_err(|e| e.to_string())
}

fn save_pkcs8_to_storage(data_dir: &Path, pkcs8: &[u8]) -> Result<(), String> {
    match save_pkcs8_to_keychain(pkcs8) {
        Ok(()) => {}
        Err(_) => save_pkcs8_to_file(data_dir, pkcs8)?,
    }
    // Always keep a local file backup for dev / keychain hiccups.
    let _ = save_pkcs8_to_file(data_dir, pkcs8);
    Ok(())
}

fn read_device_id(path: &Path) -> Option<String> {
    let value = fs::read_to_string(path).ok()?;
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn read_legacy_device_id(data_dir: &Path) -> Option<String> {
    read_device_id(&data_dir.join(LEGACY_DEVICE_ID_FILE))
}

fn write_device_id(path: &Path, device_id: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(path, device_id).map_err(|e| e.to_string())
}

fn device_id_created_at(path: &Path) -> u64 {
    fs::metadata(path)
        .ok()
        .and_then(|meta| meta.created().or(meta.modified()).ok())
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or_else(now_ms)
}

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn load_key_pair() -> Result<Ed25519KeyPair, String> {
    let pkcs8 = load_pkcs8_from_keychain()?;
    Ed25519KeyPair::from_pkcs8(pkcs8.as_ref())
        .map_err(|_| "Stored device private key is invalid Ed25519 PKCS#8".to_string())
}

pub fn sign_message(message: &str) -> Result<String, String> {
    load_key_pair().and_then(|key_pair| {
        let signature = key_pair.sign(message.as_bytes());
        Ok(STANDARD.encode(signature.as_ref()))
    })
}

pub fn verify_message(
    message: &str,
    signature_b64: &str,
    public_key_b64: &str,
) -> Result<(), String> {
    use ring::signature::{UnparsedPublicKey, ED25519};

    let signature = STANDARD
        .decode(signature_b64)
        .map_err(|e| format!("Invalid signature encoding: {e}"))?;
    let public_key = STANDARD
        .decode(public_key_b64)
        .map_err(|e| format!("Invalid public key encoding: {e}"))?;
    let verifier = UnparsedPublicKey::new(&ED25519, &public_key);
    verifier
        .verify(message.as_bytes(), &signature)
        .map_err(|_| "Signature verification failed".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fingerprint_is_16_hex_chars() {
        let fp = fingerprint_public_key(&[1, 2, 3, 4]);
        assert_eq!(fp.len(), 16);
        assert!(fp.chars().all(|c| c.is_ascii_hexdigit()));
    }
}
