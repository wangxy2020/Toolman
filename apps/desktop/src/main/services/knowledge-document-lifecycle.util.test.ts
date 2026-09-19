import { describe, expect, it, vi } from 'vitest'
import { shouldRestoreIndexedDocumentStatus, shouldSkipReadyDocument } from './knowledge-document-lifecycle.util'
import type { DocumentRepository } from '@toolman/db'

describe('shouldSkipReadyDocument', () => {
  it('does not skip when chunks were removed after delete', () => {
    const repo = {
      countChunksByDocument: vi.fn(() => 0),
    } as unknown as DocumentRepository

    expect(
      shouldSkipReadyDocument(repo, 'kb-1', 'doc-1', 'hash-a', {
        contentHash: 'hash-a',
        status: 'ready',
      }),
    ).toBe(false)
  })

  it('skips when content is unchanged and chunks still exist', () => {
    const repo = {
      countChunksByDocument: vi.fn(() => 3),
    } as unknown as DocumentRepository

    expect(
      shouldSkipReadyDocument(repo, 'kb-1', 'doc-1', 'hash-a', {
        contentHash: 'hash-a',
        status: 'ready',
      }),
    ).toBe(true)
  })

  it('does not skip when chunk or embedding config changed', () => {
    const repo = {
      countChunksByDocument: vi.fn(() => 3),
    } as unknown as DocumentRepository

    expect(
      shouldSkipReadyDocument(
        repo,
        'kb-1',
        'doc-1',
        'hash-a',
        {
          contentHash: 'hash-a',
          status: 'ready',
          indexFingerprint: 'markdown|512|64|bge-m3:latest|1024|file|',
        },
        'markdown|1200|64|bge-m3:latest|1024|file|',
      ),
    ).toBe(false)
  })

  it('does not skip a queued rebuild even when file bytes are unchanged', () => {
    const repo = {
      countChunksByDocument: vi.fn(() => 3),
    } as unknown as DocumentRepository

    expect(
      shouldSkipReadyDocument(repo, 'kb-1', 'doc-1', 'hash-a', {
        contentHash: 'hash-a',
        status: 'queued',
      }),
    ).toBe(false)
  })
})

describe('shouldRestoreIndexedDocumentStatus', () => {
  it('restores parsing documents that already have chunks when ingest is idle', () => {
    expect(
      shouldRestoreIndexedDocumentStatus({
        status: 'parsing',
        chunkCount: 12,
        ingestInFlight: false,
      }),
    ).toBe(true)
  })

  it('does not restore a document that is currently being ingested', () => {
    expect(
      shouldRestoreIndexedDocumentStatus({
        status: 'parsing',
        chunkCount: 12,
        ingestInFlight: true,
      }),
    ).toBe(false)
  })

  it('does not restore documents that were never indexed', () => {
    expect(
      shouldRestoreIndexedDocumentStatus({
        status: 'queued',
        chunkCount: 0,
        ingestInFlight: false,
      }),
    ).toBe(false)
  })

  it('does not restore failed documents — incomplete OCR must stay failed', () => {
    expect(
      shouldRestoreIndexedDocumentStatus({
        status: 'failed',
        chunkCount: 2142,
        ingestInFlight: false,
      }),
    ).toBe(false)
  })
})
