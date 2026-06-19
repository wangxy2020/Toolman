import { hashFileBytes, isPdfExtractedTextInsufficient } from '@toolman/knowledge'
import { getDocumentRepository } from '../db/repos'

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
  if (!plainText || isPdfExtractedTextInsufficient(plainText, Math.max(chunkTexts.length, 1))) {
    return null
  }
  return plainText
}
