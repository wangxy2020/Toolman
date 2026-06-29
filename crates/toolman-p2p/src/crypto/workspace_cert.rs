use base64::{engine::general_purpose::STANDARD, Engine};
use ring::rand::{SecureRandom, SystemRandom};

pub fn generate_workspace_key() -> [u8; 32] {
    let mut key = [0u8; 32];
    SystemRandom::new()
        .fill(&mut key)
        .expect("failed to generate workspace key");
    key
}

pub fn workspace_key_from_b64(value: &str) -> Result<[u8; 32], String> {
    let bytes = STANDARD
        .decode(value.trim())
        .map_err(|e| format!("Invalid workspace key base64: {e}"))?;
    if bytes.len() != 32 {
        return Err(format!("workspace key must be 32 bytes, got {}", bytes.len()));
    }
    let mut key = [0u8; 32];
    key.copy_from_slice(&bytes);
    Ok(key)
}

pub fn workspace_key_to_b64(key: &[u8; 32]) -> String {
    STANDARD.encode(key)
}
