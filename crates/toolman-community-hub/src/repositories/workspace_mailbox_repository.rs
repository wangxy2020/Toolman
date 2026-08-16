use sha2::{Digest, Sha256};
use sqlx::SqlitePool;

#[derive(Debug, thiserror::Error)]
pub enum WorkspaceMailboxRepositoryError {
    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),
    #[error("mailbox grant mismatch")]
    GrantMismatch,
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct WorkspaceMailboxRecord {
    pub workspace_id: String,
    pub recipient_device_id: String,
    pub seq: i64,
    pub ciphertext: String,
    pub deposited_at: i64,
}

#[derive(Clone)]
pub struct WorkspaceMailboxRepository {
    pool: SqlitePool,
}

impl WorkspaceMailboxRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub fn hash_grant(grant: &str) -> String {
        let digest = Sha256::digest(grant.as_bytes());
        hex::encode(digest)
    }

    pub async fn put(
        &self,
        workspace_id: &str,
        recipient_device_id: &str,
        seq: i64,
        ciphertext: &str,
        grant: &str,
        deposited_at: i64,
    ) -> Result<(), WorkspaceMailboxRepositoryError> {
        let grant_hash = Self::hash_grant(grant);
        sqlx::query(
            r#"
            INSERT INTO workspace_mailbox (
                workspace_id, recipient_device_id, seq, ciphertext, grant_hash, deposited_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
            ON CONFLICT(workspace_id, recipient_device_id, seq) DO UPDATE SET
                ciphertext = excluded.ciphertext,
                deposited_at = excluded.deposited_at
            "#,
        )
        .bind(workspace_id)
        .bind(recipient_device_id)
        .bind(seq)
        .bind(ciphertext)
        .bind(&grant_hash)
        .bind(deposited_at)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn pull(
        &self,
        workspace_id: &str,
        recipient_device_id: &str,
        grant: &str,
        since_seq: i64,
        limit: i64,
    ) -> Result<Vec<WorkspaceMailboxRecord>, WorkspaceMailboxRepositoryError> {
        let _grant_hash = Self::hash_grant(grant);
        let rows = sqlx::query_as::<_, WorkspaceMailboxRecord>(
            r#"
            SELECT workspace_id, recipient_device_id, seq, ciphertext, deposited_at
            FROM workspace_mailbox
            WHERE workspace_id = ?1
              AND recipient_device_id = ?2
              AND seq > ?3
            ORDER BY seq ASC
            LIMIT ?4
            "#,
        )
        .bind(workspace_id)
        .bind(recipient_device_id)
        .bind(since_seq)
        .bind(limit)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows)
    }
}
