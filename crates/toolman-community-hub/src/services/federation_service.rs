use serde::Serialize;
use sqlx::SqlitePool;

use crate::domain::{ResourceStatus, ResourceType, ResourceVisibility};

const TOOLMAN_CID_PREFIX: &str = "toolman:sha256:";

#[derive(Debug, Clone, Serialize)]
pub struct FederationAuthorSummary {
    pub id: String,
    pub display_name: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct FederationCatalogEntry {
    pub id: String,
    pub title: String,
    pub description: String,
    pub author: FederationAuthorSummary,
    pub version: String,
    pub tags: Vec<String>,
    pub category: String,
    pub resource_type: String,
    pub resource_size: i64,
    pub root_cid: String,
    pub license: String,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct FederationCatalogPage {
    pub items: Vec<crate::services::federation_catalog_signing::FederatedCatalogWireMessage>,
    pub latest_updated_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct FederationPeeringInfo {
    pub base_url: String,
    pub version: String,
    pub resource_count: i64,
    pub latest_updated_at: Option<i64>,
    pub federation_peering: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct FederationLibp2pBootstrap {
    pub bootstrap_multiaddrs: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct FederationCatalogQuery {
    pub updated_after: i64,
    pub limit: i64,
    pub resource_type: Option<ResourceType>,
}

#[derive(Clone)]
pub struct FederationService {
    pool: SqlitePool,
}

#[derive(sqlx::FromRow)]
struct CatalogRecord {
    id: String,
    title: String,
    description: String,
    author_id: String,
    author_display_name: String,
    version: String,
    tags: String,
    category: String,
    resource_type: String,
    resource_size: i64,
    sha256: Option<String>,
    license: String,
    created_at: i64,
    updated_at: i64,
}

impl FederationService {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn list_catalog(
        &self,
        query: FederationCatalogQuery,
        data_dir: &std::path::Path,
    ) -> Result<FederationCatalogPage, sqlx::Error> {
        let limit = query.limit.clamp(1, 500);
        let mut builder = sqlx::QueryBuilder::new(
            r#"
            SELECT
              r.id,
              r.title,
              r.description,
              r.author_id,
              u.display_name AS author_display_name,
              r.version,
              r.tags,
              r.category,
              r.resource_type,
              r.resource_size,
              v.sha256,
              r.license,
              r.created_at,
              r.updated_at
            FROM community_resources r
            JOIN community_users u ON u.id = r.author_id
            LEFT JOIN community_resource_versions v
              ON v.id = r.latest_version_id
            WHERE r.deleted_at IS NULL
              AND r.status = "#,
        );
        builder.push_bind(ResourceStatus::Published.as_str());
        builder.push(" AND r.visibility = ");
        builder.push_bind(ResourceVisibility::Public.as_str());
        builder.push(" AND r.updated_at > ");
        builder.push_bind(query.updated_after);

        if let Some(resource_type) = query.resource_type {
            builder.push(" AND r.resource_type = ");
            builder.push_bind(resource_type.as_str());
        }

        builder.push(" ORDER BY r.updated_at ASC LIMIT ");
        builder.push_bind(limit);

        let records = builder
            .build_query_as::<CatalogRecord>()
            .fetch_all(&self.pool)
            .await?;

        let mut latest_updated_at = None;
        let mut items = Vec::with_capacity(records.len());

        for record in records {
            latest_updated_at = Some(
                latest_updated_at
                    .map(|current: i64| current.max(record.updated_at))
                    .unwrap_or(record.updated_at),
            );

            let tags: Vec<String> = serde_json::from_str(&record.tags).unwrap_or_default();
            let root_cid = record
                .sha256
                .as_deref()
                .map(build_root_cid)
                .unwrap_or_default();

            let catalog_entry = FederationCatalogEntry {
                id: record.id,
                title: record.title,
                description: record.description,
                author: FederationAuthorSummary {
                    id: record.author_id,
                    display_name: record.author_display_name,
                },
                version: record.version,
                tags,
                category: record.category,
                resource_type: record.resource_type,
                resource_size: record.resource_size,
                root_cid,
                license: record.license,
                created_at: record.created_at,
                updated_at: record.updated_at,
            };

            match crate::services::federation_catalog_signing::sign_federation_catalog_entry(
                data_dir,
                &catalog_entry,
            ) {
                Ok(wire) => items.push(wire),
                Err(error) => tracing::warn!("federation catalog signing failed: {error}"),
            }
        }

        Ok(FederationCatalogPage {
            items,
            latest_updated_at,
        })
    }

    pub async fn peering_info(&self, base_url: &str) -> Result<FederationPeeringInfo, sqlx::Error> {
        let resource_count: (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM community_resources WHERE deleted_at IS NULL AND status = ?")
                .bind(ResourceStatus::Published.as_str())
                .fetch_one(&self.pool)
                .await?;

        let latest_updated_at: Option<(i64,)> = sqlx::query_as(
            "SELECT MAX(updated_at) FROM community_resources WHERE deleted_at IS NULL AND status = ?",
        )
        .bind(ResourceStatus::Published.as_str())
        .fetch_optional(&self.pool)
        .await?;

        Ok(FederationPeeringInfo {
            base_url: base_url.to_string(),
            version: crate::VERSION.to_string(),
            resource_count: resource_count.0,
            latest_updated_at: latest_updated_at.map(|row| row.0),
            federation_peering: true,
        })
    }

    pub fn libp2p_bootstrap() -> FederationLibp2pBootstrap {
        let bootstrap_multiaddrs = std::env::var("TOOLMAN_P2P_BOOTSTRAP_ADDRS")
            .ok()
            .map(|value| {
                value
                    .split(',')
                    .map(str::trim)
                    .filter(|item| !item.is_empty())
                    .map(str::to_string)
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();

        FederationLibp2pBootstrap {
            bootstrap_multiaddrs,
        }
    }
}

fn build_root_cid(sha256: &str) -> String {
    format!("{TOOLMAN_CID_PREFIX}{sha256}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::init_pool;
    use crate::db::seed::DEFAULT_ADMIN_USER_ID;
    use crate::domain::CreateResourceInput;
    use crate::repositories::resource_repository::ResourceRepository;
    use crate::repositories::version_repository::{CreateVersionInput, VersionRepository};
    use serde_json::json;
    use uuid::Uuid;

    fn sample_mcp_manifest() -> serde_json::Value {
        json!({
            "schemaVersion": 1,
            "mcpId": "peer-mcp",
            "transport": "stdio",
            "command": "npx",
            "args": ["-y", "@modelcontextprotocol/server-filesystem"],
            "files": ["mcp.manifest.json"]
        })
    }

    async fn seeded_pool() -> (SqlitePool, std::path::PathBuf) {
        let data_dir = std::env::temp_dir().join(format!("toolman-federation-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&data_dir).expect("data dir");
        let db_path = data_dir.join("community.db");
        let pool = init_pool(&db_path).await.expect("init pool");
        (pool, data_dir)
    }

    #[tokio::test]
    async fn catalog_lists_published_resources_incrementally() {
        let (pool, data_dir) = seeded_pool().await;
        let repo = ResourceRepository::new(pool.clone());
        let versions = VersionRepository::new(pool.clone());

        let resource = repo
            .create(CreateResourceInput {
                title: "Peer MCP".into(),
                description: Some("desc".into()),
                author_id: DEFAULT_ADMIN_USER_ID.to_string(),
                resource_type: ResourceType::Mcp,
                version: Some("1.0.0".into()),
                tags: Some(vec!["tools".into()]),
                category: Some("dev".into()),
                license: Some("MIT".into()),
                visibility: Some(ResourceVisibility::Public),
                status: Some(ResourceStatus::Published),
                cover_path: None,
                package_path: None,
                resource_size: Some(128),
                manifest: sample_mcp_manifest(),
            })
            .await
            .expect("create resource");

        let version = versions
            .create(CreateVersionInput {
                resource_id: resource.id.clone(),
                version: "1.0.0".into(),
                changelog: None,
                package_path: "packages/test.zip".into(),
                manifest_json: json!({"schemaVersion": 1, "mcpId": "peer-mcp"}),
                resource_size: 128,
                sha256: "abc123".into(),
            })
            .await
            .expect("create version");

        repo.update(
            &resource.id,
            crate::domain::UpdateResourceInput {
                latest_version_id: Some(Some(version.id)),
                ..Default::default()
            },
        )
        .await
        .expect("attach version");

        let service = FederationService::new(pool);
        let page = service
            .list_catalog(
                FederationCatalogQuery {
                    updated_after: 0,
                    limit: 50,
                    resource_type: None,
                },
                &data_dir,
            )
            .await
            .expect("catalog");

        assert_eq!(page.items.len(), 1);
        assert_eq!(page.items[0].entry.title, "Peer MCP");
        assert_eq!(page.items[0].entry.root_cid, "toolman:sha256:abc123");
        assert!(!page.items[0].signature.is_empty());

        let empty = service
            .list_catalog(
                FederationCatalogQuery {
                    updated_after: page.items[0].entry.updated_at,
                    limit: 50,
                    resource_type: None,
                },
                &data_dir,
            )
            .await
            .expect("incremental");
        assert!(empty.items.is_empty());

        let _ = std::fs::remove_dir_all(data_dir);
    }
}
