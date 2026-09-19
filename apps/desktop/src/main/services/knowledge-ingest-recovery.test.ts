import { beforeEach, describe, expect, it, vi } from 'vitest'

const updateDocumentStage = vi.hoisted(() => vi.fn())
const isInFlight = vi.hoisted(() => vi.fn(() => false))
const listAllActive = vi.hoisted(() => vi.fn())
const listByKb = vi.hoisted(() => vi.fn())
const countChunksByDocument = vi.hoisted(() => vi.fn())
const listResumableDocuments = vi.hoisted(() => vi.fn())
const findIngestJobByDocumentId = vi.hoisted(() => vi.fn())

vi.mock('../db/repos', () => ({
  getDocumentRepository: () => ({
    listByKb,
    countChunksByDocument,
    listResumableDocuments,
    findIngestJobByDocumentId,
  }),
  getKnowledgeBaseRepository: () => ({
    listAllActive,
  }),
}))

vi.mock('./structured-log.service', () => ({
  logStructured: vi.fn(),
}))

vi.mock('./knowledge-ingest-manager.service', () => ({
  isIngestInFlight: isInFlight,
  clearIngestCancel: vi.fn(),
}))

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return {
    ...actual,
    existsSync: vi.fn(() => true),
  }
})

vi.mock('./knowledge-ingest-shared', () => ({
  ACTIVE_INGEST_STAGES: new Set(['queued', 'parsing', 'ocr', 'chunking', 'embedding', 'indexing']),
  IN_FLIGHT_INGEST_STAGES: new Set(['parsing', 'ocr', 'chunking', 'embedding', 'indexing']),
  PARSE_INCOMPLETE_INGEST_STAGES: new Set(['queued', 'parsing', 'ocr']),
  recordIngestFailure: vi.fn(),
  refreshKbStats: vi.fn(),
  updateDocumentStage,
}))

vi.mock('./knowledge-ingest-file', () => ({
  registerStorageOnlyFileAtPath: vi.fn(),
}))

import {
  recoverInterruptedIngestJobsOnStartup,
  restoreIndexedDocumentsNotInFlight,
} from './knowledge-ingest-recovery'

describe('knowledge-ingest-recovery', () => {
  beforeEach(() => {
    updateDocumentStage.mockReset()
    isInFlight.mockReturnValue(false)
    listAllActive.mockReturnValue([{ id: 'kb-1', workspaceId: 'ws-1' }])
    listByKb.mockReturnValue([])
    countChunksByDocument.mockReturnValue(0)
    listResumableDocuments.mockReturnValue([])
    findIngestJobByDocumentId.mockReturnValue(null)
  })

  it('restoreIndexedDocumentsNotInFlight returns ready files that still have chunks', () => {
    listByKb.mockReturnValue([
      { id: 'doc-ready', status: 'parsing' },
      { id: 'doc-failed', status: 'failed' },
      { id: 'doc-new', status: 'parsing' },
    ])
    countChunksByDocument.mockImplementation((id: string) =>
      id === 'doc-new' ? 0 : 81,
    )

    expect(restoreIndexedDocumentsNotInFlight('kb-1')).toBe(1)
    expect(updateDocumentStage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        documentId: 'doc-ready',
        stage: 'ready',
        errorMessage: null,
      }),
    )
    expect(updateDocumentStage).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ documentId: 'doc-failed' }),
    )
    expect(updateDocumentStage).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ documentId: 'doc-new' }),
    )
  })

  it('does not restore a document that is actively ingesting', () => {
    listByKb.mockReturnValue([{ id: 'doc-busy', status: 'parsing' }])
    countChunksByDocument.mockReturnValue(12)
    isInFlight.mockReturnValue(true)

    expect(restoreIndexedDocumentsNotInFlight('kb-1')).toBe(0)
    expect(updateDocumentStage).not.toHaveBeenCalled()
  })

  it('does not restore documents that still have a pending OCR job', () => {
    listByKb.mockReturnValue([{ id: 'doc-ocr', status: 'ocr' }])
    countChunksByDocument.mockReturnValue(81)
    findIngestJobByDocumentId.mockReturnValue({ stage: 'ocr' })

    expect(restoreIndexedDocumentsNotInFlight('kb-1')).toBe(0)
    expect(updateDocumentStage).not.toHaveBeenCalled()
  })

  it('recoverInterruptedIngestJobsOnStartup requeues incomplete OCR instead of marking it ready', () => {
    listResumableDocuments.mockReturnValue([
      {
        job: { workspaceId: 'ws-1', kbId: 'kb-1', stage: 'ocr' },
        document: {
          id: 'doc-book',
          status: 'ocr',
          absolutePath: '/tmp/证券分析.pdf',
        },
      },
    ])
    countChunksByDocument.mockReturnValue(2142)

    expect(recoverInterruptedIngestJobsOnStartup()).toBe(1)
    expect(updateDocumentStage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        documentId: 'doc-book',
        stage: 'queued',
        errorMessage: null,
      }),
    )
    expect(updateDocumentStage).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ stage: 'ready' }),
    )
  })

  it('recoverInterruptedIngestJobsOnStartup restores files interrupted after parse', () => {
    listResumableDocuments.mockReturnValue([
      {
        job: { workspaceId: 'ws-1', kbId: 'kb-1', stage: 'embedding' },
        document: { id: 'doc-embedded', status: 'embedding' },
      },
    ])
    countChunksByDocument.mockReturnValue(81)

    expect(recoverInterruptedIngestJobsOnStartup()).toBe(1)
    expect(updateDocumentStage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        documentId: 'doc-embedded',
        stage: 'ready',
        errorMessage: null,
      }),
    )
  })

  it('requeues interrupted parses that have no index yet instead of failing them', () => {
    listResumableDocuments.mockReturnValue([
      {
        job: { workspaceId: 'ws-1', kbId: 'kb-1', stage: 'parsing' },
        document: {
          id: 'doc-scan',
          status: 'parsing',
          absolutePath: '/tmp/小说写作教程.pdf',
        },
      },
    ])
    countChunksByDocument.mockReturnValue(0)

    expect(recoverInterruptedIngestJobsOnStartup()).toBe(1)
    expect(updateDocumentStage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        documentId: 'doc-scan',
        stage: 'queued',
        errorMessage: null,
      }),
    )
    expect(updateDocumentStage).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ stage: 'failed' }),
    )
  })

  it('requeues documents already marked failed because the app quit mid-ingest', () => {
    listByKb.mockReturnValue([
      {
        id: 'doc-failed-exit',
        status: 'failed',
        absolutePath: '/tmp/小说写作教程.pdf',
        errorJson: JSON.stringify({
          message: '应用已退出，索引任务中断。请在设置 → 索引任务中点击重试，或点击文件旁的重新向量化。',
        }),
      },
    ])
    findIngestJobByDocumentId.mockReturnValue({
      errorJson: JSON.stringify({
        message: '应用已退出，索引任务中断。请在设置 → 索引任务中点击重试，或点击文件旁的重新向量化。',
      }),
    })

    expect(recoverInterruptedIngestJobsOnStartup()).toBe(1)
    expect(updateDocumentStage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        documentId: 'doc-failed-exit',
        stage: 'queued',
        errorMessage: null,
      }),
    )
  })
})
