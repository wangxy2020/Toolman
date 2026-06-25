use std::fs;
use std::path::Path;
use std::sync::OnceLock;

use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use ring::rand::SystemRandom;
use ring::signature::{Ed25519KeyPair, KeyPair};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use super::federation_service::FederationCatalogEntry;

const SIGNING_FILE: &str = "federation-signing.json";
const TOOLMAN_DID_PREFIX: &str = "did:toolman:v1:";

#[derive(Debug, Clone, Serialize, Deserialize)]
struct StoredFederationSigningIdentity {
    device_id: String,
    public_key_b64: String,
    pkcs8_b64: String,
}

struct FederationSigningIdentity {
    device_id: String,
    public_key_b64: String,
    signer_did: String,
    key_pair: Ed25519KeyPair,
}

static SIGNING_CACHE: OnceLock<FederationSigningIdentity> = OnceLock::new();

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FederatedCatalogAuthorWire {
    pub id: String,
    pub display_name: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FederatedResourceCatalogEntryWire {
    pub id: String,
    pub title: String,
    pub description: String,
    pub author: FederatedCatalogAuthorWire,
    pub version: String,
    pub tags: Vec<String>,
    pub category: String,
    pub resource_type: String,
    pub resource_size: i64,
    pub root_cid: String,
    pub license: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FederatedCatalogWireMessage {
    pub v: u8,
    pub entry: FederatedResourceCatalogEntryWire,
    pub signer_did: String,
    pub public_key: String,
    pub device_id: String,
    pub at: i64,
    pub signature: String,
}

pub fn build_federated_catalog_signed_payload(entry: &FederatedResourceCatalogEntryWire) -> String {
    let tag_summary = entry.tags.join(",");
    format!(
        "toolman:federation-catalog:v1|{}|{}|{}|{}|{}|{}|{}",
        entry.id,
        entry.resource_type,
        entry.version,
        entry.root_cid,
        entry.title,
        entry.updated_at,
        tag_summary
    )
}

fn derive_did_from_public_key_b64(public_key_b64: &str) -> Result<String, String> {
    let key_bytes = BASE64
        .decode(public_key_b64.trim())
        .map_err(|error| format!("Invalid federation public key: {error}"))?;
    let hash_hex = hex::encode(Sha256::digest(&key_bytes));
    let hash_bytes = hex::decode(hash_hex).map_err(|error| format!("Invalid hash: {error}"))?;
    Ok(format!("{TOOLMAN_DID_PREFIX}{}", bs58::encode(hash_bytes).into_string()))
}

fn load_or_create_identity(data_dir: &Path) -> Result<FederationSigningIdentity, String> {
    let path = data_dir.join(SIGNING_FILE);
    let stored = if path.exists() {
        let raw = fs::read_to_string(&path).map_err(|error| error.to_string())?;
        serde_json::from_str::<StoredFederationSigningIdentity>(&raw)
            .map_err(|error| format!("Invalid {SIGNING_FILE}: {error}"))?
    } else {
        let rng = SystemRandom::new();
        let pkcs8 = Ed25519KeyPair::generate_pkcs8(&rng)
            .map_err(|_| "Failed to generate federation signing key".to_string())?;
        let key_pair = Ed25519KeyPair::from_pkcs8(pkcs8.as_ref())
            .map_err(|_| "Generated federation signing key is invalid".to_string())?;
        let public_key_b64 = BASE64.encode(key_pair.public_key().as_ref());
        let created = StoredFederationSigningIdentity {
            device_id: Uuid::new_v4().to_string(),
            public_key_b64,
            pkcs8_b64: BASE64.encode(pkcs8.as_ref()),
        };
        fs::write(&path, serde_json::to_string_pretty(&created).map_err(|error| error.to_string())?)
            .map_err(|error| error.to_string())?;
        created
    };

    let pkcs8 = BASE64
        .decode(stored.pkcs8_b64.as_bytes())
        .map_err(|error| format!("Invalid federation signing pkcs8: {error}"))?;
    let key_pair = Ed25519KeyPair::from_pkcs8(pkcs8.as_ref())
        .map_err(|_| "Stored federation signing key is invalid".to_string())?;
    let signer_did = derive_did_from_public_key_b64(&stored.public_key_b64)?;

    Ok(FederationSigningIdentity {
        device_id: stored.device_id,
        public_key_b64: stored.public_key_b64,
        signer_did,
        key_pair,
    })
}

fn get_signing_identity(data_dir: &Path) -> Result<&'static FederationSigningIdentity, String> {
    if let Some(identity) = SIGNING_CACHE.get() {
        return Ok(identity);
    }
    let identity = load_or_create_identity(data_dir)?;
    SIGNING_CACHE
        .set(identity)
        .map_err(|_| "federation signing identity already initialized".to_string())?;
    SIGNING_CACHE
        .get()
        .ok_or_else(|| "federation signing identity unavailable".to_string())
}

fn to_wire_entry(entry: &FederationCatalogEntry) -> FederatedResourceCatalogEntryWire {
    FederatedResourceCatalogEntryWire {
        id: entry.id.clone(),
        title: entry.title.clone(),
        description: entry.description.clone(),
        author: FederatedCatalogAuthorWire {
            id: entry.author.id.clone(),
            display_name: entry.author.display_name.clone(),
        },
        version: entry.version.clone(),
        tags: entry.tags.clone(),
        category: entry.category.clone(),
        resource_type: entry.resource_type.clone(),
        resource_size: entry.resource_size,
        root_cid: entry.root_cid.clone(),
        license: entry.license.clone(),
        created_at: entry.created_at,
        updated_at: entry.updated_at,
    }
}

pub fn sign_federation_catalog_entry(
    data_dir: &Path,
    entry: &FederationCatalogEntry,
) -> Result<FederatedCatalogWireMessage, String> {
    let identity = get_signing_identity(data_dir)?;
    let wire_entry = to_wire_entry(entry);
    let payload = build_federated_catalog_signed_payload(&wire_entry);
    let signature = BASE64.encode(identity.key_pair.sign(payload.as_bytes()).as_ref());
    let at = chrono::Utc::now().timestamp_millis();

    Ok(FederatedCatalogWireMessage {
        v: 1,
        entry: wire_entry,
        signer_did: identity.signer_did.clone(),
        public_key: identity.public_key_b64.clone(),
        device_id: identity.device_id.clone(),
        at,
        signature,
    })
}

#[cfg(test)]
mod tests {
    use ring::signature::ED25519;

    use super::*;
    use crate::services::federation_service::FederationAuthorSummary;

    #[test]
    fn signed_payload_matches_desktop_format() {
        let entry = FederatedResourceCatalogEntryWire {
            id: "11111111-1111-4111-8111-111111111111".into(),
            title: "Peer MCP".into(),
            description: String::new(),
            author: FederatedCatalogAuthorWire {
                id: "22222222-2222-4222-8222-222222222222".into(),
                display_name: "Admin".into(),
            },
            version: "1.0.0".into(),
            tags: vec!["tools".into()],
            category: "dev".into(),
            resource_type: "mcp".into(),
            resource_size: 128,
            root_cid: "toolman:sha256:abc123".into(),
            license: "MIT".into(),
            created_at: 1_700_000_000_000,
            updated_at: 1_700_000_000_100,
        };

        assert_eq!(
            build_federated_catalog_signed_payload(&entry),
            "toolman:federation-catalog:v1|11111111-1111-4111-8111-111111111111|mcp|1.0.0|toolman:sha256:abc123|Peer MCP|1700000000100|tools"
        );
    }

    #[test]
    fn signs_catalog_entry_with_persistent_identity() {
        let data_dir = std::env::temp_dir().join(format!("toolman-hub-sign-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&data_dir).expect("data dir");

        let catalog_entry = FederationCatalogEntry {
            id: "11111111-1111-4111-8111-111111111111".into(),
            title: "Peer MCP".into(),
            description: String::new(),
            author: FederationAuthorSummary {
                id: "22222222-2222-4222-8222-222222222222".into(),
                display_name: "Admin".into(),
            },
            version: "1.0.0".into(),
            tags: vec!["tools".into()],
            category: "dev".into(),
            resource_type: "mcp".into(),
            resource_size: 128,
            root_cid: "toolman:sha256:abc123".into(),
            license: "MIT".into(),
            created_at: 1_700_000_000_000,
            updated_at: 1_700_000_000_100,
        };

        let wire = sign_federation_catalog_entry(&data_dir, &catalog_entry).expect("sign");
        assert_eq!(wire.v, 1);
        assert_eq!(wire.entry.title, "Peer MCP");
        assert!(!wire.signature.is_empty());

        let public_key = BASE64.decode(wire.public_key.as_bytes()).expect("public key");
        let signature = BASE64.decode(wire.signature.as_bytes()).expect("signature");
        let payload = build_federated_catalog_signed_payload(&wire.entry);
        let verifier = ring::signature::UnparsedPublicKey::new(&ED25519, &public_key);
        verifier
            .verify(payload.as_bytes(), &signature)
            .expect("signature verify");

        let _ = std::fs::remove_dir_all(data_dir);
    }
}
