import { existsSync } from 'node:fs'
import type { DocumentRepository } from '@toolman/db'
import type { KnowledgeDocument, KnowledgeIngestProgressDetail } from '@toolman/shared'
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

/** Last page/chunk counters per document — re-attached when stage pulses omit detail. */
const lastIngestProgressDetailByDoc = new Map<string, KnowledgeIngestProgressDetail>()

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
  progressDetail?: KnowledgeIngestProgressDetail | null
  errorMessage?: string | null
}) {
  broadcastKnowledgeIngestEvent({
    type: 'document.stage',
    workspaceId: options.workspaceId,
    kbId: options.kbId,
    documentId: options.documentId,
    stage: options.stage,
    progress: options.progress,
    ...(options.progressDetail !== undefined ? { progressDetail: options.progressDetail } : {}),
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
    progressDetail?: KnowledgeIngestProgressDetail | null
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

  if (options.stage === 'ready' || options.stage === 'failed') {
    lastIngestProgressDetailByDoc.delete(options.documentId)
  } else if (options.progressDetail) {
    lastIngestProgressDetailByDoc.set(options.documentId, options.progressDetail)
  } else if (options.progressDetail === null) {
    lastIngestProgressDetailByDoc.delete(options.documentId)
  }

  const progressDetail =
    options.stage === 'ready' || options.stage === 'failed'
      ? null
      : options.progressDetail !== undefined
        ? options.progressDetail
        : lastIngestProgressDetailByDoc.get(options.documentId)

  emitIngestStage({
    workspaceId: options.workspaceId,
    kbId: options.kbId,
    documentId: options.documentId,
    stage: options.stage,
    progress: options.progress ?? STAGE_PROGRESS[options.stage] ?? 0,
    ...(progressDetail !== undefined ? { progressDetail } : {}),
    errorMessage: options.errorMessage,
  })
}

/** Soft ceiling while waiting on parsers that do not report page progress (below embedding=65). */
const PARSING_PROGRESS_MAX = 60
/**
 * Page-progress band for ODL Hybrid batches and vision OCR.
 * Tops out just below embedding (65) so the bar keeps moving during long scans.
 */
const OCR_PROGRESS_MAX = 64

/** Slow heartbeat while ODL/Hybrid or other non-OCR parsers run (parsing band 20–60). */
export function createParsingProgressPulse(
  repo: DocumentRepository,
  ctx: { workspaceId: string; kbId: string; documentId: string; filePath?: string },
  intervalMs = 3000,
): () => void {
  let progress = STAGE_PROGRESS.parsing
  let ticksAtCeiling = 0
  const timer = setInterval(() => {
    if (ctx.filePath && !existsSync(ctx.filePath)) {
      updateDocumentStage(repo, {
        ...ctx,
        stage: 'failed',
        errorMessage: '源文件已丢失或被删除，无法继续解析',
        progress: 0,
      })
      return
    }
    if (progress >= PARSING_PROGRESS_MAX) {
      ticksAtCeiling += 1
      // Keep refreshing so the UI does not look frozen during long OCR.
      updateDocumentStage(repo, { ...ctx, stage: 'parsing', progress: PARSING_PROGRESS_MAX })
      return
    }
    // Crawl faster early, then slower so large OCR jobs still show movement past ~39%.
    ticksAtCeiling += 1
    const stepEvery = progress < 40 ? 1 : progress < 50 ? 2 : 3
    if (ticksAtCeiling % stepEvery === 0) {
      progress += 1
    }
    updateDocumentStage(repo, { ...ctx, stage: 'parsing', progress })
  }, intervalMs)
  return () => clearInterval(timer)
}

export function buildIngestProgressHandlers(
  repo: DocumentRepository,
  ctx: { workspaceId: string; kbId: string; documentId: string },
) {
  return {
    onOcrProgress: (currentPage: number, totalPages: number, inProgress?: boolean) => {
      if (totalPages <= 0) return
      // parsing band: 20–64 (Hybrid batches / vision OCR). Move as soon as work starts.
      const completedRatio = currentPage / totalPages
      const workingBoost = inProgress && currentPage < totalPages ? 0.5 / totalPages : 0
      const span = OCR_PROGRESS_MAX - STAGE_PROGRESS.parsing
      const progress = Math.min(
        OCR_PROGRESS_MAX,
        STAGE_PROGRESS.parsing +
          Math.max(
            inProgress || currentPage > 0 ? 1 : 0,
            Math.floor((completedRatio + workingBoost) * span),
          ),
      )
      updateDocumentStage(repo, {
        ...ctx,
        stage: 'parsing',
        progress,
        progressDetail: {
          unit: 'page',
          current: Math.min(totalPages, Math.max(0, currentPage)),
          total: totalPages,
        },
      })
    },
    onEmbedProgress: (completed: number, total: number) => {
      if (total <= 0) return
      updateDocumentStage(repo, {
        ...ctx,
        stage: 'embedding',
        progress: 65 + Math.floor((completed / total) * 19),
        progressDetail: {
          unit: 'chunk',
          current: Math.min(total, Math.max(0, completed)),
          total,
        },
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
