use std::collections::HashMap;

const CHUNK_SIZE: usize = 200;

#[derive(Clone, Debug)]
pub struct SignalMessage {
    pub target_device_id: String,
    pub signal_type: String,
    pub sdp: String,
    pub nonce: String,
}

pub fn publish_signal(
    target_device_id: &str,
    signal_type: &str,
    sdp: &str,
    nonce: &str,
) -> HashMap<String, String> {
    let chunks = chunk_text(sdp);
    let mut props = HashMap::from([
        ("sig_target".to_string(), target_device_id.to_string()),
        ("sig_type".to_string(), signal_type.to_string()),
        ("sig_nonce".to_string(), nonce.to_string()),
        ("sig_parts".to_string(), chunks.len().to_string()),
    ]);
    for (index, chunk) in chunks.into_iter().enumerate() {
        props.insert(format!("sig_{index}"), chunk);
    }
    props
}

pub fn clear_signaling_properties() -> HashMap<String, String> {
    HashMap::from([
        ("sig_target".to_string(), String::new()),
        ("sig_type".to_string(), String::new()),
        ("sig_nonce".to_string(), String::new()),
        ("sig_parts".to_string(), "0".to_string()),
    ])
}

pub fn parse_signal(
    _from_device_id: &str,
    properties: &HashMap<String, String>,
) -> Option<SignalMessage> {
    let target_device_id = properties.get("sig_target")?.trim();
    let signal_type = properties.get("sig_type")?.trim();
    let nonce = properties.get("sig_nonce")?.trim();
    if target_device_id.is_empty() || signal_type.is_empty() || nonce.is_empty() {
        return None;
    }

    let parts = properties.get("sig_parts")?.parse::<usize>().ok()?;
    if parts == 0 {
        return None;
    }

    let mut sdp = String::new();
    for index in 0..parts {
        sdp.push_str(properties.get(&format!("sig_{index}"))?);
    }
    if sdp.is_empty() {
        return None;
    }

    Some(SignalMessage {
        target_device_id: target_device_id.to_string(),
        signal_type: signal_type.to_string(),
        sdp,
        nonce: nonce.to_string(),
    })
}

fn chunk_text(value: &str) -> Vec<String> {
    value
        .as_bytes()
        .chunks(CHUNK_SIZE)
        .map(|chunk| String::from_utf8_lossy(chunk).into_owned())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip_signal() {
        let sdp = "v=0\r\n".repeat(40);
        let props = publish_signal("peer-b", "offer", &sdp, "nonce-1");
        let parsed = parse_signal("peer-a", &props).expect("signal");
        assert_eq!(parsed.target_device_id, "peer-b");
        assert_eq!(parsed.signal_type, "offer");
        assert_eq!(parsed.sdp, sdp);
    }
}
