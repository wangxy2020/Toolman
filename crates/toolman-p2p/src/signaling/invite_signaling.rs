use std::net::SocketAddr;
use std::time::Duration;

const UDP_MAGIC: &[u8] = b"TMANS";

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn udp_packet_round_trip() {
        let packet = build_udp_answer_packet("invite-123", "v=0\r\n");
        let (invite_id, answer) = parse_udp_answer_packet(&packet).expect("parse");
        assert_eq!(invite_id, "invite-123");
        assert_eq!(answer, "v=0\r\n");
    }
}
