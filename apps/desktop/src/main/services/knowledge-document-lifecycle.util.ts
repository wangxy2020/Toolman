import type { DocumentRepository } from '@toolman/db'
import type { KnowledgeDocument } from '@toolman/shared'

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
    return repo.restoreDocument(deleted.id, kbId) ?? undefined
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
    return repo.restoreDocument(documentId, kbId) ?? undefined
  }

  return existing
}
