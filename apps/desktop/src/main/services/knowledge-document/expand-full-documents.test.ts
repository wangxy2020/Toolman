import { beforeEach, describe, expect, it, vi } from 'vitest'

const listChunkTextsByDocument = vi.fn()

vi.mock('../../db/repos', () => ({
  getDocumentRepository: () => ({
    listChunkTextsByDocument,
  }),
}))

import { expandKnowledgeHitsWithFullDocuments } from './expand-full-documents'
import type { KnowledgeSearchResult } from '@toolman/shared'

function hit(partial: Partial<KnowledgeSearchResult> & Pick<KnowledgeSearchResult, 'documentId' | 'text'>): KnowledgeSearchResult {
  return {
    chunkId: partial.chunkId ?? `c-${partial.documentId}`,
    documentId: partial.documentId,
    documentTitle: partial.documentTitle ?? 'Doc',
    kbId: partial.kbId ?? '11111111-1111-1111-1111-111111111111',
    kbName: partial.kbName ?? 'KB',
    score: partial.score ?? 0.9,
    text: partial.text,
    sourcePath: partial.sourcePath ?? '/tmp/doc.pdf',
  }
}

describe('expandKnowledgeHitsWithFullDocuments', () => {
  beforeEach(() => {
    listChunkTextsByDocument.mockReset()
  })

  it('expands top documents to full chunk text', () => {
    listChunkTextsByDocument.mockReturnValue(['chunk A', 'chunk B', 'chunk C'])
    const docId = '22222222-2222-2222-2222-222222222222'
    const results = expandKnowledgeHitsWithFullDocuments(
      [
        hit({ documentId: docId, text: 'chunk A', score: 0.95 }),
        hit({ documentId: docId, chunkId: 'c2', text: 'chunk B', score: 0.8 }),
      ],
      '总结这份文档',
    )
    expect(results[0]?.chunkId).toBe(`full:${docId}`)
    expect(results[0]?.text).toContain('【全文 3 块】')
    expect(results[0]?.text).toContain('chunk C')
  })

  it('skips expansion for page-specific queries', () => {
    listChunkTextsByDocument.mockReturnValue(['full text'])
    const docId = '22222222-2222-2222-2222-222222222222'
    const input = [hit({ documentId: docId, text: 'page 6 only', score: 0.99 })]
    const results = expandKnowledgeHitsWithFullDocuments(input, '小说写作教程.pdf 第6页')
    expect(results).toEqual(input)
    expect(listChunkTextsByDocument).not.toHaveBeenCalled()
  })
})
