use napi_derive::napi;

use crate::pubsub::SwarmCommand;
use crate::pubsub_state::drain_pubsub_messages;
use crate::send_swarm_command;

#[napi(object)]
pub struct NapiPubsubMessage {
    pub topic: String,
    pub data: napi::bindgen_prelude::Buffer,
    #[napi(js_name = "fromPeerId")]
    pub from_peer_id: String,
    #[napi(js_name = "receivedAt")]
    pub received_at: f64,
}

#[napi(object)]
pub struct NapiPubsubDrainResult {
    pub messages: Vec<NapiPubsubMessage>,
}

#[napi]
pub fn pubsub_subscribe(topic: String) -> napi::Result<()> {
    send_swarm_command(SwarmCommand::PubsubSubscribe(topic))
}

#[napi]
pub fn pubsub_unsubscribe(topic: String) -> napi::Result<()> {
    send_swarm_command(SwarmCommand::PubsubUnsubscribe(topic))
}

#[napi]
pub fn pubsub_publish(topic: String, data: napi::bindgen_prelude::Buffer) -> napi::Result<()> {
    send_swarm_command(SwarmCommand::PubsubPublish {
        topic,
        data: data.to_vec(),
    })
}

#[napi]
pub fn pubsub_drain_messages() -> napi::Result<NapiPubsubDrainResult> {
    Ok(NapiPubsubDrainResult {
        messages: drain_pubsub_messages()
            .into_iter()
            .map(|message| NapiPubsubMessage {
                topic: message.topic,
                data: message.data.into(),
                from_peer_id: message.from_peer_id,
                received_at: message.received_at_ms as f64,
            })
            .collect(),
    })
}
