import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { assessKnowledgeHealth, knowledgeKindAllowsRetrieval, type KnowledgeHealthReport } from '@toolman/shared'
import { hashFileStream, openKbVectorStore } from '@toolman/knowledge'
import { getChunkFtsRepository, getDocumentRepository, getKnowledgeBaseRepository } from '../db/repos'
import { getWorkspaceKnowledgeDir } from './knowledge.service'
import { resolveEmbedConfig } from './knowledge-embed.service'
import { resolveActiveIndexVersion } from './knowledge-index-version.service'

export async function inspectKnowledgeDocumentHealth(options: {
  workspaceId: string
  kbId: string
  documentId: string
}): Promise<KnowledgeHealthReport | null> {
  const kb = getKnowledgeBaseRepository().findRowById(options.kbId, options.workspaceId)
  if (!kb) return null
  const doc = getDocumentRepository().findById(options.documentId, options.kbId)
  if (!doc) return null

  const retrievalEnabled = knowledgeKindAllowsRetrieval(kb.kind)
  const isUrl = Boolean(doc.absolutePath?.startsWith('http://') || doc.absolutePath?.startsWith('https://'))
  const fileExists = isUrl ? null : doc.absolutePath ? existsSync(doc.absolutePath) : false

  let contentHashMatches: boolean | null = null
  if (!isUrl && doc.absolutePath && fileExists && doc.contentHash) {
    try {
      const currentHash = await hashFileStream(doc.absolutePath)
      contentHashMatches = currentHash === doc.contentHash
    } catch {
      contentHashMatches = false
    }
  }

  const chunkCount = getDocumentRepository().countChunksByDocument(doc.id, options.kbId)
  const ftsCount = retrievalEnabled ? getChunkFtsRepository().countByDocument(doc.id) : null

  let vectorCount: number | null = null
  if (retrievalEnabled) {
    const embed = resolveEmbedConfig(options.workspaceId, options.kbId)
    const store = await openKbVectorStore({
      vectorsDir: join(getWorkspaceKnowledgeDir(options.workspaceId), 'vectors'),
      kbId: options.kbId,
      backend: embed.vectorBackend,
      indexVersion: resolveActiveIndexVersion(options.workspaceId, options.kbId),
    })
    vectorCount = (await store.listByDocumentId(doc.id)).length
  }

  return assessKnowledgeHealth({
    status: doc.status,
    fileExists,
    contentHashMatches,
    chunkCount,
    ftsCount,
    vectorCount,
    documentIndexVersion: doc.indexVersion,
    activeIndexVersion: kb.activeIndexVersion,
    sourceValid: isUrl ? true : fileExists !== false,
    retrievalEnabled,
  })
}
