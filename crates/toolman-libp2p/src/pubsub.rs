#[derive(Debug)]
pub enum SwarmCommand {
    PubsubSubscribe(String),
    PubsubUnsubscribe(String),
    PubsubPublish { topic: String, data: Vec<u8> },
    DhtProvide(String),
    DhtGetProviders(String),
}
