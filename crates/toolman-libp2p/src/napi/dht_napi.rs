use napi_derive::napi;

use crate::dht_state::drain_provider_results;
use crate::pubsub::SwarmCommand;
use crate::send_swarm_command;

#[napi(object)]
pub struct NapiDhtProviderResult {
    pub cid: String,
    pub providers: Vec<String>,
    pub completed: bool,
    pub error: Option<String>,
    pub at: f64,
}

#[napi(object)]
pub struct NapiDhtDrainProvidersResult {
    pub results: Vec<NapiDhtProviderResult>,
}

#[napi]
pub fn dht_provide(cid: String) -> napi::Result<()> {
    send_swarm_command(SwarmCommand::DhtProvide(cid))
}

#[napi]
pub fn dht_get_providers(cid: String) -> napi::Result<()> {
    send_swarm_command(SwarmCommand::DhtGetProviders(cid))
}

#[napi]
pub fn dht_drain_provider_results() -> napi::Result<NapiDhtDrainProvidersResult> {
    Ok(NapiDhtDrainProvidersResult {
        results: drain_provider_results()
            .into_iter()
            .map(|result| NapiDhtProviderResult {
                cid: result.cid,
                providers: result.providers,
                completed: result.completed,
                error: result.error,
                at: result.at_ms as f64,
            })
            .collect(),
    })
}
