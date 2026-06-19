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
