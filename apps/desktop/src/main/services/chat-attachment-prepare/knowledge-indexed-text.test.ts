import { describe, expect, it, vi, beforeEach } from 'vitest'

const findRegistryByPath = vi.fn()
const findDocumentById = vi.fn()
const listChunkTextsByDocument = vi.fn()

vi.mock('../../db/repos', () => ({
  getDocumentRepository: () => ({
    findRegistryByPath,
    findDocumentById,
    listChunkTextsByDocument,
  }),
}))

import { tryKnowledgeIndexedText } from './knowledge-indexed-text'

describe('tryKnowledgeIndexedText', () => {
  beforeEach(() => {
    findRegistryByPath.mockReset()
    findDocumentById.mockReset()
    listChunkTextsByDocument.mockReset()
  })

  it('returns chunk text for a registered ready document', () => {
    findRegistryByPath.mockReturnValue({ documentId: 'doc-1' })
    findDocumentById.mockReturnValue({
      id: 'doc-1',
      kbId: 'kb-1',
      status: 'ready',
      deletedAt: null,
    })
    listChunkTextsByDocument.mockReturnValue(['page one', 'page two'])

    expect(tryKnowledgeIndexedText('/kb/scan.pdf', 'ws-1')).toBe('page one\n\npage two')
    expect(findRegistryByPath).toHaveBeenCalledWith('ws-1', '/kb/scan.pdf')
  })

  it('skips blob-cache paths that cannot match the registry', () => {
    expect(tryKnowledgeIndexedText('/app/data/blobs/ab/cdef', 'ws-1')).toBeNull()
    expect(findRegistryByPath).not.toHaveBeenCalled()
  })

  it('returns null when document is not ready', () => {
    findRegistryByPath.mockReturnValue({ documentId: 'doc-1' })
    findDocumentById.mockReturnValue({
      id: 'doc-1',
      kbId: 'kb-1',
      status: 'indexing',
      deletedAt: null,
    })
    expect(tryKnowledgeIndexedText('/kb/scan.pdf', 'ws-1')).toBeNull()
  })
})
