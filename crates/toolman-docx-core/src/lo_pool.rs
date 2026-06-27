use std::sync::OnceLock;

use tokio::sync::Semaphore;

fn max_concurrent_lo_jobs() -> usize {
    std::env::var("TOOLMAN_DOCX_LO_MAX_CONCURRENT")
        .ok()
        .and_then(|value| value.parse().ok())
        .filter(|value| *value > 0)
        .unwrap_or(2)
}

pub fn libreoffice_semaphore() -> &'static Semaphore {
    static SEM: OnceLock<Semaphore> = OnceLock::new();
    SEM.get_or_init(|| Semaphore::new(max_concurrent_lo_jobs()))
}
