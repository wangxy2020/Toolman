import { describe, expect, it, vi } from 'vitest'

import {
  ACTIVE_INGEST_STAGES,
  buildDocumentTitle,
  buildIngestProgressHandlers,
  createParsingProgressPulse,
  IN_FLIGHT_INGEST_STAGES,
  recordIngestFailure,
  STAGE_PROGRESS,
  ensureIngestDocument,
  refreshKbStats,
  resolveMonotonicIngestProgress,
  updateDocumentStage,
} from './knowledge-ingest-shared'

const broadcast = vi.hoisted(() => vi.fn())
const isCancelled = vi.hoisted(() => vi.fn(() => false))
const isInFlight = vi.hoisted(() => vi.fn(() => false))
const findActiveDocumentByPath = vi.hoisted(() =>
  vi.fn<() => { id: string } | null>(() => null),
)
const updateKnowledgeBase = vi.hoisted(() => vi.fn())

vi.mock('../db/repos', () => ({
  getDocumentRepository: vi.fn(() => ({
    countByKb: vi.fn(() => 3),
    countChunksByKb: vi.fn(() => 12),
  })),
  getKnowledgeBaseRepository: vi.fn(() => ({
    update: updateKnowledgeBase,
  })),
}))

vi.mock('./knowledge-ingest-broadcast', () => ({
  broadcastKnowledgeIngestEvent: broadcast,
}))

vi.mock('./knowledge-ingest-manager.service', () => ({
  clearIngestCancel: vi.fn(),
  isIngestCancelled: isCancelled,
  isIngestInFlight: isInFlight,
}))

vi.mock('./knowledge-document-lifecycle.util', () => ({
  findActiveDocumentById: vi.fn(() => null),
  findActiveDocumentByPath,
}))

describe('knowledge-ingest-shared', () => {
  it('maps ingest stages to progress values', () => {
    expect(STAGE_PROGRESS.ready).toBe(100)
    expect(STAGE_PROGRESS.ocr).toBe(25)
    expect(STAGE_PROGRESS.failed).toBe(0)
    expect(ACTIVE_INGEST_STAGES.has('queued')).toBe(true)
    expect(ACTIVE_INGEST_STAGES.has('ocr')).toBe(true)
    expect(IN_FLIGHT_INGEST_STAGES.has('ocr')).toBe(true)
    expect(IN_FLIGHT_INGEST_STAGES.has('embedding')).toBe(true)
    expect(IN_FLIGHT_INGEST_STAGES.has('queued')).toBe(false)
  })

  it('keeps in-flight ingest progress from jumping backwards', () => {
    expect(
      resolveMonotonicIngestProgress({ stage: 'parsing', requested: 20, previous: 62 }),
    ).toBe(62)
    expect(
      resolveMonotonicIngestProgress({ stage: 'chunking', requested: 40, previous: 64 }),
    ).toBe(64)
    expect(
      resolveMonotonicIngestProgress({ stage: 'failed', requested: 0, previous: 62 }),
    ).toBe(0)
    expect(
      resolveMonotonicIngestProgress({ stage: 'queued', requested: 5, previous: 62 }),
    ).toBe(5)
  })

  it('buildDocumentTitle uses the final path segment', () => {
    expect(buildDocumentTitle('/tmp/docs/report.md')).toBe('report.md')
    expect(buildDocumentTitle('C:\\data\\sheet.xlsx')).toBe('sheet.xlsx')
    expect(buildDocumentTitle('plain-name')).toBe('plain-name')
  })

  it('updateDocumentStage writes repo state and broadcasts progress', () => {
    const repo = {
      findById: vi.fn(() => null),
      update: vi.fn(),
      upsertIngestJob: vi.fn(),
    }

    updateDocumentStage(repo as never, {
      workspaceId: 'ws-1',
      kbId: 'kb-1',
      documentId: 'doc-1',
      stage: 'parsing',
      progress: 25,
    })

    expect(repo.update).toHaveBeenCalledWith('doc-1', 'kb-1', { status: 'parsing' })
    expect(repo.upsertIngestJob).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 'parsing', progress: 25 }),
    )
    expect(broadcast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'document.stage', stage: 'parsing' }),
    )
  })

  it('updateDocumentStage does not regress a ready document unless ingest is in flight', () => {
    const repo = {
      findById: vi.fn(() => ({ status: 'ready' })),
      update: vi.fn(),
      upsertIngestJob: vi.fn(),
    }

    updateDocumentStage(repo as never, {
      workspaceId: 'ws-1',
      kbId: 'kb-1',
      documentId: 'doc-1',
      stage: 'parsing',
      progress: 25,
    })

    expect(repo.update).not.toHaveBeenCalled()
    expect(repo.upsertIngestJob).not.toHaveBeenCalled()

    isInFlight.mockReturnValueOnce(true)
    updateDocumentStage(repo as never, {
      workspaceId: 'ws-1',
      kbId: 'kb-1',
      documentId: 'doc-1',
      stage: 'parsing',
      progress: 25,
    })
    expect(repo.update).toHaveBeenCalledWith('doc-1', 'kb-1', { status: 'parsing' })
    isInFlight.mockReturnValue(false)
  })

  it('createParsingProgressPulse advances parsing progress until stopped', () => {
    vi.useFakeTimers()
    const repo = {
      findById: vi.fn(() => null),
      update: vi.fn(),
      upsertIngestJob: vi.fn(),
    }
    const stop = createParsingProgressPulse(repo as never, {
      workspaceId: 'ws-1',
      kbId: 'kb-1',
      documentId: 'doc-1',
    }, 1000)

    vi.advanceTimersByTime(3000)
    expect(repo.upsertIngestJob).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 'parsing', progress: 23 }),
    )

    stop()
    vi.useRealTimers()
  })

  it('createParsingProgressPulse stops writing after the document becomes ready', () => {
    vi.useFakeTimers()
    const findById = vi.fn()
      .mockReturnValueOnce({ status: 'parsing' })
      .mockReturnValueOnce({ status: 'parsing' })
      .mockReturnValue({ status: 'ready' })
    const repo = {
      findById,
      update: vi.fn(),
      upsertIngestJob: vi.fn(),
    }
    const stop = createParsingProgressPulse(
      repo as never,
      {
        workspaceId: 'ws-1',
        kbId: 'kb-1',
        documentId: 'doc-ready',
      },
      1000,
    )

    vi.advanceTimersByTime(1000)
    expect(repo.update).toHaveBeenCalledTimes(1)
    repo.update.mockClear()
    repo.upsertIngestJob.mockClear()

    vi.advanceTimersByTime(5000)
    expect(repo.update).not.toHaveBeenCalled()
    expect(repo.upsertIngestJob).not.toHaveBeenCalled()

    stop()
    vi.useRealTimers()
  })

  it('createParsingProgressPulse can crawl past the old 39% soft ceiling', () => {
    vi.useFakeTimers()
    const repo = {
      findById: vi.fn(() => null),
      update: vi.fn(),
      upsertIngestJob: vi.fn(),
    }
    const stop = createParsingProgressPulse(
      repo as never,
      {
        workspaceId: 'ws-1',
        kbId: 'kb-1',
        documentId: 'doc-1',
      },
      1000,
    )

    vi.advanceTimersByTime(45_000)
    const progresses = repo.upsertIngestJob.mock.calls.map(
      (call) => (call[0] as { progress: number }).progress,
    )
    expect(Math.max(...progresses)).toBeGreaterThan(39)

    stop()
    vi.useRealTimers()
  })

  it('buildIngestProgressHandlers maps ocr and embed progress', () => {
    const repo = {
      findById: vi.fn(() => null),
      update: vi.fn(),
      upsertIngestJob: vi.fn(),
    }
    const handlers = buildIngestProgressHandlers(repo as never, {
      workspaceId: 'ws-1',
      kbId: 'kb-1',
      documentId: 'doc-1',
    })

    handlers.onOcrProgress(0, 2, true)
    handlers.onOcrProgress(1, 2)
    handlers.onEmbedProgress(1, 2)

    expect(repo.update).toHaveBeenCalledTimes(3)
    expect(repo.upsertIngestJob).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 'embedding' }),
    )
    expect(repo.update).toHaveBeenCalledWith(
      'doc-1',
      'kb-1',
      expect.objectContaining({ status: 'ocr' }),
    )
    expect(broadcast).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'ocr',
        progressDetail: { unit: 'page', current: 1, total: 2 },
      }),
    )
    expect(broadcast).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'embedding',
        progressDetail: { unit: 'chunk', current: 1, total: 2 },
      }),
    )
  })

  it('does not reset Hybrid OCR progress when glm-ocr starts from page 1', () => {
    const repo = {
      findById: vi.fn(() => null),
      findIngestJobByDocumentId: vi.fn(() => ({ progress: 62 })),
      update: vi.fn(),
      upsertIngestJob: vi.fn(),
    }
    const handlers = buildIngestProgressHandlers(repo as never, {
      workspaceId: 'ws-1',
      kbId: 'kb-1',
      documentId: 'doc-hybrid',
    })

    handlers.onOcrProgress(210, 289)
    handlers.onOcrProgress(0, 200, true)

    const progresses = repo.upsertIngestJob.mock.calls.map(
      (call) => (call[0] as { progress: number }).progress,
    )
    expect(Math.min(...progresses)).toBeGreaterThanOrEqual(62)
    const lastEvent = broadcast.mock.calls.at(-1)?.[0] as {
      progress: number
      progressDetail: { unit: string; current: number; total: number }
    }
    expect(lastEvent.progress).toBeGreaterThanOrEqual(62)
    expect(lastEvent.progressDetail).toEqual({ unit: 'page', current: 210, total: 289 })
  })

  it('recordIngestFailure creates failed documents for new paths', () => {
    const repo = {
      findById: vi.fn(() => null),
      create: vi.fn(() => ({ id: 'doc-new' })),
      update: vi.fn(),
      upsertIngestJob: vi.fn(),
    }

    recordIngestFailure(repo as never, 'ws-1', 'kb-1', '/tmp/report.pdf', 'parse failed')

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'report.pdf',
        status: 'failed',
        absolutePath: '/tmp/report.pdf',
      }),
    )
    expect(repo.update).toHaveBeenCalledWith(
      'doc-new',
      'kb-1',
      expect.objectContaining({ status: 'failed' }),
    )
  })

  it('ensureIngestDocument updates an existing document by path', () => {
    const repo = {
      findById: vi.fn(() => null),
      create: vi.fn(),
      update: vi.fn(),
      upsertIngestJob: vi.fn(),
    }
    findActiveDocumentByPath.mockReturnValue({ id: 'doc-existing' })

    const doc = ensureIngestDocument(
      repo as never,
      'ws-1',
      'kb-1',
      '/tmp/report.pdf',
      'hash-1',
    )

    expect(doc).toEqual({ id: 'doc-existing' })
    expect(repo.update).toHaveBeenCalledWith(
      'doc-existing',
      'kb-1',
      expect.objectContaining({ status: 'parsing', contentHash: 'hash-1' }),
    )
  })

  it('refreshKbStats updates knowledge base counters', () => {
    refreshKbStats('ws-1', 'kb-1', { status: 'indexing' })

    expect(updateKnowledgeBase).toHaveBeenCalledWith({
      id: 'kb-1',
      workspaceId: 'ws-1',
      documentCount: 3,
      chunkCount: 12,
      status: 'indexing',
    })
  })
})
