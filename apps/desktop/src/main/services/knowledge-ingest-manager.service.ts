import type { DocumentRepository } from '@toolman/db'

const cancelledDocumentIds = new Set<string>()
const ingestActiveCounts = new Map<string, number>()
const ingestOcrAborts = new Map<string, AbortController>()

export function markIngestActive(documentId: string): void {
  ingestActiveCounts.set(documentId, (ingestActiveCounts.get(documentId) ?? 0) + 1)
  if (!ingestOcrAborts.has(documentId)) {
    ingestOcrAborts.set(documentId, new AbortController())
  }
}

export function markIngestInactive(documentId: string): void {
  const next = (ingestActiveCounts.get(documentId) ?? 1) - 1
  if (next <= 0) {
    ingestActiveCounts.delete(documentId)
    ingestOcrAborts.delete(documentId)
  } else ingestActiveCounts.set(documentId, next)
}

export function getIngestOcrAbortSignal(documentId?: string): AbortSignal | undefined {
  if (!documentId) return undefined
  return ingestOcrAborts.get(documentId)?.signal
}

export function isIngestInFlight(documentId: string): boolean {
  return (ingestActiveCounts.get(documentId) ?? 0) > 0
}


export function requestCancelIngest(documentId: string): void {
  cancelledDocumentIds.add(documentId)
  const existing = ingestOcrAborts.get(documentId)
  if (existing) {
    existing.abort()
    return
  }
  const controller = new AbortController()
  controller.abort()
  ingestOcrAborts.set(documentId, controller)
}

export function clearIngestCancel(documentId: string): void {
  cancelledDocumentIds.delete(documentId)
  const current = ingestOcrAborts.get(documentId)
  if (!current || current.signal.aborted) {
    ingestOcrAborts.set(documentId, new AbortController())
  }
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
  if (doc?.status === 'failed' || doc?.status === 'cancelled') {
    throw new Error('索引任务已取消')
  }
}
