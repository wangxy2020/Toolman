//! Per-user private changelog mirrored from the desktop Sync Hub for WAN clients.

use sqlx::SqlitePool;

#[derive(Debug, thiserror::Error)]
pub enum DeviceSyncRepositoryError {
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
}

#[derive(Debug, Clone)]
pub struct UpsertDeviceSyncChangeInput {
    pub identity_id: String,
    pub entity_kind: String,
    pub entity_id: String,
    pub op: String,
    pub updated_at: i64,
    pub payload: String,
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct DeviceSyncChangeRecord {
    pub identity_id: String,
    pub seq: i64,
    pub entity_kind: String,
    pub entity_id: String,
    pub op: String,
    pub updated_at: i64,
    pub payload: String,
}

#[derive(Clone)]
pub struct DeviceSyncRepository {
    pool: SqlitePool,
}

impl DeviceSyncRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn upsert_change(
        &self,
        input: UpsertDeviceSyncChangeInput,
    ) -> Result<i64, DeviceSyncRepositoryError> {
        let mut tx = self.pool.begin().await?;

        let current: Option<(i64, i64, String, String)> = sqlx::query_as(
            r#"
            SELECT seq, updated_at, op, payload
            FROM device_sync_changes
            WHERE identity_id = ?1 AND entity_kind = ?2 AND entity_id = ?3
            "#,
        )
        .bind(&input.identity_id)
        .bind(&input.entity_kind)
        .bind(&input.entity_id)
        .fetch_optional(&mut *tx)
        .await?;

        if let Some((seq, updated_at, op, payload)) = &current {
            if *updated_at == input.updated_at && op == &input.op && payload == &input.payload {
                tx.commit().await?;
                return Ok(*seq);
            }
            if *updated_at > input.updated_at {
                tx.commit().await?;
                return Ok(*seq);
            }
        }

        let next_seq: i64 = {
            sqlx::query(
                r#"
                INSERT INTO device_sync_seq (identity_id, seq)
                VALUES (?1, 1)
                ON CONFLICT(identity_id) DO UPDATE SET seq = device_sync_seq.seq + 1
                "#,
            )
            .bind(&input.identity_id)
            .execute(&mut *tx)
            .await?;

            sqlx::query_scalar("SELECT seq FROM device_sync_seq WHERE identity_id = ?1")
                .bind(&input.identity_id)
                .fetch_one(&mut *tx)
                .await?
        };

        sqlx::query(
            r#"
            INSERT INTO device_sync_changes (
              identity_id, seq, entity_kind, entity_id, op, updated_at, payload
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
            ON CONFLICT(identity_id, entity_kind, entity_id) DO UPDATE SET
              seq = excluded.seq,
              op = excluded.op,
              updated_at = excluded.updated_at,
              payload = excluded.payload
            "#,
        )
        .bind(&input.identity_id)
        .bind(next_seq)
        .bind(&input.entity_kind)
        .bind(&input.entity_id)
        .bind(&input.op)
        .bind(input.updated_at)
        .bind(&input.payload)
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;
        Ok(next_seq)
    }

    pub async fn pull_after(
        &self,
        identity_id: &str,
        after_seq: i64,
        limit: i64,
    ) -> Result<Vec<DeviceSyncChangeRecord>, DeviceSyncRepositoryError> {
        let rows = sqlx::query_as::<_, DeviceSyncChangeRecord>(
            r#"
            SELECT identity_id, seq, entity_kind, entity_id, op, updated_at, payload
            FROM device_sync_changes
            WHERE identity_id = ?1 AND seq > ?2
            ORDER BY seq ASC
            LIMIT ?3
            "#,
        )
        .bind(identity_id)
        .bind(after_seq)
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows)
    }

    pub async fn current_seq(&self, identity_id: &str) -> Result<i64, DeviceSyncRepositoryError> {
        let seq: Option<i64> = sqlx::query_scalar(
            "SELECT seq FROM device_sync_seq WHERE identity_id = ?1",
        )
        .bind(identity_id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(seq.unwrap_or(0))
    }
}
