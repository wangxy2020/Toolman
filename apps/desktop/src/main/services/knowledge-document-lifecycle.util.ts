import type { DocumentRepository, DocumentRow } from '@toolman/db'
import type { KnowledgeDocument } from '@toolman/shared'

/** Previously indexed docs should not look like they are still parsing after leaving the KB. */
export function shouldRestoreIndexedDocumentStatus(options: {
  status: string | null | undefined
  chunkCount: number
  ingestInFlight: boolean
}): boolean {
  if (options.status === 'ready' || options.status === 'stale') return false
  if (options.status === 'failed' || options.status === 'cancelled') return false
  if (options.ingestInFlight) return false
  if (options.chunkCount <= 0) return false
  return true
}

/** Skip re-ingest only when content is unchanged, index config matches, and chunk rows still exist. */
export function shouldSkipReadyDocument(
  repo: DocumentRepository,
  kbId: string,
  documentId: string,
  contentHash: string,
  existing: Pick<KnowledgeDocument, 'contentHash' | 'status'> & {
    indexFingerprint?: string | null
  },
  indexFingerprint?: string | null,
): boolean {
  if (existing.status !== 'ready') return false
  if (existing.contentHash !== contentHash) return false
  if (
    indexFingerprint &&
    existing.indexFingerprint &&
    existing.indexFingerprint !== indexFingerprint
  ) {
    return false
  }
  return repo.countChunksByDocument(documentId, kbId) > 0
}

/** Active row for a path, restoring soft-deleted rows when needed. */
export function findActiveDocumentByPath(
  repo: DocumentRepository,
  kbId: string,
  path: string,
): DocumentRow | undefined {
  const active = repo.findByPath(kbId, path)
  if (active) return active

  const deleted = repo.findAnyByPath(kbId, path)
  if (deleted?.deletedAt) {
    const restored = repo.restoreDocument(deleted.id, kbId)
    if (!restored) return undefined
    return (
      repo.update(restored.id, kbId, { status: 'queued', errorJson: null }) ?? restored
    )
  }

  return undefined
}

/** Active row for an id, restoring soft-deleted rows when needed. */
export function findActiveDocumentById(
  repo: DocumentRepository,
  kbId: string,
  documentId: string,
): DocumentRow | undefined {
  const active = repo.findById(documentId, kbId)
  if (active) return active

  const existing = repo.findAnyById(documentId, kbId)
  if (!existing) return undefined
  if (existing.deletedAt != null) {
    const restored = repo.restoreDocument(documentId, kbId)
    if (!restored) return undefined
    return (
      repo.update(restored.id, kbId, { status: 'queued', errorJson: null }) ?? restored
    )
  }

  return existing
}
