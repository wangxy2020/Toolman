import type { DocumentRepository } from '@toolman/db'
import type { KnowledgeDocument } from '@toolman/shared'

/** Skip re-ingest only when content is unchanged and chunk rows still exist. */
export function shouldSkipReadyDocument(
  repo: DocumentRepository,
  kbId: string,
  documentId: string,
  contentHash: string,
  existing: Pick<KnowledgeDocument, 'contentHash' | 'status'>,
): boolean {
  if (existing.status !== 'ready') return false
  if (existing.contentHash !== contentHash) return false
  return repo.countChunksByDocument(documentId, kbId) > 0
}

/** Active row for a path, restoring soft-deleted rows when needed. */
export function findActiveDocumentByPath(
  repo: DocumentRepository,
  kbId: string,
  path: string,
): KnowledgeDocument | undefined {
  const active = repo.findByPath(kbId, path)
  if (active) return active

  const deleted = repo.findAnyByPath(kbId, path)
  if (deleted?.deletedAt) {
    const restored = repo.restoreDocument(deleted.id, kbId)
    if (!restored) return undefined
    return repo.update(restored.id, kbId, { status: 'queued' }) ?? restored
  }

  return undefined
}

/** Active row for an id, restoring soft-deleted rows when needed. */
export function findActiveDocumentById(
  repo: DocumentRepository,
  kbId: string,
  documentId: string,
): KnowledgeDocument | undefined {
  const active = repo.findById(documentId, kbId)
  if (active) return active

  const existing = repo.findAnyById(documentId, kbId)
  if (!existing) return undefined
  if (existing.deletedAt != null) {
    const restored = repo.restoreDocument(documentId, kbId)
    if (!restored) return undefined
    return repo.update(restored.id, kbId, { status: 'queued' }) ?? restored
  }

  return existing
}
