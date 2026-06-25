use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tracing::{info, warn};

pub const ENV_DATA_DIR: &str = "COMMUNITY_HUB_DATA_DIR";
pub const ENV_PORT: &str = "COMMUNITY_HUB_PORT";
pub const ENV_REQUIRE_REVIEW: &str = "COMMUNITY_HUB_REQUIRE_REVIEW";
pub const ENV_CONFIG_FILE: &str = "COMMUNITY_HUB_CONFIG_FILE";
pub const ENV_JWT_SECRET: &str = "COMMUNITY_HUB_JWT_SECRET";
pub const ENV_ALLOW_HEADER_AUTH: &str = "COMMUNITY_HUB_ALLOW_HEADER_AUTH";
pub const ENV_RATE_LIMIT_RPM: &str = "COMMUNITY_HUB_RATE_LIMIT_RPM";
pub const ENV_SEMANTIC_SEARCH: &str = "COMMUNITY_HUB_SEMANTIC_SEARCH";
pub const ENV_EMBEDDING_URL: &str = "COMMUNITY_HUB_EMBEDDING_URL";

pub const DEFAULT_PORT: u16 = 3721;
pub const DEFAULT_HOST: &str = "127.0.0.1";
pub const DEFAULT_RATE_LIMIT_RPM: u64 = 600;

const HUB_CONFIG_FILE: &str = "hub.json";
const RSS_SOURCES_FILE: &str = "rss-sources.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HubConfigFile {
    #[serde(default = "default_port")]
    pub port: u16,
    #[serde(default)]
    pub require_review: bool,
}

impl Default for HubConfigFile {
    fn default() -> Self {
        Self {
            port: default_port(),
            require_review: false,
        }
    }
}

#[derive(Debug, Clone)]
pub struct HubConfig {
    pub data_dir: PathBuf,
    pub port: u16,
    pub host: &'static str,
    pub require_review: bool,
    pub jwt_secret: Option<String>,
    pub packages_dir: PathBuf,
    pub covers_dir: PathBuf,
    pub deliveries_dir: PathBuf,
    pub db_path: PathBuf,
    pub rss_sources_path: PathBuf,
    /// Requests per minute for `/api/v1/*`. `0` disables rate limiting.
    pub rate_limit_rpm: u64,
    pub semantic_search_enabled: bool,
    pub embedding_provider_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RssSourceSeed {
    pub id: String,
    pub title: String,
    pub feed_url: String,
    pub site_url: String,
    pub category: String,
    pub language: String,
    pub enabled: bool,
    pub fetch_interval_minutes: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RssSourcesFile {
    pub sources: Vec<RssSourceSeed>,
}

impl HubConfig {
    pub fn load() -> Result<Self, ConfigError> {
        let data_dir = resolve_data_dir()?;
        let file_config = load_hub_config_file(&data_dir)?;
        let port = resolve_port(&file_config);
        let require_review = resolve_require_review(&file_config);
        let jwt_secret = resolve_jwt_secret();
        let rate_limit_rpm = resolve_rate_limit_rpm();
        let semantic_search_enabled = resolve_semantic_search_enabled();
        let embedding_provider_url = resolve_embedding_provider_url();

        let packages_dir = data_dir.join("packages");
        let covers_dir = data_dir.join("covers");
        let deliveries_dir = data_dir.join("deliveries");
        let db_path = data_dir.join("community.db");
        let rss_sources_path = data_dir.join(RSS_SOURCES_FILE);

        Ok(Self {
            data_dir,
            port,
            host: DEFAULT_HOST,
            require_review,
            jwt_secret,
            packages_dir,
            covers_dir,
            deliveries_dir,
            db_path,
            rss_sources_path,
            rate_limit_rpm,
            semantic_search_enabled,
            embedding_provider_url,
        })
    }

    pub fn with_data_dir(data_dir: PathBuf) -> Self {
        Self {
            data_dir: data_dir.clone(),
            port: DEFAULT_PORT,
            host: DEFAULT_HOST,
            require_review: false,
            jwt_secret: None,
            packages_dir: data_dir.join("packages"),
            covers_dir: data_dir.join("covers"),
            deliveries_dir: data_dir.join("deliveries"),
            db_path: data_dir.join("community.db"),
            rss_sources_path: data_dir.join(RSS_SOURCES_FILE),
            rate_limit_rpm: DEFAULT_RATE_LIMIT_RPM,
            semantic_search_enabled: false,
            embedding_provider_url: None,
        }
    }

    pub fn bootstrap(&self) -> Result<(), ConfigError> {
        for dir in [
            &self.data_dir,
            &self.packages_dir,
            &self.covers_dir,
            &self.deliveries_dir,
        ] {
            fs::create_dir_all(dir).map_err(|error| ConfigError::Io {
                path: dir.clone(),
                source: error,
            })?;
        }

        write_hub_config_if_missing(&self.data_dir, self.port, self.require_review)?;
        seed_rss_sources(&self.rss_sources_path)?;

        info!(
            data_dir = %self.data_dir.display(),
            port = self.port,
            require_review = self.require_review,
            "community hub storage initialized"
        );

        Ok(())
    }
}

fn default_port() -> u16 {
    DEFAULT_PORT
}

fn resolve_data_dir() -> Result<PathBuf, ConfigError> {
    if let Ok(value) = std::env::var(ENV_DATA_DIR) {
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            return Ok(PathBuf::from(trimmed));
        }
    }

    if let Some(dirs) = directories::ProjectDirs::from("com", "Toolman", "Toolman") {
        return Ok(dirs.data_dir().join("community"));
    }

    Ok(PathBuf::from(".toolman-community"))
}

fn hub_config_path(data_dir: &Path) -> PathBuf {
    if let Ok(path) = std::env::var(ENV_CONFIG_FILE) {
        let trimmed = path.trim();
        if !trimmed.is_empty() {
            return PathBuf::from(trimmed);
        }
    }
    data_dir.join(HUB_CONFIG_FILE)
}

fn load_hub_config_file(data_dir: &Path) -> Result<HubConfigFile, ConfigError> {
    let path = hub_config_path(data_dir);
    if !path.is_file() {
        return Ok(HubConfigFile::default());
    }

    let raw = fs::read_to_string(&path).map_err(|error| ConfigError::Io {
        path: path.clone(),
        source: error,
    })?;

    serde_json::from_str(&raw).map_err(|error| ConfigError::InvalidJson {
        path,
        source: error,
    })
}

fn write_hub_config_if_missing(
    data_dir: &Path,
    port: u16,
    require_review: bool,
) -> Result<(), ConfigError> {
    let path = hub_config_path(data_dir);
    if path.is_file() {
        return Ok(());
    }

    let config = HubConfigFile {
        port,
        require_review,
    };

    let json = serde_json::to_string_pretty(&config).map_err(|error| ConfigError::Serialize {
        source: error,
    })?;

    fs::write(&path, json).map_err(|error| ConfigError::Io {
        path,
        source: error,
    })?;

    Ok(())
}

fn resolve_port(file_config: &HubConfigFile) -> u16 {
    if let Ok(value) = std::env::var(ENV_PORT) {
        if let Ok(port) = value.parse::<u16>() {
            return port;
        }
        warn!(value = %value, "invalid {ENV_PORT}, using fallback");
    }
    file_config.port
}

fn resolve_require_review(file_config: &HubConfigFile) -> bool {
    if let Ok(value) = std::env::var(ENV_REQUIRE_REVIEW) {
        return matches!(value.trim().to_lowercase().as_str(), "1" | "true" | "yes" | "on");
    }
    file_config.require_review
}

fn resolve_jwt_secret() -> Option<String> {
    std::env::var(ENV_JWT_SECRET)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

pub fn is_header_auth_allowed() -> bool {
    std::env::var(ENV_ALLOW_HEADER_AUTH)
        .ok()
        .map(|value| matches!(value.trim().to_lowercase().as_str(), "1" | "true" | "yes" | "on"))
        .unwrap_or(false)
}

fn resolve_rate_limit_rpm() -> u64 {
    if let Ok(value) = std::env::var(ENV_RATE_LIMIT_RPM) {
        if let Ok(parsed) = value.trim().parse::<u64>() {
            return parsed;
        }
        warn!(value = %value, "invalid {ENV_RATE_LIMIT_RPM}, using default");
    }
    DEFAULT_RATE_LIMIT_RPM
}

fn resolve_semantic_search_enabled() -> bool {
    std::env::var(ENV_SEMANTIC_SEARCH)
        .ok()
        .map(|value| matches!(value.trim().to_lowercase().as_str(), "1" | "true" | "yes" | "on"))
        .unwrap_or(false)
}

fn resolve_embedding_provider_url() -> Option<String> {
    std::env::var(ENV_EMBEDDING_URL)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

pub fn default_rss_sources() -> Vec<RssSourceSeed> {
    vec![
        RssSourceSeed {
            id: "openai-news".into(),
            title: "OpenAI News".into(),
            feed_url: "https://openai.com/news/rss.xml".into(),
            site_url: "https://openai.com/news".into(),
            category: "ai".into(),
            language: "en".into(),
            enabled: true,
            fetch_interval_minutes: 60,
        },
        RssSourceSeed {
            id: "36kr".into(),
            title: "36氪".into(),
            feed_url: "https://36kr.com/feed".into(),
            site_url: "https://36kr.com".into(),
            category: "industry".into(),
            language: "zh".into(),
            enabled: true,
            fetch_interval_minutes: 30,
        },
        RssSourceSeed {
            id: "xinhua-news".into(),
            title: "新华网".into(),
            feed_url: "http://www.xinhuanet.com/politics/news_politics.xml".into(),
            site_url: "http://www.xinhuanet.com".into(),
            category: "news".into(),
            language: "zh".into(),
            enabled: true,
            fetch_interval_minutes: 30,
        },
    ]
}

pub const DEPRECATED_RSS_SOURCE_IDS: &[&str] = &[
    "google-ai-blog",
    "huggingface-blog",
    "hacker-news",
    "zaobao",
    "wallstreetcn",
    "yicai",
];

fn seed_rss_sources(path: &Path) -> Result<(), ConfigError> {
    if path.is_file() {
        return Ok(());
    }

    let payload = RssSourcesFile {
        sources: default_rss_sources(),
    };

    let json = serde_json::to_string_pretty(&payload).map_err(|error| ConfigError::Serialize {
        source: error,
    })?;

    fs::write(path, json).map_err(|error| ConfigError::Io {
        path: path.to_path_buf(),
        source: error,
    })?;

    info!(path = %path.display(), count = payload.sources.len(), "seeded default RSS sources");
    Ok(())
}

#[derive(Debug, thiserror::Error)]
pub enum ConfigError {
    #[error("failed to access {path}: {source}")]
    Io {
        path: PathBuf,
        source: std::io::Error,
    },
    #[error("invalid JSON in {path}: {source}")]
    InvalidJson {
        path: PathBuf,
        source: serde_json::Error,
    },
    #[error("failed to serialize config: {source}")]
    Serialize { source: serde_json::Error },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bootstrap_creates_expected_directories() {
        let base = std::env::temp_dir().join(format!(
            "toolman-community-hub-test-{}",
            uuid::Uuid::new_v4()
        ));

        let config = HubConfig::with_data_dir(base.clone());

        config.bootstrap().expect("bootstrap");

        assert!(config.packages_dir.is_dir());
        assert!(config.covers_dir.is_dir());
        assert!(config.deliveries_dir.is_dir());
        assert!(config.rss_sources_path.is_file());

        let raw = fs::read_to_string(&config.rss_sources_path).expect("read rss");
        let parsed: RssSourcesFile = serde_json::from_str(&raw).expect("parse rss");
        assert_eq!(parsed.sources.len(), 3);

        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn env_overrides_port_and_review_flag() {
        let file_config = HubConfigFile {
            port: 4000,
            require_review: false,
        };

        std::env::set_var(ENV_PORT, "4567");
        std::env::set_var(ENV_REQUIRE_REVIEW, "true");
        assert_eq!(resolve_port(&file_config), 4567);
        assert!(resolve_require_review(&file_config));
        std::env::remove_var(ENV_PORT);
        std::env::remove_var(ENV_REQUIRE_REVIEW);
    }

    #[test]
    fn env_overrides_rate_limit_and_semantic_search() {
        std::env::set_var(ENV_RATE_LIMIT_RPM, "120");
        std::env::set_var(ENV_SEMANTIC_SEARCH, "true");
        std::env::set_var(ENV_EMBEDDING_URL, "http://127.0.0.1:11434/v1");
        assert_eq!(resolve_rate_limit_rpm(), 120);
        assert!(resolve_semantic_search_enabled());
        assert_eq!(
            resolve_embedding_provider_url().as_deref(),
            Some("http://127.0.0.1:11434/v1")
        );
        std::env::remove_var(ENV_RATE_LIMIT_RPM);
        std::env::remove_var(ENV_SEMANTIC_SEARCH);
        std::env::remove_var(ENV_EMBEDDING_URL);
    }
}
