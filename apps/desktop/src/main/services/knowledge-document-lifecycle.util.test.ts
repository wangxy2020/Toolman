import { describe, expect, it, vi } from 'vitest'
import { shouldSkipReadyDocument } from './knowledge-document-lifecycle.util'
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
})
