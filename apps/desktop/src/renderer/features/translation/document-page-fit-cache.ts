import type { DocumentPageFitRecord } from './document-page-fit'

const fitCache = new Map<string, DocumentPageFitRecord>()

export function pageFitCacheKey(documentId: string, pageNumber: number): string {
  return `${documentId}::fit::${pageNumber}`
}

export function getCachedPageFit(
  documentId: string | null | undefined,
  pageNumber: number,
): DocumentPageFitRecord | null {
  if (!documentId) return null
  return fitCache.get(pageFitCacheKey(documentId, pageNumber)) ?? null
}

export function setCachedPageFit(
  documentId: string | null | undefined,
  pageNumber: number,
  fit: DocumentPageFitRecord,
): void {
  if (!documentId) return
  fitCache.set(pageFitCacheKey(documentId, pageNumber), fit)
}
