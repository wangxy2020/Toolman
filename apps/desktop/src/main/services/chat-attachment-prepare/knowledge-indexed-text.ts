import { getDocumentRepository } from '../../db/repos'
import { truncateForChat } from './constants'

/**
 * Prefer already-ingested KB chunk text over re-parsing scan PDFs in chat.
 * `filePath` must be the knowledge-library absolute path (not a blob-cache path).
 */
export function tryKnowledgeIndexedText(
  filePath: string,
  workspaceId: string | undefined,
): string | null {
  if (!workspaceId || !filePath.trim()) return null
  // Staged chat attachments resolve reads via blobHash → blob storage path;
  // that path is never registered in the KB file registry.
  if (/[/\\]blobs[/\\]/i.test(filePath) || /^clipboard:/i.test(filePath)) {
    return null
  }

  try {
    const repo = getDocumentRepository()
    const registry = repo.findRegistryByPath(workspaceId, filePath)
    const documentId = registry?.documentId?.trim()
    if (!documentId) return null

    const doc = repo.findDocumentById(documentId)
    if (!doc || doc.deletedAt || !doc.kbId) return null
    if (doc.status && doc.status !== 'ready') return null

    const texts = repo
      .listChunkTextsByDocument(documentId, doc.kbId)
      .map((text) => text.trim())
      .filter(Boolean)
    if (texts.length === 0) return null

    return truncateForChat(texts.join('\n\n'))
  } catch {
    return null
  }
}
