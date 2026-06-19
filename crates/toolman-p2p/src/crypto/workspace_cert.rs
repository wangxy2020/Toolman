use base64::{engine::general_purpose::STANDARD, Engine};
use ring::rand::{SecureRandom, SystemRandom};
use ring::signature::{Ed25519KeyPair, KeyPair, UnparsedPublicKey, ED25519};

pub const WORKSPACE_MEMBER_CERT_VERSION: u8 = 1;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct WorkspaceMemberCert {
    pub version: u8,
    pub workspace_id: String,
    pub device_id: String,
    pub role: String,
    pub expires_at_ms: u64,
    pub key_version: u32,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SignedWorkspaceMemberCert {
    pub cert: WorkspaceMemberCert,
    pub signature_b64: String,
}

impl WorkspaceMemberCert {
    pub fn new(
        workspace_id: impl Into<String>,
        device_id: impl Into<String>,
        role: impl Into<String>,
        expires_at_ms: u64,
        key_version: u32,
    ) -> Self {
        Self {
            version: WORKSPACE_MEMBER_CERT_VERSION,
            workspace_id: workspace_id.into(),
            device_id: device_id.into(),
            role: role.into(),
            expires_at_ms,
            key_version,
        }
    }

    pub fn canonical_message(&self) -> String {
        format!(
            "toolman-workspace-cert|v{}|{}|{}|{}|{}|{}",
            self.version,
            self.workspace_id,
            self.device_id,
            self.role,
            self.expires_at_ms,
            self.key_version
        )
    }

    pub fn sign(&self, issuer_key: &Ed25519KeyPair) -> Result<SignedWorkspaceMemberCert, String> {
        let signature = issuer_key
            .sign(self.canonical_message().as_bytes())
            .as_ref()
            .to_vec();
        Ok(SignedWorkspaceMemberCert {
            cert: self.clone(),
            signature_b64: STANDARD.encode(signature),
        })
    }

    pub fn verify(
        &self,
        signature_b64: &str,
        issuer_public_key_b64: &str,
    ) -> Result<(), String> {
        let signature = STANDARD
            .decode(signature_b64)
            .map_err(|e| format!("Invalid certificate signature encoding: {e}"))?;
        let public_key = STANDARD
            .decode(issuer_public_key_b64)
            .map_err(|e| format!("Invalid issuer public key encoding: {e}"))?;
        let verifier = UnparsedPublicKey::new(&ED25519, &public_key);
        verifier
            .verify(self.canonical_message().as_bytes(), &signature)
            .map_err(|_| "Workspace member certificate signature invalid".to_string())
    }

    pub fn is_expired(&self, now_ms: u64) -> bool {
        now_ms >= self.expires_at_ms
    }
}

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

#[cfg(test)]
mod tests {
    use super::*;
    use ring::signature::Ed25519KeyPair;

    #[test]
    fn sign_and_verify_workspace_cert() {
        let rng = SystemRandom::new();
        let pkcs8 = Ed25519KeyPair::generate_pkcs8(&rng).expect("generate");
        let issuer = Ed25519KeyPair::from_pkcs8(pkcs8.as_ref()).expect("parse");
        let public_key_b64 = STANDARD.encode(issuer.public_key().as_ref());

        let cert = WorkspaceMemberCert::new("ws-1", "device-a", "member", 9_999_999_999, 1);
        let signed = cert.sign(&issuer).expect("sign");
        cert.verify(&signed.signature_b64, &public_key_b64)
            .expect("verify");
    }
}
