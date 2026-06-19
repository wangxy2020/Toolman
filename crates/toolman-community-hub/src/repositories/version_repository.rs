use sqlx::SqlitePool;
use uuid::Uuid;

use crate::domain::CommunityResourceVersion;

#[derive(Debug, thiserror::Error)]
pub enum VersionRepositoryError {
    #[error("version already exists for resource: {resource_id}@{version}")]
    Conflict { resource_id: String, version: String },
    #[error("version not found: {0}")]
    NotFound(String),
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
    #[error("serialization error: {0}")]
    Serialization(#[from] serde_json::Error),
}

#[derive(Debug, Clone)]
pub struct CreateVersionInput {
    pub resource_id: String,
    pub version: String,
    pub changelog: Option<String>,
    pub package_path: String,
    pub manifest_json: serde_json::Value,
    pub resource_size: i64,
    pub sha256: String,
}

#[derive(Clone)]
pub struct VersionRepository {
    pool: SqlitePool,
}

#[derive(sqlx::FromRow)]
struct VersionRecord {
    id: String,
    resource_id: String,
    version: String,
    changelog: Option<String>,
    package_path: String,
    manifest_json: String,
    resource_size: i64,
    sha256: String,
    created_at: i64,
}

const VERSION_SELECT: &str = r#"
SELECT
  id,
  resource_id,
  version,
  changelog,
  package_path,
  manifest_json,
  resource_size,
  sha256,
  created_at
FROM community_resource_versions
"#;

impl VersionRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn create(
        &self,
        input: CreateVersionInput,
    ) -> Result<CommunityResourceVersion, VersionRepositoryError> {
        let id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().timestamp_millis();
        let manifest_json = serde_json::to_string(&input.manifest_json)?;

        let result = sqlx::query(
            r#"
            INSERT INTO community_resource_versions (
              id,
              resource_id,
              version,
              changelog,
              package_path,
              manifest_json,
              resource_size,
              sha256,
              created_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
            "#,
        )
        .bind(&id)
        .bind(&input.resource_id)
        .bind(&input.version)
        .bind(&input.changelog)
        .bind(&input.package_path)
        .bind(&manifest_json)
        .bind(input.resource_size)
        .bind(&input.sha256)
        .bind(now)
        .execute(&self.pool)
        .await;

        match result {
            Ok(_) => self
                .find_by_id(&id)
                .await?
                .ok_or_else(|| VersionRepositoryError::NotFound(id)),
            Err(error) if is_unique_violation(&error) => Err(VersionRepositoryError::Conflict {
                resource_id: input.resource_id,
                version: input.version,
            }),
            Err(error) => Err(error.into()),
        }
    }

    pub async fn find_by_id(&self, id: &str) -> Result<Option<CommunityResourceVersion>, VersionRepositoryError> {
        let query = format!("{VERSION_SELECT} WHERE id = ?1");
        let record = sqlx::query_as::<_, VersionRecord>(&query)
            .bind(id)
            .fetch_optional(&self.pool)
            .await?;

        record.map(TryInto::try_into).transpose()
    }

    pub async fn list_for_resource(
        &self,
        resource_id: &str,
    ) -> Result<Vec<CommunityResourceVersion>, VersionRepositoryError> {
        let query = format!("{VERSION_SELECT} WHERE resource_id = ?1 ORDER BY created_at DESC");
        let records = sqlx::query_as::<_, VersionRecord>(&query)
            .bind(resource_id)
            .fetch_all(&self.pool)
            .await?;

        records.into_iter().map(TryInto::try_into).collect()
    }

    pub async fn find_by_resource_and_version(
        &self,
        resource_id: &str,
        version: &str,
    ) -> Result<Option<CommunityResourceVersion>, VersionRepositoryError> {
        let query = format!("{VERSION_SELECT} WHERE resource_id = ?1 AND version = ?2");
        let record = sqlx::query_as::<_, VersionRecord>(&query)
            .bind(resource_id)
            .bind(version)
            .fetch_optional(&self.pool)
            .await?;

        record.map(TryInto::try_into).transpose()
    }
}

impl TryFrom<VersionRecord> for CommunityResourceVersion {
    type Error = VersionRepositoryError;

    fn try_from(record: VersionRecord) -> Result<Self, Self::Error> {
        Ok(Self {
            id: record.id,
            resource_id: record.resource_id,
            version: record.version,
            changelog: record.changelog,
            package_path: record.package_path,
            manifest_json: serde_json::from_str(&record.manifest_json)?,
            resource_size: record.resource_size,
            sha256: record.sha256,
            created_at: record.created_at,
        })
    }
}

fn is_unique_violation(error: &sqlx::Error) -> bool {
    matches!(
        error,
        sqlx::Error::Database(db_error)
            if db_error.code().as_deref() == Some("2067")
                || db_error.message().contains("UNIQUE constraint failed")
    )
}
