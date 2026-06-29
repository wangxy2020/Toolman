import { join } from 'node:path'
import { toErrorMessage } from '@toolman/shared'
import { removeDocumentVectors } from '@toolman/knowledge'
import { getDocumentRepository, getKnowledgeBaseRepository } from '../db/repos'
import { getWorkspaceKnowledgeDir } from './knowledge.service'
import { resolveEmbedConfig } from './knowledge-embed.service'
import { removeDocumentFts } from './knowledge-fts.service'
import { refreshKbStats } from './knowledge-ingest-shared'
import { ingestFileAtPath } from './knowledge-ingest-file'
import { ingestUrlDocument } from './knowledge-ingest-url'

export async function purgeIndexedDocument(options: {
  workspaceId: string
  kbId: string
  documentId: string
}): Promise<void> {
  const repo = getDocumentRepository()
  const embed = resolveEmbedConfig(options.workspaceId, options.kbId)

  await removeDocumentVectors(
    join(getWorkspaceKnowledgeDir(options.workspaceId), 'vectors'),
    options.kbId,
    options.documentId,
    embed.vectorBackend,
  )
  removeDocumentFts(options.documentId)
  repo.deleteChunksByDocument(options.documentId, options.kbId)
  repo.clearRegistryForDocumentIds([options.documentId])
  repo.deleteIngestJobByDocumentId(options.documentId)
  repo.softDelete(options.documentId, options.kbId)
}

export async function handleRemovedFile(options: {
  workspaceId: string
  kbId: string
  filePath: string
}) {
  const repo = getDocumentRepository()
  const doc = repo.findByPath(options.kbId, options.filePath)
  if (!doc) return

  await purgeIndexedDocument({
    workspaceId: options.workspaceId,
    kbId: options.kbId,
    documentId: doc.id,
  })
  refreshKbStats(options.workspaceId, options.kbId)
}

export async function reindexDocument(options: {
  workspaceId: string
  kbId: string
  documentId: string
}) {
  const repo = getDocumentRepository()
  const doc = repo.findById(options.documentId, options.kbId)
  if (!doc?.absolutePath) {
    throw new Error('文档不存在或缺少来源路径')
  }

  getKnowledgeBaseRepository().update({
    id: options.kbId,
    workspaceId: options.workspaceId,
    status: 'reindexing',
  })

  const path = doc.absolutePath
  if (path.startsWith('http://') || path.startsWith('https://')) {
    const result = await ingestUrlDocument({
      workspaceId: options.workspaceId,
      kbId: options.kbId,
      url: path,
      sourceId: doc.sourceId,
    })
    refreshKbStats(options.workspaceId, options.kbId, {
      status: result.outcome === 'failed' ? 'error' : 'idle',
    })
    return {
      outcome: result.outcome,
      path,
      message: result.message,
    }
  }

  const result = await ingestFileAtPath({
    workspaceId: options.workspaceId,
    kbId: options.kbId,
    filePath: path,
    sourceId: doc.sourceId,
    documentId: options.documentId,
  })

  refreshKbStats(options.workspaceId, options.kbId, {
    status: result.outcome === 'failed' ? 'error' : 'idle',
  })

  return result
}

export async function reindexKnowledgeBase(options: {
  workspaceId: string
  kbId: string
}) {
  const repo = getDocumentRepository()
  const docs = repo.listByKb(options.kbId)

  getKnowledgeBaseRepository().update({
    id: options.kbId,
    workspaceId: options.workspaceId,
    status: 'reindexing',
  })

  let ingested = 0
  let skipped = 0
  const failed: Array<{ path: string; message: string }> = []

  for (const doc of docs) {
    if (!doc.absolutePath) continue
    try {
      const result = await reindexDocument({
        workspaceId: options.workspaceId,
        kbId: options.kbId,
        documentId: doc.id,
      })
      if (result.outcome === 'ingested') ingested++
      else if (result.outcome === 'skipped') skipped++
      else failed.push({ path: doc.absolutePath, message: result.message ?? '重建失败' })
    } catch (error) {
      failed.push({
        path: doc.absolutePath,
        message: toErrorMessage(error, '重建失败'),
      })
    }
  }

  refreshKbStats(options.workspaceId, options.kbId, {
    status: failed.length > 0 && ingested === 0 ? 'error' : 'idle',
  })

  return { ingested, skipped, failed, total: docs.length }
}
