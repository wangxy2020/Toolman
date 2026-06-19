use napi_derive::napi;
use once_cell::sync::Lazy;
use std::path::PathBuf;
use std::sync::Mutex;

use crate::event::{AppendEventInput, EventStore, WalEventRecord};

static EVENT_STORE: Lazy<Mutex<Option<EventStore>>> = Lazy::new(|| Mutex::new(None));

fn with_store<F, T>(callback: F) -> napi::Result<T>
where
    F: FnOnce(&EventStore) -> Result<T, String>,
{
    let guard = EVENT_STORE
        .lock()
        .map_err(|_| napi::Error::from_reason("event store lock poisoned"))?;
    let store = guard
        .as_ref()
        .ok_or_else(|| napi::Error::from_reason("event store not initialized"))?;
    callback(store).map_err(napi::Error::from_reason)
}

#[napi(object)]
pub struct NapiAppendEventInput {
    #[napi(js_name = "resourceType")]
    pub resource_type: String,
    #[napi(js_name = "resourceId")]
    pub resource_id: String,
    #[napi(js_name = "operatorId")]
    pub operator_id: String,
    #[napi(js_name = "eventType")]
    pub event_type: String,
    #[napi(js_name = "payloadJson")]
    pub payload_json: String,
    #[napi(js_name = "sourceDeviceId")]
    pub source_device_id: String,
    pub timestamp: Option<f64>,
}

#[napi(object)]
pub struct NapiWalEventRecord {
    #[napi(js_name = "eventId")]
    pub event_id: String,
    #[napi(js_name = "workspaceId")]
    pub workspace_id: String,
    pub seq: f64,
    #[napi(js_name = "resourceType")]
    pub resource_type: String,
    #[napi(js_name = "resourceId")]
    pub resource_id: String,
    #[napi(js_name = "operatorId")]
    pub operator_id: String,
    #[napi(js_name = "eventType")]
    pub event_type: String,
    #[napi(js_name = "payloadJson")]
    pub payload_json: String,
    #[napi(js_name = "payloadHash")]
    pub payload_hash: String,
    #[napi(js_name = "prevEventHash")]
    pub prev_event_hash: Option<String>,
    #[napi(js_name = "eventHash")]
    pub event_hash: String,
    pub timestamp: f64,
    #[napi(js_name = "sourceDeviceId")]
    pub source_device_id: String,
}

fn to_napi_record(record: WalEventRecord) -> NapiWalEventRecord {
    NapiWalEventRecord {
        event_id: record.event_id,
        workspace_id: record.workspace_id,
        seq: record.seq as f64,
        resource_type: record.resource_type,
        resource_id: record.resource_id,
        operator_id: record.operator_id,
        event_type: record.event_type,
        payload_json: record.payload_json,
        payload_hash: record.payload_hash,
        prev_event_hash: record.prev_event_hash,
        event_hash: record.event_hash,
        timestamp: record.timestamp as f64,
        source_device_id: record.source_device_id,
    }
}

#[napi]
pub fn event_store_init(data_dir: String) -> napi::Result<()> {
    let mut guard = EVENT_STORE
        .lock()
        .map_err(|_| napi::Error::from_reason("event store lock poisoned"))?;
    *guard = Some(EventStore::new(PathBuf::from(data_dir)));
    Ok(())
}

#[napi]
pub fn event_store_append(
    workspace_id: String,
    input: NapiAppendEventInput,
) -> napi::Result<NapiWalEventRecord> {
    with_store(|store| {
        let record = store.append(AppendEventInput {
            workspace_id,
            resource_type: input.resource_type,
            resource_id: input.resource_id,
            operator_id: input.operator_id,
            event_type: input.event_type,
            payload_json: input.payload_json,
            source_device_id: input.source_device_id,
            timestamp: input.timestamp.map(|value| value as u64),
        })?;
        Ok(to_napi_record(record))
    })
}

#[napi]
pub fn event_store_list(
    workspace_id: String,
    since_seq: f64,
    limit: f64,
) -> napi::Result<Vec<NapiWalEventRecord>> {
    with_store(|store| {
        let records = store.list_since(
            &workspace_id,
            since_seq.max(0.0) as u64,
            limit.max(1.0) as usize,
        )?;
        Ok(records.into_iter().map(to_napi_record).collect())
    })
}
