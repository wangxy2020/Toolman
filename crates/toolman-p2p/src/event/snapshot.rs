use sha2::{Digest, Sha256};

pub const SNAPSHOT_INTERVAL: u64 = 500;
pub const SNAPSHOT_RETAIN_COUNT: usize = 3;

pub fn compress_json(json: &str) -> Result<Vec<u8>, String> {
    zstd::encode_all(json.as_bytes(), 3).map_err(|error| error.to_string())
}

pub fn decompress_json(data: &[u8]) -> Result<String, String> {
    let bytes = zstd::decode_all(data).map_err(|error| error.to_string())?;
    String::from_utf8(bytes).map_err(|error| error.to_string())
}

pub fn hash_json(json: &str) -> String {
    let digest = Sha256::digest(json.as_bytes());
    digest.iter().map(|byte| format!("{byte:02x}")).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compress_round_trip() {
        let json = r#"{"snapshotSeq":500,"workspaceId":"ws-1"}"#;
        let compressed = compress_json(json).expect("compress");
        let restored = decompress_json(&compressed).expect("decompress");
        assert_eq!(restored, json);
    }

    #[test]
    fn hash_is_stable() {
        let json = r#"{"snapshotSeq":1}"#;
        assert_eq!(hash_json(json).len(), 64);
        assert_eq!(hash_json(json), hash_json(json));
    }

    #[test]
    fn snapshot_constants_are_sane() {
        assert!(SNAPSHOT_INTERVAL >= 100);
        assert!(SNAPSHOT_RETAIN_COUNT >= 1);
    }
}
