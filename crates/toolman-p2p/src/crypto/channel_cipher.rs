use std::collections::HashMap;

use ring::aead::{Aad, LessSafeKey, Nonce, UnboundKey, AES_256_GCM};
use ring::hkdf::{HKDF_SHA256, Salt};
use ring::rand::{SecureRandom, SystemRandom};

pub const WORKSPACE_KEY_LEN: usize = 32;
pub const AES_KEY_LEN: usize = 32;
pub const NONCE_LEN: usize = 12;
pub const TAG_LEN: usize = 16;
pub const ENVELOPE_MAGIC: [u8; 2] = *b"TM";
pub const ENVELOPE_VERSION_ENCRYPTED: u8 = 1;
pub const ENVELOPE_HEADER_LEN: usize = ENVELOPE_MAGIC.len() + 1 + 4 + NONCE_LEN;

#[derive(Clone)]
pub struct ChannelCipher {
    key: LessSafeKey,
    key_version: u32,
}

impl ChannelCipher {
    pub fn derive(
        workspace_key: &[u8],
        workspace_id: &str,
        channel: &str,
        key_version: u32,
    ) -> Result<Self, String> {
        if workspace_key.len() != WORKSPACE_KEY_LEN {
            return Err(format!(
                "workspace_key must be {WORKSPACE_KEY_LEN} bytes, got {}",
                workspace_key.len()
            ));
        }

        let salt = Salt::new(HKDF_SHA256, workspace_id.as_bytes());
        let prk = salt.extract(workspace_key);
        let info = format!("toolman-p2p:{channel}:v{key_version}");
        let mut derived = [0u8; AES_KEY_LEN];
        prk.expand(&[info.as_bytes()], HKDF_SHA256)
            .map_err(|_| "HKDF expand failed".to_string())?
            .fill(&mut derived)
            .map_err(|_| "HKDF output length mismatch".to_string())?;

        let unbound = UnboundKey::new(&AES_256_GCM, &derived)
            .map_err(|e| format!("Invalid AES key material: {e}"))?;

        Ok(Self {
            key: LessSafeKey::new(unbound),
            key_version,
        })
    }

    pub fn key_version(&self) -> u32 {
        self.key_version
    }

    pub fn encrypt(&self, plaintext: &[u8]) -> Result<Vec<u8>, String> {
        let mut nonce_bytes = [0u8; NONCE_LEN];
        SystemRandom::new()
            .fill(&mut nonce_bytes)
            .map_err(|_| "Failed to generate nonce".to_string())?;

        let mut buffer = plaintext.to_vec();
        self.key
            .seal_in_place_append_tag(
                Nonce::assume_unique_for_key(nonce_bytes),
                Aad::empty(),
                &mut buffer,
            )
            .map_err(|e| format!("Encrypt failed: {e}"))?;

        let mut out = Vec::with_capacity(ENVELOPE_HEADER_LEN + buffer.len());
        out.extend_from_slice(&ENVELOPE_MAGIC);
        out.push(ENVELOPE_VERSION_ENCRYPTED);
        out.extend_from_slice(&self.key_version.to_le_bytes());
        out.extend_from_slice(&nonce_bytes);
        out.extend_from_slice(&buffer);
        Ok(out)
    }

    pub fn decrypt(&self, envelope: &[u8]) -> Result<Vec<u8>, String> {
        let (key_version, nonce, ciphertext) = parse_envelope(envelope)?;
        if key_version != self.key_version {
            return Err(format!(
                "Unexpected key version {key_version}, expected {}",
                self.key_version
            ));
        }

        let mut buffer = ciphertext.to_vec();
        let plain = self
            .key
            .open_in_place(
                Nonce::assume_unique_for_key(nonce),
                Aad::empty(),
                &mut buffer,
            )
            .map_err(|e| format!("Decrypt failed: {e}"))?;
        Ok(plain.to_vec())
    }
}

#[derive(Clone)]
pub struct ChannelCipherSet {
    current: ChannelCipher,
    previous: HashMap<u32, ChannelCipher>,
}

impl ChannelCipherSet {
    pub fn new(
        workspace_key: &[u8],
        workspace_id: &str,
        channel: &str,
        key_version: u32,
    ) -> Result<Self, String> {
        Ok(Self {
            current: ChannelCipher::derive(workspace_key, workspace_id, channel, key_version)?,
            previous: HashMap::new(),
        })
    }

    pub fn rotate(
        &mut self,
        workspace_key: &[u8],
        workspace_id: &str,
        channel: &str,
        new_key_version: u32,
    ) -> Result<(), String> {
        if new_key_version == self.current.key_version() {
            return Ok(());
        }

        let previous_cipher = self.current.clone();
        self.previous.insert(previous_cipher.key_version(), previous_cipher);

        self.current = ChannelCipher::derive(workspace_key, workspace_id, channel, new_key_version)?;

        self.previous
            .retain(|version, _| *version + 2 >= new_key_version);
        Ok(())
    }

    pub fn encrypt(&self, plaintext: &[u8]) -> Result<Vec<u8>, String> {
        self.current.encrypt(plaintext)
    }

    pub fn decrypt(&self, envelope: &[u8]) -> Result<Vec<u8>, String> {
        let (key_version, _, _) = parse_envelope(envelope)?;
        if self.current.key_version() == key_version {
            return self.current.decrypt(envelope);
        }
        if let Some(previous) = self.previous.get(&key_version) {
            return previous.decrypt(envelope);
        }
        Err(format!("Unknown key version: {key_version}"))
    }

    pub fn current_key_version(&self) -> u32 {
        self.current.key_version()
    }
}

pub fn derive_pairwise_bootstrap_key(local_device_id: &str, peer_device_id: &str) -> [u8; 32] {
    let (left, right) = if local_device_id < peer_device_id {
        (local_device_id, peer_device_id)
    } else {
        (peer_device_id, local_device_id)
    };

    let salt = Salt::new(HKDF_SHA256, b"toolman-p2p-pairwise-bootstrap");
    let ikm = format!("{left}:{right}");
    let prk = salt.extract(ikm.as_bytes());
    let mut key = [0u8; WORKSPACE_KEY_LEN];
    prk.expand(&[b"workspace-key"], HKDF_SHA256)
        .expect("pairwise bootstrap HKDF expand")
        .fill(&mut key)
        .expect("pairwise bootstrap key length");
    key
}

fn parse_envelope(envelope: &[u8]) -> Result<(u32, [u8; NONCE_LEN], &[u8]), String> {
    if envelope.len() < ENVELOPE_HEADER_LEN + TAG_LEN {
        return Err("Encrypted envelope too short".to_string());
    }
    if envelope[0..2] != ENVELOPE_MAGIC {
        return Err("Invalid encrypted envelope magic".to_string());
    }
    if envelope[2] != ENVELOPE_VERSION_ENCRYPTED {
        return Err(format!("Unsupported envelope version {}", envelope[2]));
    }

    let key_version = u32::from_le_bytes(
        envelope[3..7]
            .try_into()
            .map_err(|_| "Invalid key version".to_string())?,
    );
    let mut nonce = [0u8; NONCE_LEN];
    nonce.copy_from_slice(&envelope[7..7 + NONCE_LEN]);
    let ciphertext = &envelope[ENVELOPE_HEADER_LEN..];
    Ok((key_version, nonce, ciphertext))
}

pub fn is_encrypted_envelope(data: &[u8]) -> bool {
    data.len() >= ENVELOPE_HEADER_LEN + TAG_LEN
        && data.starts_with(&ENVELOPE_MAGIC)
        && data[2] == ENVELOPE_VERSION_ENCRYPTED
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encrypt_decrypt_round_trip() {
        let workspace_key = [7u8; WORKSPACE_KEY_LEN];
        let cipher =
            ChannelCipher::derive(&workspace_key, "ws-1", "events", 1).expect("derive");
        let encrypted = cipher.encrypt(b"hello encrypted").expect("encrypt");
        let decrypted = cipher.decrypt(&encrypted).expect("decrypt");
        assert_eq!(decrypted, b"hello encrypted");
    }

    #[test]
    fn key_rotation_keeps_old_messages_readable() {
        let workspace_key_v1 = [1u8; WORKSPACE_KEY_LEN];
        let workspace_key_v2 = [2u8; WORKSPACE_KEY_LEN];
        let mut set =
            ChannelCipherSet::new(&workspace_key_v1, "ws-1", "events", 1).expect("new set");
        let old_message = set.encrypt(b"old").expect("encrypt old");

        set.rotate(&workspace_key_v2, "ws-1", "events", 2)
            .expect("rotate");
        let new_message = set.encrypt(b"new").expect("encrypt new");

        assert_eq!(set.decrypt(&old_message).expect("decrypt old"), b"old");
        assert_eq!(set.decrypt(&new_message).expect("decrypt new"), b"new");
    }

    #[test]
    fn pairwise_bootstrap_is_deterministic() {
        let key_ab = derive_pairwise_bootstrap_key("device-a", "device-b");
        let key_ba = derive_pairwise_bootstrap_key("device-b", "device-a");
        assert_eq!(key_ab, key_ba);
        assert_ne!(key_ab, derive_pairwise_bootstrap_key("device-a", "device-c"));
    }

    #[test]
    fn encrypted_envelope_detection() {
        let workspace_key = [9u8; WORKSPACE_KEY_LEN];
        let cipher =
            ChannelCipher::derive(&workspace_key, "ws-1", "events", 1).expect("derive");
        let encrypted = cipher.encrypt(b"payload").expect("encrypt");
        assert!(is_encrypted_envelope(&encrypted));
        assert!(!is_encrypted_envelope(b"plain"));
    }
}
