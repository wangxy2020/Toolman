import { join } from 'node:path'
import { toErrorMessage } from '@toolman/shared'
import { removeDocumentVectors } from '@toolman/knowledge'
import { getDocumentRepository, getKnowledgeBaseRepository } from '../db/repos'
import { fireAndForget } from '../lib/fire-and-forget'
import { getWorkspaceKnowledgeDir } from './knowledge.service'
import { resolveEmbedConfig } from './knowledge-embed.service'
import { removeDocumentFts } from './knowledge-fts.service'
import { refreshKbStats, updateDocumentStage } from './knowledge-ingest-shared'
import { ingestFileAtPath } from './knowledge-ingest-file'
import { ingestUrlDocument } from './knowledge-ingest-url'
import { clearIngestCancel, markIngestActive, markIngestInactive } from './knowledge-ingest-manager.service'
import {
  activateKnowledgeIndexVersion,
  beginKnowledgeIndexRebuild,
  failKnowledgeIndexVersion,
  resolveActiveIndexVersion,
} from './knowledge-index-version.service'

export async function purgeIndexedDocument(options: {
  workspaceId: string
  kbId: string
  documentId: string
}): Promise<void> {
  const repo = getDocumentRepository()
  const embed = resolveEmbedConfig(options.workspaceId, options.kbId)
  const indexVersion = resolveActiveIndexVersion(options.workspaceId, options.kbId)

  await removeDocumentVectors(
    join(getWorkspaceKnowledgeDir(options.workspaceId), 'vectors'),
    options.kbId,
    options.documentId,
    embed.vectorBackend,
    indexVersion,
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

function markDocumentQueuedForReindex(options: {
  workspaceId: string
  kbId: string
  documentId: string
}): boolean {
  const repo = getDocumentRepository()
  const doc = repo.findById(options.documentId, options.kbId)
  if (!doc?.absolutePath) return false
  clearIngestCancel(options.documentId)
  markIngestActive(options.documentId)
  updateDocumentStage(repo, {
    workspaceId: options.workspaceId,
    kbId: options.kbId,
    documentId: options.documentId,
    stage: 'queued',
    errorMessage: null,
  })
  return true
}

export async function reindexDocument(options: {
  workspaceId: string
  kbId: string
  documentId: string
  indexVersion?: number
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
  markDocumentQueuedForReindex(options)

  const path = doc.absolutePath
  try {
    if (path.startsWith('http://') || path.startsWith('https://')) {
      const result = await ingestUrlDocument({
        workspaceId: options.workspaceId,
        kbId: options.kbId,
        url: path,
        sourceId: doc.sourceId,
        indexVersion: options.indexVersion,
        force: true,
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
      indexVersion: options.indexVersion,
      force: true,
    })

    refreshKbStats(options.workspaceId, options.kbId, {
      status: result.outcome === 'failed' ? 'error' : 'idle',
    })

    return result
  } finally {
    markIngestInactive(options.documentId)
  }
}

function listDocumentsForReindex(kbId: string, documentIds?: string[]) {
  const repo = getDocumentRepository()
  const docs = repo.listByKb(kbId)
  if (!documentIds?.length) return docs
  const allow = new Set(documentIds)
  return docs.filter((doc) => allow.has(doc.id))
}

export async function reindexKnowledgeBase(options: {
  workspaceId: string
  kbId: string
  documentIds?: string[]
}) {
  const docs = listDocumentsForReindex(options.kbId, options.documentIds)
  const previousVersion = resolveActiveIndexVersion(options.workspaceId, options.kbId)
  const rebuild = beginKnowledgeIndexRebuild(options.workspaceId, options.kbId)

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
        indexVersion: rebuild.indexVersion,
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

  if (rebuild.switched) {
    if (failed.length === 0) {
      await activateKnowledgeIndexVersion({
        workspaceId: options.workspaceId,
        kbId: options.kbId,
        indexVersion: rebuild.indexVersion,
        previousVersion,
      })
    } else {
      await failKnowledgeIndexVersion({
        workspaceId: options.workspaceId,
        kbId: options.kbId,
        indexVersion: rebuild.indexVersion,
        message: failed[0]?.message ?? '重建失败',
      })
    }
  } else {
    refreshKbStats(options.workspaceId, options.kbId, {
      status: failed.length > 0 && ingested === 0 ? 'error' : 'idle',
    })
  }

  return { ingested, skipped, failed, total: docs.length }
}

export function startReindexDocumentInBackground(options: {
  workspaceId: string
  kbId: string
  documentId: string
}): { outcome: 'queued'; path?: string } {
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
  fireAndForget('knowledge-ingest', reindexDocument(options))
  return { outcome: 'queued', path: doc.absolutePath }
}

export function startReindexKnowledgeBaseInBackground(options: {
  workspaceId: string
  kbId: string
  documentIds?: string[]
}): {
  ingested: number
  skipped: number
  failed: Array<{ path: string; message: string }>
  total: number
} {
  const docs = listDocumentsForReindex(options.kbId, options.documentIds).filter(
    (doc) => doc.absolutePath,
  )
  getKnowledgeBaseRepository().update({
    id: options.kbId,
    workspaceId: options.workspaceId,
    status: 'reindexing',
  })
  fireAndForget('knowledge-ingest', reindexKnowledgeBase(options))
  return { ingested: 0, skipped: 0, failed: [], total: docs.length }
}
