import { describe, expect, it, vi } from 'vitest'
import { listP2pSharedKnowledgeLocalKbIds } from '@toolman/shared'
import type { DocumentRepository } from '@toolman/db'

import {
  findSharedKnowledgeDocument,
  resolveSharedKnowledgeIngestKbId,
} from './p2p-knowledge-document-lookup'

describe('p2p-knowledge-document-lookup', () => {
  it('returns source kb id for owner viewers', () => {
    expect(
      resolveSharedKnowledgeIngestKbId({
        p2pWorkspaceId: 'ws-1',
        sourceKbId: 'kb-source',
        isOwnerViewer: true,
      }),
    ).toBe('kb-source')
  })

  it('finds documents across shared local kb ids', () => {
    const kbIds = listP2pSharedKnowledgeLocalKbIds({
      p2pWorkspaceId: 'ws-1',
      sourceKbId: 'kb-source',
    })
    const mirrorKbId = kbIds[kbIds.length - 1]!
    const doc = { id: 'doc-1', kbId: mirrorKbId } as never
    const docRepo = {
      findById: vi.fn((documentId: string, kbId: string) =>
        documentId === 'doc-1' && kbId === mirrorKbId ? doc : null,
      ),
    } as unknown as DocumentRepository

    const result = findSharedKnowledgeDocument(docRepo, {
      p2pWorkspaceId: 'ws-1',
      sourceKbId: 'kb-source',
      documentId: 'doc-1',
    })

    expect(result.doc).toBe(doc)
    expect(result.kbId).toBe(mirrorKbId)
  })
})
