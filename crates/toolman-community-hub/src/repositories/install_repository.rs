use sqlx::SqlitePool;
use uuid::Uuid;

use crate::domain::{
    CommunityInstall, CreateInstallInput, InstallError, InstallStatus,
};

#[derive(Debug, thiserror::Error)]
pub enum InstallRepositoryError {
    #[error("install not found: {0}")]
    NotFound(String),
    #[error("validation error: {0}")]
    Validation(#[from] InstallError),
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
}

#[derive(Debug, Clone, Default)]
pub struct InstallListFilter {
    pub user_id: Option<String>,
    pub resource_id: Option<String>,
    pub workspace_id: Option<String>,
    pub limit: i64,
    pub offset: i64,
}

#[derive(Clone)]
pub struct InstallRepository {
    pool: SqlitePool,
}

#[derive(sqlx::FromRow)]
struct InstallRecord {
    id: String,
    user_id: String,
    resource_id: String,
    version_id: String,
    workspace_id: Option<String>,
    local_ref: Option<String>,
    install_status: String,
    error_message: Option<String>,
    installed_at: i64,
    completed_at: Option<i64>,
}

impl InstallRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn create(
        &self,
        input: CreateInstallInput,
    ) -> Result<CommunityInstall, InstallRepositoryError> {
        let id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().timestamp_millis();

        sqlx::query(
            r#"
            INSERT INTO community_installs (
              id, user_id, resource_id, version_id, workspace_id, install_status, installed_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, 'pending', ?6)
            "#,
        )
        .bind(&id)
        .bind(&input.user_id)
        .bind(&input.resource_id)
        .bind(&input.version_id)
        .bind(&input.workspace_id)
        .bind(now)
        .execute(&self.pool)
        .await?;

        self.find_by_id(&id)
            .await?
            .ok_or_else(|| InstallRepositoryError::NotFound(id))
    }

    pub async fn find_by_id(&self, id: &str) -> Result<Option<CommunityInstall>, InstallRepositoryError> {
        let record = sqlx::query_as::<_, InstallRecord>(
            r#"
            SELECT
              id, user_id, resource_id, version_id, workspace_id, local_ref,
              install_status, error_message, installed_at, completed_at
            FROM community_installs
            WHERE id = ?1
            "#,
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;

        record.map(TryInto::try_into).transpose()
    }

    pub async fn list(
        &self,
        filter: &InstallListFilter,
    ) -> Result<Vec<CommunityInstall>, InstallRepositoryError> {
        let mut builder = sqlx::QueryBuilder::new(
            r#"
            SELECT
              id, user_id, resource_id, version_id, workspace_id, local_ref,
              install_status, error_message, installed_at, completed_at
            FROM community_installs
            WHERE 1 = 1
            "#,
        );

        if let Some(user_id) = &filter.user_id {
            builder.push(" AND user_id = ");
            builder.push_bind(user_id);
        }
        if let Some(resource_id) = &filter.resource_id {
            builder.push(" AND resource_id = ");
            builder.push_bind(resource_id);
        }
        if let Some(workspace_id) = &filter.workspace_id {
            builder.push(" AND workspace_id = ");
            builder.push_bind(workspace_id);
        }

        builder.push(" ORDER BY installed_at DESC LIMIT ");
        builder.push_bind(filter.limit);
        builder.push(" OFFSET ");
        builder.push_bind(filter.offset);

        let records = builder
            .build_query_as::<InstallRecord>()
            .fetch_all(&self.pool)
            .await?;

        records.into_iter().map(TryInto::try_into).collect()
    }

    pub async fn complete(
        &self,
        id: &str,
        status: InstallStatus,
        local_ref: Option<String>,
        error_message: Option<String>,
    ) -> Result<CommunityInstall, InstallRepositoryError> {
        let current = self
            .find_by_id(id)
            .await?
            .ok_or_else(|| InstallRepositoryError::NotFound(id.to_string()))?;

        if current.install_status != InstallStatus::Pending {
            return Err(InstallRepositoryError::Validation(InstallError::AlreadyCompleted));
        }

        let now = chrono::Utc::now().timestamp_millis();
        let rows = sqlx::query(
            r#"
            UPDATE community_installs
            SET install_status = ?1, local_ref = ?2, error_message = ?3, completed_at = ?4
            WHERE id = ?5
            "#,
        )
        .bind(status.as_str())
        .bind(local_ref)
        .bind(error_message)
        .bind(now)
        .bind(id)
        .execute(&self.pool)
        .await?
        .rows_affected();

        if rows == 0 {
            return Err(InstallRepositoryError::NotFound(id.to_string()));
        }

        self.find_by_id(id)
            .await?
            .ok_or_else(|| InstallRepositoryError::NotFound(id.to_string()))
    }

    pub async fn rollback(&self, id: &str) -> Result<CommunityInstall, InstallRepositoryError> {
        let current = self
            .find_by_id(id)
            .await?
            .ok_or_else(|| InstallRepositoryError::NotFound(id.to_string()))?;

        if current.install_status != InstallStatus::Success {
            return Err(InstallRepositoryError::Validation(InstallError::InvalidStatus(
                "only successful installs can be rolled back".to_string(),
            )));
        }

        let now = chrono::Utc::now().timestamp_millis();
        sqlx::query(
            r#"
            UPDATE community_installs
            SET install_status = 'rolled_back', completed_at = ?1
            WHERE id = ?2
            "#,
        )
        .bind(now)
        .bind(id)
        .execute(&self.pool)
        .await?;

        self.find_by_id(id)
            .await?
            .ok_or_else(|| InstallRepositoryError::NotFound(id.to_string()))
    }
}

impl TryFrom<InstallRecord> for CommunityInstall {
    type Error = InstallRepositoryError;

    fn try_from(record: InstallRecord) -> Result<Self, Self::Error> {
        Ok(Self {
            id: record.id,
            user_id: record.user_id,
            resource_id: record.resource_id,
            version_id: record.version_id,
            workspace_id: record.workspace_id,
            local_ref: record.local_ref,
            install_status: InstallStatus::parse(&record.install_status)?,
            error_message: record.error_message,
            installed_at: record.installed_at,
            completed_at: record.completed_at,
        })
    }
}
