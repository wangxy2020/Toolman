import { existsSync } from 'node:fs'
import type { DocumentRepository } from '@toolman/db'
import type { KnowledgeDocument, KnowledgeIngestProgressDetail } from '@toolman/shared'
import { broadcastKnowledgeIngestEvent } from './knowledge-ingest-broadcast'
import { isIngestCancelled, isIngestInFlight } from './knowledge-ingest-manager.service'

export const STAGE_PROGRESS: Record<string, number> = {
  queued: 5,
  parsing: 20,
  ocr: 25,
  chunking: 40,
  embedding: 65,
  indexing: 85,
  ready: 100,
  failed: 0,
  cancelled: 0,
  stale: 0,
}

export const ACTIVE_INGEST_STAGES = new Set([
  'queued',
  'parsing',
  'ocr',
  'chunking',
  'embedding',
  'indexing',
])

export const IN_FLIGHT_INGEST_STAGES = new Set(['parsing', 'ocr', 'chunking', 'embedding', 'indexing'])

/** Parse/OCR has not finished — leftover chunks must not be treated as a successful index. */
export const PARSE_INCOMPLETE_INGEST_STAGES = new Set(['queued', 'parsing', 'ocr'])

/** Last page/chunk counters per document — re-attached when stage pulses omit detail. */
const lastIngestProgressDetailByDoc = new Map<string, KnowledgeIngestProgressDetail>()

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

/** Failed/queued jobs may drop; in-flight parse/embed must never jump backwards. */
export function resolveMonotonicIngestProgress(options: {
  stage: KnowledgeDocument['status']
  requested: number
  previous?: number | null
}): number {
  const { stage, requested, previous } = options
  if (stage === 'failed' || stage === 'cancelled' || stage === 'queued' || stage === 'stale') {
    return requested
  }
  if (stage === 'ready') return 100
  return Math.max(previous ?? 0, requested)
}

function resolvePageProgressDetail(
  previous: KnowledgeIngestProgressDetail | undefined,
  currentPage: number,
  totalPages: number,
): KnowledgeIngestProgressDetail {
  const current = Math.min(totalPages, Math.max(0, currentPage))
  if (previous?.unit === 'page' && previous.total > 0) {
    return {
      unit: 'page',
      current: Math.max(previous.current, current),
      total: Math.max(previous.total, totalPages),
    }
  }
  return { unit: 'page', current, total: totalPages }
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
  if (
    isIngestCancelled(options.documentId) &&
    options.stage !== 'failed' &&
    options.stage !== 'cancelled'
  ) {
    return
  }
  const current = repo.findById(options.documentId, options.kbId)
  if (options.stage !== 'failed' && options.stage !== 'cancelled') {
    if (current?.status === 'failed' || current?.status === 'cancelled') {
      const restarting =
        options.stage === 'parsing' ||
        options.stage === 'ocr' ||
        options.stage === 'queued' ||
        options.errorMessage === null
      if (!restarting) {
        return
      }
    }
  }
  if (
    current?.status === 'ready' &&
    ACTIVE_INGEST_STAGES.has(options.stage) &&
    options.stage !== 'queued' &&
    !isIngestInFlight(options.documentId)
  ) {
    return
  }

  repo.update(options.documentId, options.kbId, {
    ...options.patch,
    status: options.stage,
    ...(options.errorMessage !== undefined
      ? { errorJson: options.errorMessage ? JSON.stringify({ message: options.errorMessage }) : null }
      : {}),
  })
  const requestedProgress = options.progress ?? STAGE_PROGRESS[options.stage] ?? 0
  const previousProgress = repo.findIngestJobByDocumentId?.(options.documentId)?.progress ?? 0
  const progress = resolveMonotonicIngestProgress({
    stage: options.stage,
    requested: requestedProgress,
    previous: previousProgress,
  })

  repo.upsertIngestJob({
    workspaceId: options.workspaceId,
    kbId: options.kbId,
    documentId: options.documentId,
    stage: options.stage,
    progress,
    errorJson:
      options.errorMessage !== undefined
        ? options.errorMessage
          ? JSON.stringify({ message: options.errorMessage })
          : null
        : undefined,
  })

  if (options.stage === 'ready' || options.stage === 'failed' || options.stage === 'cancelled') {
    lastIngestProgressDetailByDoc.delete(options.documentId)
  } else if (options.progressDetail) {
    lastIngestProgressDetailByDoc.set(options.documentId, options.progressDetail)
  } else if (options.progressDetail === null) {
    lastIngestProgressDetailByDoc.delete(options.documentId)
  }

  const progressDetail =
    options.stage === 'ready' || options.stage === 'failed' || options.stage === 'cancelled'
      ? null
      : options.progressDetail !== undefined
        ? options.progressDetail
        : lastIngestProgressDetailByDoc.get(options.documentId)

  emitIngestStage({
    workspaceId: options.workspaceId,
    kbId: options.kbId,
    documentId: options.documentId,
    stage: options.stage,
    progress,
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
    const current = repo.findById(ctx.documentId, ctx.kbId)
    if (
      current &&
      current.status !== 'queued' &&
      current.status !== 'parsing'
    ) {
      clearInterval(timer)
      return
    }
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
      const completedRatio = currentPage / totalPages
      const workingBoost = inProgress && currentPage < totalPages ? 0.5 / totalPages : 0
      const span = OCR_PROGRESS_MAX - STAGE_PROGRESS.ocr
      const mappedFromStart =
        STAGE_PROGRESS.ocr +
        Math.max(
          inProgress || currentPage > 0 ? 1 : 0,
          Math.floor((completedRatio + workingBoost) * span),
        )
      const floor = repo.findIngestJobByDocumentId?.(ctx.documentId)?.progress ?? STAGE_PROGRESS.ocr
      const remainingSpan = Math.max(0, OCR_PROGRESS_MAX - floor)
      const mappedFromFloor = floor + Math.floor((completedRatio + workingBoost) * remainingSpan)
      const progress = Math.min(
        OCR_PROGRESS_MAX,
        Math.max(floor, mappedFromStart, mappedFromFloor),
      )
      updateDocumentStage(repo, {
        ...ctx,
        stage: 'ocr',
        progress,
        progressDetail: resolvePageProgressDetail(
          lastIngestProgressDetailByDoc.get(ctx.documentId),
          currentPage,
          totalPages,
        ),
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
