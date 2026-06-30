import { describe, expect, it, vi } from 'vitest'

import {
  ACTIVE_INGEST_STAGES,
  buildDocumentTitle,
  buildIngestProgressHandlers,
  IN_FLIGHT_INGEST_STAGES,
  recordIngestFailure,
  STAGE_PROGRESS,
  ensureIngestDocument,
  refreshKbStats,
  updateDocumentStage,
} from './knowledge-ingest-shared'

const broadcast = vi.hoisted(() => vi.fn())
const isCancelled = vi.hoisted(() => vi.fn(() => false))
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
}))

vi.mock('./knowledge-document-lifecycle.util', () => ({
  findActiveDocumentById: vi.fn(() => null),
  findActiveDocumentByPath,
}))

describe('knowledge-ingest-shared', () => {
  it('maps ingest stages to progress values', () => {
    expect(STAGE_PROGRESS.ready).toBe(100)
    expect(STAGE_PROGRESS.failed).toBe(0)
    expect(ACTIVE_INGEST_STAGES.has('queued')).toBe(true)
    expect(IN_FLIGHT_INGEST_STAGES.has('embedding')).toBe(true)
    expect(IN_FLIGHT_INGEST_STAGES.has('queued')).toBe(false)
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

    handlers.onOcrProgress(1, 2)
    handlers.onEmbedProgress(1, 2)

    expect(repo.update).toHaveBeenCalledTimes(2)
    expect(repo.upsertIngestJob).toHaveBeenCalledWith(
      expect.objectContaining({ stage: 'embedding' }),
    )
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
