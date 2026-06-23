pub mod api;
pub mod config;
pub mod db;
pub mod domain;
pub mod rate_limit;
pub mod repositories;
pub mod rss;
pub mod services;
pub mod state;
pub mod testing;

pub use config::{HubConfig, HubConfigFile, RssSourceSeed, RssSourcesFile};
pub use db::{init_pool, DbError};
pub use domain::{
    CommunityResource, CommunityUser, CreateResourceInput, ResourceListFilter, ResourceStatus,
    ResourceType, UserPermission,
};
pub use repositories::{
    RepositoryError, ResourceRepository, UserRepository, UserRepositoryError,
};
pub use services::{
    CreateMcpDraftInput, CreateSkillDraftInput, CreateWorkflowDraftInput, McpMarketService,
    NewsSearchFilter, NewsSearchHit, RankedResource, SearchError, SearchHit, SearchService,
    SearchSort, SearchTargetType, SkillMarketService, StorageError, StorageService,
    StorePackageInput, StoredPackage, UnifiedSearchQuery, WorkflowMarketService,
    ResourceSearchFilter,
};
pub use state::AppState;

pub const VERSION: &str = env!("CARGO_PKG_VERSION");
