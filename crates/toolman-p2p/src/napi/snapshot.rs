use napi_derive::napi;

use crate::event::{compress_json, decompress_json, hash_json};

#[napi]
pub fn snapshot_compress(json: String) -> napi::Result<napi::bindgen_prelude::Buffer> {
    let compressed = compress_json(&json).map_err(napi::Error::from_reason)?;
    Ok(napi::bindgen_prelude::Buffer::from(compressed))
}

#[napi]
pub fn snapshot_decompress(data: napi::bindgen_prelude::Buffer) -> napi::Result<String> {
    decompress_json(data.as_ref()).map_err(napi::Error::from_reason)
}

#[napi]
pub fn snapshot_hash(json: String) -> napi::Result<String> {
    Ok(hash_json(&json))
}

#[napi]
pub fn snapshot_interval() -> napi::Result<f64> {
    Ok(crate::event::SNAPSHOT_INTERVAL as f64)
}
