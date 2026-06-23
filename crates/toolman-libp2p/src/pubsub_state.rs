use std::sync::{Arc, RwLock};

#[derive(Clone, Debug)]
pub struct PubsubInboxMessage {
    pub topic: String,
    pub data: Vec<u8>,
    pub from_peer_id: String,
    pub received_at_ms: u64,
}

static PUBSUB_INBOX: once_cell::sync::Lazy<Arc<RwLock<Vec<PubsubInboxMessage>>>> =
    once_cell::sync::Lazy::new(|| Arc::new(RwLock::new(Vec::new())));

pub fn push_pubsub_message(message: PubsubInboxMessage) {
    if let Ok(mut guard) = PUBSUB_INBOX.write() {
        guard.push(message);
        if guard.len() > 500 {
            let drain_to = guard.len() - 500;
            guard.drain(0..drain_to);
        }
    }
}

pub fn drain_pubsub_messages() -> Vec<PubsubInboxMessage> {
    PUBSUB_INBOX
        .write()
        .map(|mut guard| std::mem::take(&mut *guard))
        .unwrap_or_default()
}
