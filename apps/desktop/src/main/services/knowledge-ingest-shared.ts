import type { DocumentRepository } from '@toolman/db'
import type { KnowledgeDocument } from '@toolman/shared'
import { isIgnoredKnowledgeIngestFile } from '@toolman/knowledge'
import { getDocumentRepository, getKnowledgeBaseRepository } from '../db/repos'
import { broadcastKnowledgeIngestEvent } from './knowledge-ingest-broadcast'
import { clearIngestCancel, isIngestCancelled } from './knowledge-ingest-manager.service'
import {
  findActiveDocumentById,
  findActiveDocumentByPath,
} from './knowledge-document-lifecycle.util'

export const STAGE_PROGRESS: Record<string, number> = {
  queued: 5,
  parsing: 20,
  chunking: 40,
  embedding: 65,
  indexing: 85,
  ready: 100,
  failed: 0,
}

export const ACTIVE_INGEST_STAGES = new Set([
  'queued',
  'parsing',
  'chunking',
  'embedding',
  'indexing',
])

export const IN_FLIGHT_INGEST_STAGES = new Set(['parsing', 'chunking', 'embedding', 'indexing'])

export interface IngestFileAtPathOptions {
  workspaceId: string
  kbId: string
  filePath: string
  sourceId?: string | null
  documentId?: string
  skipP2pSync?: boolean
}

export interface IngestFileAtPathResult {
  outcome: 'ingested' | 'skipped' | 'failed'
  path: string
  message?: string
}

export function buildDocumentTitle(filePath: string): string {
  return filePath.split(/[/\\]/).pop() ?? filePath
}

export function emitIngestStage(options: {
  workspaceId: string
  kbId: string
  documentId: string
  stage: KnowledgeDocument['status']
  progress?: number
  errorMessage?: string | null
}) {
  broadcastKnowledgeIngestEvent({
    type: 'document.stage',
    workspaceId: options.workspaceId,
    kbId: options.kbId,
    documentId: options.documentId,
    stage: options.stage,
    progress: options.progress,
    ...(options.errorMessage !== undefined ? { errorMessage: options.errorMessage } : {}),
  })
}

export function updateDocumentStage(
  repo: DocumentRepository,
  options: {
    workspaceId: string
    kbId: string
    documentId: string
    stage: KnowledgeDocument['status']
    errorMessage?: string | null
    progress?: number
    patch?: Parameters<DocumentRepository['update']>[2]
  },
) {
  if (isIngestCancelled(options.documentId) && options.stage !== 'failed') {
    return
  }
  if (options.stage !== 'failed') {
    const current = repo.findById(options.documentId, options.kbId)
    if (current?.status === 'failed') {
      const restarting =
        options.stage === 'parsing' || options.errorMessage === null
      if (!restarting) {
        return
      }
    }
  }

  repo.update(options.documentId, options.kbId, {
    ...options.patch,
    status: options.stage,
    ...(options.errorMessage !== undefined
      ? { errorJson: options.errorMessage ? JSON.stringify({ message: options.errorMessage }) : null }
      : {}),
  })
  repo.upsertIngestJob({
    workspaceId: options.workspaceId,
    kbId: options.kbId,
    documentId: options.documentId,
    stage: options.stage,
    progress: options.progress ?? STAGE_PROGRESS[options.stage] ?? 0,
    errorJson:
      options.errorMessage !== undefined
        ? options.errorMessage
          ? JSON.stringify({ message: options.errorMessage })
          : null
        : undefined,
  })
  emitIngestStage({
    workspaceId: options.workspaceId,
    kbId: options.kbId,
    documentId: options.documentId,
    stage: options.stage,
    progress: options.progress ?? STAGE_PROGRESS[options.stage] ?? 0,
    errorMessage: options.errorMessage,
  })
}

export function buildIngestProgressHandlers(
  repo: DocumentRepository,
  ctx: { workspaceId: string; kbId: string; documentId: string },
) {
  return {
    onOcrProgress: (currentPage: number, totalPages: number) => {
      if (totalPages <= 0) return
      updateDocumentStage(repo, {
        ...ctx,
        stage: 'parsing',
        progress: 20 + Math.floor((currentPage / totalPages) * 19),
      })
    },
    onEmbedProgress: (completed: number, total: number) => {
      if (total <= 0) return
      updateDocumentStage(repo, {
        ...ctx,
        stage: 'embedding',
        progress: 65 + Math.floor((completed / total) * 19),
      })
    },
  }
}

export function recordIngestFailure(
  repo: DocumentRepository,
  workspaceId: string,
  kbId: string,
  filePath: string,
  message: string,
) {
  if (isIgnoredKnowledgeIngestFile(filePath)) return

  const title = buildDocumentTitle(filePath)

  const existing = findActiveDocumentByPath(repo, kbId, filePath)
  if (existing) {
    updateDocumentStage(repo, {
      workspaceId,
      kbId,
      documentId: existing.id,
      stage: 'failed',
      errorMessage: message,
      patch: { title },
    })
    return
  }

  const created = repo.create({
    kbId,
    sourceId: null,
    title,
    contentHash: null,
    status: 'failed',
    absolutePath: filePath,
  })
  updateDocumentStage(repo, {
    workspaceId,
    kbId,
    documentId: created.id,
    stage: 'failed',
    errorMessage: message,
  })
}

export function ensureIngestDocument(
  repo: DocumentRepository,
  workspaceId: string,
  kbId: string,
  filePath: string,
  contentHash: string,
  sourceId?: string | null,
  documentId?: string,
) {
  const title = buildDocumentTitle(filePath)

  if (documentId) {
    const existing = findActiveDocumentById(repo, kbId, documentId)
    if (existing) {
      clearIngestCancel(existing.id)
      updateDocumentStage(repo, {
        workspaceId,
        kbId,
        documentId: existing.id,
        stage: 'parsing',
        errorMessage: null,
        patch: { title, contentHash, absolutePath: filePath },
      })
      return existing
    }

    const created = repo.create({
      id: documentId,
      kbId,
      sourceId: sourceId ?? null,
      title,
      contentHash,
      status: 'parsing',
      absolutePath: filePath,
    })
    updateDocumentStage(repo, {
      workspaceId,
      kbId,
      documentId: created.id,
      stage: 'parsing',
      errorMessage: null,
    })
    return created
  }

  const existing = findActiveDocumentByPath(repo, kbId, filePath)
  if (existing) {
    clearIngestCancel(existing.id)
    updateDocumentStage(repo, {
      workspaceId,
      kbId,
      documentId: existing.id,
      stage: 'parsing',
      errorMessage: null,
      patch: { title, contentHash },
    })
    return existing
  }

  const created = repo.create({
    kbId,
    sourceId: sourceId ?? null,
    title,
    contentHash,
    status: 'parsing',
    absolutePath: filePath,
  })
  updateDocumentStage(repo, {
    workspaceId,
    kbId,
    documentId: created.id,
    stage: 'parsing',
    errorMessage: null,
  })
  return created
}

export function refreshKbStats(
  workspaceId: string,
  kbId: string,
  patch?: { status?: 'idle' | 'indexing' | 'reindexing' | 'error' },
) {
  const repo = getDocumentRepository()
  getKnowledgeBaseRepository().update({
    id: kbId,
    workspaceId,
    documentCount: repo.countByKb(kbId),
    chunkCount: repo.countChunksByKb(kbId),
    status: patch?.status,
  })
}
