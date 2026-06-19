use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::SocketAddr;
use std::time::Duration;

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use flate2::read::GzDecoder;
use flate2::write::GzEncoder;
use flate2::Compression;

const UDP_MAGIC: &[u8] = b"TMANS";
const WAN_PAYLOAD_PREFIX: &str = "z1.";
const WAN_RAW_PAYLOAD_PREFIX: &str = "r1.";
const WAN_COMPRESSED_SDP_TARGET_BYTES: usize = 150;

const WAN_SDP_KEEP_PREFIXES: &[&str] = &[
    "v=0",
    "o=",
    "s=",
    "t=",
    "a=group:",
    "m=application",
    "a=setup:",
    "a=mid:",
    "a=ice-ufrag:",
    "a=ice-pwd:",
    "a=fingerprint:",
    "a=sctp",
    "a=max-message",
    "a=toolman-sig:",
    "a=candidate:",
    "a=end-of-candidates",
];

pub fn filter_wan_sdp_media(sdp: &str) -> String {
    let normalized = sdp.replace("\r\n", "\n").replace('\r', "\n");
    let mut kept = Vec::new();
    let mut skipping = false;

    for line in normalized.lines() {
        if line.starts_with("m=audio") || line.starts_with("m=video") {
            skipping = true;
            continue;
        }
        if line.starts_with("m=") {
            skipping = false;
        }
        if !skipping {
            kept.push(line);
        }
    }

    let mut out = kept.join("\r\n");
    if !out.ends_with("\r\n") {
        out.push_str("\r\n");
    }
    out
}

fn gzip_compress_wan_payload(data: &[u8]) -> Result<Vec<u8>, String> {
    let mut encoder = GzEncoder::new(Vec::new(), Compression::best());
    encoder
        .write_all(data)
        .map_err(|error| format!("Failed to gzip WAN payload: {error}"))?;
    encoder
        .finish()
        .map_err(|error| format!("Failed to finish WAN gzip payload: {error}"))
}

fn gzip_decompress_wan_payload(data: &[u8]) -> Result<Vec<u8>, String> {
    let mut decoder = GzDecoder::new(data);
    let mut out = Vec::new();
    decoder
        .read_to_end(&mut out)
        .map_err(|error| format!("Failed to gunzip WAN payload: {error}"))?;
    Ok(out)
}

pub fn minify_wan_sdp_essentials(sdp: &str) -> String {
    let filtered = filter_wan_sdp_media(sdp);
    let kept: Vec<&str> = filtered
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .filter(|line| WAN_SDP_KEEP_PREFIXES.iter().any(|prefix| line.starts_with(prefix)))
        .collect();
    let mut out = kept.join("\r\n");
    if !out.ends_with("\r\n") {
        out.push_str("\r\n");
    }
    out
}

fn encode_wan_blob(data: &[u8]) -> Result<String, String> {
    let compressed = gzip_compress_wan_payload(data)?;
    if compressed.len() < data.len() {
        return Ok(format!(
            "{WAN_PAYLOAD_PREFIX}{}",
            URL_SAFE_NO_PAD.encode(compressed)
        ));
    }
    Ok(format!(
        "{WAN_RAW_PAYLOAD_PREFIX}{}",
        URL_SAFE_NO_PAD.encode(data)
    ))
}

fn decode_wan_blob(encoded: &str) -> Result<Vec<u8>, String> {
    let trimmed = encoded.trim();
    if let Some(rest) = trimmed.strip_prefix(WAN_PAYLOAD_PREFIX) {
        let bytes = URL_SAFE_NO_PAD
            .decode(rest)
            .map_err(|error| format!("Invalid WAN payload encoding: {error}"))?;
        return gzip_decompress_wan_payload(&bytes);
    }
    if let Some(rest) = trimmed.strip_prefix(WAN_RAW_PAYLOAD_PREFIX) {
        return URL_SAFE_NO_PAD
            .decode(rest)
            .map_err(|error| format!("Invalid WAN payload encoding: {error}"));
    }

    if trimmed.starts_with("v=0") {
        return Ok(trimmed.as_bytes().to_vec());
    }

    URL_SAFE_NO_PAD
        .decode(trimmed)
        .map_err(|error| format!("Invalid invite SDP encoding: {error}"))
}

fn trim_sdp_candidates(sdp: &str, max_candidates: usize) -> String {
    let mut kept = Vec::new();
    let mut kept_candidates = 0usize;

    for line in sdp.split("\r\n") {
        let trimmed = line.trim();
        if trimmed.starts_with("a=candidate:") {
            let parts: Vec<&str> = trimmed.split_whitespace().collect();
            let candidate_type = parts.get(7).copied().unwrap_or("");
            if candidate_type == "relay" {
                continue;
            }
            if kept_candidates >= max_candidates {
                continue;
            }
            kept_candidates += 1;
        }
        kept.push(line);
    }

    let mut out = kept.join("\r\n");
    if !out.ends_with("\r\n") {
        out.push_str("\r\n");
    }
    out
}

fn count_candidate_lines(sdp: &str) -> usize {
    sdp.lines()
        .filter(|line| line.trim().starts_with("a=candidate:"))
        .count()
}

fn fit_encoded_payload_budget<F>(build_payload: F, initial_candidates: usize) -> Result<String, String>
where
    F: Fn(usize) -> Vec<u8>,
{
    let mut best = encode_wan_blob(&build_payload(initial_candidates))?;
    let mut max_candidates = initial_candidates;

    while max_candidates > 0 {
        max_candidates -= 1;
        let encoded = encode_wan_blob(&build_payload(max_candidates))?;
        best = encoded;
        if best.len() <= WAN_COMPRESSED_SDP_TARGET_BYTES {
            return Ok(best);
        }
    }

    Ok(best)
}

pub fn encode_sdp_param(sdp: &str) -> String {
    let minified = minify_wan_sdp_essentials(sdp);
    let candidate_count = count_candidate_lines(&minified);
    fit_encoded_payload_budget(
        |max_candidates| {
            let trimmed = if max_candidates < candidate_count {
                trim_sdp_candidates(&minified, max_candidates)
            } else {
                minified.clone()
            };
            trimmed.into_bytes()
        },
        candidate_count,
    )
    .unwrap_or_else(|_| URL_SAFE_NO_PAD.encode(minified.as_bytes()))
}

pub fn decode_sdp_param(encoded: &str) -> Result<String, String> {
    let bytes = decode_wan_blob(encoded)?;
    let text = String::from_utf8(bytes).map_err(|error| format!("Invite SDP is not valid UTF-8: {error}"))?;
    if text.starts_with("v=0") {
        return Ok(text);
    }

    let legacy = URL_SAFE_NO_PAD
        .decode(encoded.trim())
        .map_err(|error| format!("Invalid invite SDP encoding: {error}"))?;
    String::from_utf8(legacy).map_err(|error| format!("Invite SDP is not valid UTF-8: {error}"))
}

pub fn parse_toolman_signal_port(sdp: &str) -> Option<u16> {
    for line in sdp.lines() {
        let trimmed = line.trim();
        if let Some(value) = trimmed.strip_prefix("a=toolman-sig:") {
            return value.parse::<u16>().ok();
        }
    }
    None
}

pub fn append_toolman_signal_port(sdp: &str, port: u16) -> String {
    format!("{sdp}a=toolman-sig:{port}\r\n")
}

pub fn parse_candidate_endpoints(sdp: &str) -> Vec<SocketAddr> {
    let mut endpoints = Vec::new();
    let signal_port = parse_toolman_signal_port(sdp);
    let mut srflx_ip: Option<String> = None;

    for line in sdp.lines() {
        let trimmed = line.trim();
        if !trimmed.starts_with("a=candidate:") {
            continue;
        }
        let parts: Vec<&str> = trimmed.split_whitespace().collect();
        if parts.len() < 8 {
            continue;
        }
        let Ok(port) = parts[2].parse::<u16>() else {
            continue;
        };
        let candidate_type = parts.get(7).copied().unwrap_or("");
        if candidate_type == "srflx" || candidate_type == "prflx" {
            srflx_ip = Some(parts[4].to_string());
        }
        if candidate_type != "host" && candidate_type != "srflx" && candidate_type != "prflx" {
            continue;
        }
        if let Ok(addr) = format!("{}:{}", parts[4], port).parse::<SocketAddr>() {
            endpoints.push(addr);
        }
    }

    if let (Some(port), Some(ip)) = (signal_port, srflx_ip) {
        if let Ok(addr) = format!("{ip}:{port}").parse::<SocketAddr>() {
            endpoints.push(addr);
        }
    }

    endpoints
}

pub fn build_udp_answer_packet(invite_id: &str, answer_sdp: &str) -> Vec<u8> {
    let invite_bytes = invite_id.as_bytes();
    let answer_bytes = answer_sdp.as_bytes();
    let mut packet = Vec::with_capacity(UDP_MAGIC.len() + 2 + invite_bytes.len() + 4 + answer_bytes.len());
    packet.extend_from_slice(UDP_MAGIC);
    packet.extend_from_slice(&(invite_bytes.len() as u16).to_be_bytes());
    packet.extend_from_slice(invite_bytes);
    packet.extend_from_slice(&(answer_bytes.len() as u32).to_be_bytes());
    packet.extend_from_slice(answer_bytes);
    packet
}

pub fn parse_udp_answer_packet(data: &[u8]) -> Option<(String, String)> {
    if data.len() < UDP_MAGIC.len() + 2 + 4 {
        return None;
    }
    if &data[..UDP_MAGIC.len()] != UDP_MAGIC {
        return None;
    }
    let mut offset = UDP_MAGIC.len();
    let invite_len = u16::from_be_bytes([data[offset], data[offset + 1]]) as usize;
    offset += 2;
    if data.len() < offset + invite_len + 4 {
        return None;
    }
    let invite_id = String::from_utf8(data[offset..offset + invite_len].to_vec()).ok()?;
    offset += invite_len;
    let answer_len = u32::from_be_bytes([
        data[offset],
        data[offset + 1],
        data[offset + 2],
        data[offset + 3],
    ]) as usize;
    offset += 4;
    if data.len() < offset + answer_len {
        return None;
    }
    let answer_sdp = String::from_utf8(data[offset..offset + answer_len].to_vec()).ok()?;
    Some((invite_id, answer_sdp))
}

pub async fn deliver_answer_via_udp(
    offer_sdp: &str,
    invite_id: &str,
    answer_sdp: &str,
) -> Result<(), String> {
    let packet = build_udp_answer_packet(invite_id, answer_sdp);
    let endpoints = parse_candidate_endpoints(offer_sdp);
    if endpoints.is_empty() {
        return Err("No ICE candidates found in invite offer".to_string());
    }

    let socket = tokio::net::UdpSocket::bind("0.0.0.0:0")
        .await
        .map_err(|error| format!("Failed to bind UDP socket: {error}"))?;

    for endpoint in endpoints {
        let _ = socket.send_to(&packet, endpoint).await;
    }
    Ok(())
}

pub async fn listen_for_udp_answers_on_socket(
    socket: tokio::net::UdpSocket,
    invite_id: String,
    timeout: Duration,
) -> Result<String, String> {
    let deadline = tokio::time::Instant::now() + timeout;
    let mut buffer = vec![0u8; 65_536];

    loop {
        let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
        if remaining.is_zero() {
            return Err("Timed out waiting for invite answer over UDP".to_string());
        }

        let read = tokio::time::timeout(remaining, socket.recv_from(&mut buffer))
            .await
            .map_err(|_| "Timed out waiting for invite answer over UDP".to_string())?
            .map_err(|error| format!("Invite answer listener failed: {error}"))?;

        if let Some((parsed_invite_id, answer_sdp)) = parse_udp_answer_packet(&buffer[..read.0]) {
            if parsed_invite_id == invite_id {
                return Ok(answer_sdp);
            }
        }
    }
}

pub async fn listen_for_udp_answers(
    invite_id: String,
    timeout: Duration,
) -> Result<String, String> {
    let socket = tokio::net::UdpSocket::bind("0.0.0.0:0")
        .await
        .map_err(|error| format!("Failed to bind invite answer listener: {error}"))?;
    let deadline = tokio::time::Instant::now() + timeout;
    let mut buffer = vec![0u8; 65_536];

    loop {
        let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
        if remaining.is_zero() {
            return Err("Timed out waiting for invite answer over UDP".to_string());
        }

        let read = tokio::time::timeout(remaining, socket.recv_from(&mut buffer))
            .await
            .map_err(|_| "Timed out waiting for invite answer over UDP".to_string())?
            .map_err(|error| format!("Invite answer listener failed: {error}"))?;

        if let Some((parsed_invite_id, answer_sdp)) = parse_udp_answer_packet(&buffer[..read.0]) {
            if parsed_invite_id == invite_id {
                return Ok(answer_sdp);
            }
        }
    }
}

pub fn publish_invite_answer_signal(
    target_device_id: &str,
    invite_id: &str,
    answer_sdp: &str,
) -> HashMap<String, String> {
    super::publish_signal(target_device_id, "answer", answer_sdp, invite_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sdp_round_trip() {
        let sdp = [
            "v=0\r\n",
            "m=audio 9 UDP/TLS/RTP/SAVPF 111\r\n",
            "a=rtpmap:111 opus/48000/2\r\n",
            "m=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n",
            "a=toolman-sig:41234\r\n",
            "a=candidate:1 1 udp 2130706431 192.168.1.2 50001 typ host\r\n",
        ]
        .concat();
        let encoded = encode_sdp_param(&sdp);
        assert!(encoded.starts_with(WAN_PAYLOAD_PREFIX) || encoded.starts_with(WAN_RAW_PAYLOAD_PREFIX));
        let decoded = decode_sdp_param(&encoded).expect("decode");
        assert!(decoded.contains("m=application"));
        assert!(!decoded.contains("m=audio"));
        assert!(encoded.len() <= WAN_COMPRESSED_SDP_TARGET_BYTES * 2);
    }

    #[test]
    fn udp_packet_round_trip() {
        let packet = build_udp_answer_packet("invite-123", "v=0\r\n");
        let (invite_id, answer) = parse_udp_answer_packet(&packet).expect("parse");
        assert_eq!(invite_id, "invite-123");
        assert_eq!(answer, "v=0\r\n");
    }
}
