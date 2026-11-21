import { hashFileBytes, isPdfExtractedTextInsufficient } from '@toolman/knowledge'
import { getDocumentRepository } from '../db/repos'

/**
 * Prefer already-ingested KB text over re-parsing.
 * `absolutePath` must be the knowledge-library path (not a blob-cache path).
 */
export function tryGetIndexedPlainText(
  workspaceId: string,
  absolutePath: string,
): string | null {
  const repo = getDocumentRepository()
  const registry = repo.findRegistryByPath(workspaceId, absolutePath)
  if (!registry?.documentId) return null

  try {
    const currentHash = hashFileBytes(absolutePath)
    if (registry.contentHash !== currentHash) return null
  } catch {
    return null
  }

  const document = repo.findDocumentById(registry.documentId)
  if (!document || document.status !== 'ready') return null

  const chunkTexts = repo.listChunkTextsByDocument(document.id, document.kbId)
  const plainText = chunkTexts.join('\n\n').trim()
  if (!plainText) return null

  // Use pageCount=1: chunk count is not PDF page count and would falsely reject
  // OCR'd multi-chunk documents (length/pages threshold).
  if (isPdfExtractedTextInsufficient(plainText, 1)) return null
  return plainText
}
