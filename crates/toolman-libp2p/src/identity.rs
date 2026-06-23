use std::fs;
use std::path::Path;

use base64::{engine::general_purpose::STANDARD, Engine};
use ed25519_dalek::pkcs8::DecodePrivateKey;
use keyring::Entry;
use libp2p::identity::Keypair;

pub const KEYCHAIN_SERVICE: &str = "toolman-p2p";
pub const KEYCHAIN_USER: &str = "device-ed25519-private";
const DEVICE_PKCS8_FILE: &str = "p2p/device.pkcs8.b64";

/// Reuse the same Ed25519 device key as `toolman-p2p` and map it to a libp2p keypair.
pub fn load_libp2p_keypair(data_dir: &Path) -> Result<Keypair, String> {
    let pkcs8 = load_device_pkcs8(data_dir)?;
    let signing_key = ed25519_dalek::SigningKey::from_pkcs8_der(&pkcs8)
        .map_err(|error| format!("invalid device PKCS#8: {error}"))?;
    keypair_from_signing_key(&signing_key)
}

fn keypair_from_signing_key(signing_key: &ed25519_dalek::SigningKey) -> Result<Keypair, String> {
    let mut secret_bytes = signing_key.to_bytes();
    Keypair::ed25519_from_bytes(&mut secret_bytes)
        .map_err(|error| format!("failed to build libp2p keypair: {error}"))
}

fn load_device_pkcs8(data_dir: &Path) -> Result<Vec<u8>, String> {
    if let Ok(pkcs8) = load_pkcs8_from_keychain() {
        return Ok(pkcs8);
    }

    let fallback_path = data_dir.join(DEVICE_PKCS8_FILE);
    if fallback_path.exists() {
        let encoded = fs::read_to_string(&fallback_path)
            .map_err(|error| format!("read device pkcs8 fallback failed: {error}"))?;
        return STANDARD
            .decode(encoded.trim())
            .map_err(|error| format!("decode device pkcs8 fallback failed: {error}"));
    }

    Err(
        "Device private key unavailable. Start the app once so toolman-p2p initializes identity."
            .to_string(),
    )
}

fn load_pkcs8_from_keychain() -> Result<Vec<u8>, String> {
    let entry = Entry::new(KEYCHAIN_SERVICE, KEYCHAIN_USER)
        .map_err(|error| format!("keychain entry unavailable: {error}"))?;
    let encoded = entry
        .get_password()
        .map_err(|error| format!("keychain read failed: {error}"))?;
    STANDARD
        .decode(encoded.trim())
        .map_err(|error| format!("keychain pkcs8 decode failed: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use ring::signature::Ed25519KeyPair;

    #[test]
    fn ring_pkcs8_roundtrip_to_libp2p() {
        let rng = ring::rand::SystemRandom::new();
        let pkcs8 = Ed25519KeyPair::generate_pkcs8(&rng)
            .expect("generate pkcs8")
            .as_ref()
            .to_vec();
        let signing_key =
            ed25519_dalek::SigningKey::from_pkcs8_der(&pkcs8).expect("parse pkcs8");
        keypair_from_signing_key(&signing_key).expect("libp2p keypair");
    }
}
