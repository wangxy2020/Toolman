use std::fs;
use std::path::Path;

use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use chrono::{TimeZone, Utc};
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::Sha256;
use thiserror::Error;

type HmacSha256 = Hmac<Sha256>;

/// 编译进二进制的签发密钥（仅授权方持有对应私钥流程；客户侧只验签）
const LICENSE_SIGNING_SECRET: &[u8] = b"CherryStudio-EPC-Commercial-v1-CHANGE-IN-PRODUCTION";

#[derive(Debug, Error)]
pub enum LicenseError {
    #[error("AUTH_EXPIRED: {0}")]
    Expired(String),
    #[error("AUTH_EXPIRED: 未找到 license.key")]
    Missing,
    #[error("AUTH_EXPIRED: {0}")]
    Invalid(String),
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LicensePayload {
    pub machine_id: String,
    /// Unix 秒
    pub expires_at: i64,
}

#[derive(Debug, Serialize, Deserialize)]
struct LicenseFile {
    payload_b64: String,
    signature_b64: String,
}

/// 读取本机机器码（Mac 优先 hardware UUID）
pub fn get_machine_id() -> String {
    machine_uid::get()
        .map(|id| format!("MACHINE-{id}"))
        .unwrap_or_else(|_| "MACHINE-UNKNOWN".to_string())
}

/// 离线校验 license.key：签名、机器码绑定、到期时间
pub fn verify_license(license_path: &Path) -> Result<LicensePayload, LicenseError> {
    if std::env::var("EPC_COMMERCIAL_DEV_SKIP_LICENSE").ok().as_deref() == Some("1") {
        return Ok(LicensePayload {
            machine_id: get_machine_id(),
            expires_at: i64::MAX / 2,
        });
    }

    let raw = fs::read_to_string(license_path).map_err(|_| LicenseError::Missing)?;
    let file: LicenseFile =
        serde_json::from_str(&raw).map_err(|e| LicenseError::Invalid(format!("解析失败: {e}")))?;

    let payload_bytes = B64
        .decode(file.payload_b64.trim())
        .map_err(|e| LicenseError::Invalid(format!("payload Base64: {e}")))?;
    let signature = B64
        .decode(file.signature_b64.trim())
        .map_err(|e| LicenseError::Invalid(format!("signature Base64: {e}")))?;

    let mut mac = HmacSha256::new_from_slice(LICENSE_SIGNING_SECRET)
        .map_err(|e| LicenseError::Invalid(e.to_string()))?;
    mac.update(&payload_bytes);
    mac.verify_slice(&signature)
        .map_err(|_| LicenseError::Invalid("签名校验失败".into()))?;

    let payload: LicensePayload = serde_json::from_slice(&payload_bytes)
        .map_err(|e| LicenseError::Invalid(format!("payload JSON: {e}")))?;

    let current_machine = get_machine_id();
    if payload.machine_id != current_machine {
        return Err(LicenseError::Invalid(format!(
            "机器码不匹配（当前 {current_machine}）"
        )));
    }

    let now = Utc::now().timestamp();
    if now > payload.expires_at {
        let exp = Utc
            .timestamp_opt(payload.expires_at, 0)
            .single()
            .map(|t| t.to_rfc3339())
            .unwrap_or_else(|| payload.expires_at.to_string());
        return Err(LicenseError::Expired(format!("授权已于 {exp} 过期")));
    }

    Ok(payload)
}

/// 供授权方离线生成 license.key（开发/运维脚本可调用同逻辑）
pub fn sign_license_payload(payload: &LicensePayload) -> Result<String, String> {
    let payload_bytes =
        serde_json::to_vec(payload).map_err(|e| format!("序列化 payload 失败: {e}"))?;
    let mut mac = HmacSha256::new_from_slice(LICENSE_SIGNING_SECRET).map_err(|e| e.to_string())?;
    mac.update(&payload_bytes);
    let signature = mac.finalize().into_bytes();

    let file = LicenseFile {
        payload_b64: B64.encode(payload_bytes),
        signature_b64: B64.encode(signature),
    };
    serde_json::to_string_pretty(&file).map_err(|e| e.to_string())
}
