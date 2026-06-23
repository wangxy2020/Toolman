use crate::config::HubConfig;

#[derive(Debug, Clone)]
pub struct EmbeddingService {
    enabled: bool,
    provider_url: Option<String>,
}

impl EmbeddingService {
    pub fn from_config(config: &HubConfig) -> Self {
        Self {
            enabled: config.semantic_search_enabled,
            provider_url: config.embedding_provider_url.clone(),
        }
    }

    pub fn is_enabled(&self) -> bool {
        self.enabled
    }

    pub fn status_label(&self) -> &'static str {
        if self.enabled {
            "enabled"
        } else {
            "disabled"
        }
    }

    pub fn provider_url(&self) -> Option<&str> {
        self.provider_url.as_deref()
    }
}
