import type { DocumentRepository } from '@toolman/db'

const cancelledDocumentIds = new Set<string>()

export function requestCancelIngest(documentId: string): void {
  cancelledDocumentIds.add(documentId)
}

export function clearIngestCancel(documentId: string): void {
  cancelledDocumentIds.delete(documentId)
}

export function isIngestCancelled(documentId: string): boolean {
  return cancelledDocumentIds.has(documentId)
}

export function assertIngestNotCancelled(documentId: string): void {
  if (isIngestCancelled(documentId)) {
    throw new Error('索引任务已取消')
  }
}

export function assertIngestStillActive(
  repo: DocumentRepository,
  documentId: string,
  kbId: string,
): void {
  assertIngestNotCancelled(documentId)
  const doc = repo.findById(documentId, kbId)
  if (doc?.status === 'failed') {
    throw new Error('索引任务已取消')
  }
}
