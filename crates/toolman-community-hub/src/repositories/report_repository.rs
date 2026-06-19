use sqlx::SqlitePool;
use uuid::Uuid;

use crate::domain::{
    CommunityReport, CreateReportInput, ModerationError, ReportReason, ReportStatus,
    ReportTargetType,
};

#[derive(Debug, thiserror::Error)]
pub enum ReportRepositoryError {
    #[error("report not found: {0}")]
    NotFound(String),
    #[error("validation error: {0}")]
    Validation(#[from] ModerationError),
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
}

#[derive(Clone)]
pub struct ReportRepository {
    pool: SqlitePool,
}

#[derive(Debug, Clone, Default)]
pub struct ReportListFilter {
    pub status: Option<ReportStatus>,
    pub limit: i64,
    pub offset: i64,
}

#[derive(sqlx::FromRow)]
struct ReportRecord {
    id: String,
    reporter_id: String,
    target_type: String,
    target_id: String,
    reason: String,
    description: String,
    status: String,
    created_at: i64,
    resolved_at: Option<i64>,
    resolved_by: Option<String>,
}

impl ReportRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn create(
        &self,
        input: CreateReportInput,
    ) -> Result<CommunityReport, ReportRepositoryError> {
        let id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().timestamp_millis();

        sqlx::query(
            r#"
            INSERT INTO community_reports (
              id, reporter_id, target_type, target_id, reason, description, status, created_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'open', ?7)
            "#,
        )
        .bind(&id)
        .bind(&input.reporter_id)
        .bind(input.target_type.as_str())
        .bind(&input.target_id)
        .bind(input.reason.as_str())
        .bind(&input.description)
        .bind(now)
        .execute(&self.pool)
        .await?;

        self.find_by_id(&id)
            .await?
            .ok_or_else(|| ReportRepositoryError::NotFound(id))
    }

    pub async fn find_by_id(&self, id: &str) -> Result<Option<CommunityReport>, ReportRepositoryError> {
        let record = sqlx::query_as::<_, ReportRecord>(
            r#"
            SELECT
              id, reporter_id, target_type, target_id, reason, description, status,
              created_at, resolved_at, resolved_by
            FROM community_reports
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
        filter: &ReportListFilter,
    ) -> Result<Vec<CommunityReport>, ReportRepositoryError> {
        let mut builder = sqlx::QueryBuilder::new(
            r#"
            SELECT
              id, reporter_id, target_type, target_id, reason, description, status,
              created_at, resolved_at, resolved_by
            FROM community_reports
            WHERE 1 = 1
            "#,
        );

        if let Some(status) = filter.status {
            builder.push(" AND status = ");
            builder.push_bind(status.as_str());
        }

        builder.push(" ORDER BY created_at DESC LIMIT ");
        builder.push_bind(filter.limit);
        builder.push(" OFFSET ");
        builder.push_bind(filter.offset);

        let records = builder
            .build_query_as::<ReportRecord>()
            .fetch_all(&self.pool)
            .await?;

        records.into_iter().map(TryInto::try_into).collect()
    }

    pub async fn resolve(
        &self,
        id: &str,
        status: ReportStatus,
        resolved_by: &str,
    ) -> Result<CommunityReport, ReportRepositoryError> {
        let now = chrono::Utc::now().timestamp_millis();
        let rows = sqlx::query(
            r#"
            UPDATE community_reports
            SET status = ?1, resolved_at = ?2, resolved_by = ?3
            WHERE id = ?4
            "#,
        )
        .bind(status.as_str())
        .bind(now)
        .bind(resolved_by)
        .bind(id)
        .execute(&self.pool)
        .await?
        .rows_affected();

        if rows == 0 {
            return Err(ReportRepositoryError::NotFound(id.to_string()));
        }

        self.find_by_id(id)
            .await?
            .ok_or_else(|| ReportRepositoryError::NotFound(id.to_string()))
    }
}

impl TryFrom<ReportRecord> for CommunityReport {
    type Error = ReportRepositoryError;

    fn try_from(record: ReportRecord) -> Result<Self, Self::Error> {
        Ok(Self {
            id: record.id,
            reporter_id: record.reporter_id,
            target_type: ReportTargetType::parse(&record.target_type)?,
            target_id: record.target_id,
            reason: ReportReason::parse(&record.reason)?,
            description: record.description,
            status: ReportStatus::parse(&record.status)?,
            created_at: record.created_at,
            resolved_at: record.resolved_at,
            resolved_by: record.resolved_by,
        })
    }
}
