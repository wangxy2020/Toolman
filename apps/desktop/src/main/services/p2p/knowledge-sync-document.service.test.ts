import { describe, expect, it, vi, beforeEach } from 'vitest'
import { appendP2pEvent } from './p2p-event.service'
import {
  resetKnowledgeDocumentSyncInFlightForTests,
  syncP2pKnowledgeDocument,
} from './knowledge-sync-document.service'

vi.mock('./p2p-event.service', () => ({
  appendP2pEvent: vi.fn(async () => ({ id: 'evt-1' })),
}))

vi.mock('./p2p-permission.guard', () => ({
  assertWorkspaceMemberAccess: () => ({ id: 'member-1' }),
  assertCanEditSharedResource: vi.fn(),
  getActiveWorkspaceMember: vi.fn(),
}))

vi.mock('../../db/repos', () => ({
  getDocumentRepository: () => ({
    findById: () => ({
      status: 'ready',
      title: 'Doc',
      absolutePath: '/tmp/doc.md',
    }),
    update: vi.fn(),
  }),
  getKnowledgeBaseRepository: () => ({}),
}))

vi.mock('./knowledge-sync-shared-resource', () => ({
  getSharedResourceRepo: () => ({
    findByWorkspaceAndLocalResource: () => ({
      id: 'shared-1',
      status: 'active',
      permission: 'edit',
      sharedBy: 'member-1',
    }),
    update: vi.fn(),
  }),
}))

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs')
  return {
    ...actual,
    existsSync: () => true,
    statSync: () => ({ size: 12 }),
    copyFileSync: vi.fn(),
  }
})

vi.mock('../blob.service', () => ({
  writeBlobFromPath: () => ({ hash: 'hash-1', mimeType: 'text/plain' }),
}))

vi.mock('./p2p-blob-transfer.service', () => ({
  pushBlobToPeers: vi.fn(async () => undefined),
}))

describe('knowledge-sync-document.service', () => {
  beforeEach(() => {
    resetKnowledgeDocumentSyncInFlightForTests()
    vi.mocked(appendP2pEvent).mockClear()
  })

  it('deduplicates concurrent sync for the same document', async () => {
    const input = {
      workspaceId: '00000000-0000-0000-0000-000000000101',
      knowledgeBaseId: '00000000-0000-0000-0000-000000000102',
      documentId: '00000000-0000-0000-0000-000000000103',
    }

    await Promise.all([syncP2pKnowledgeDocument(input), syncP2pKnowledgeDocument(input)])

    expect(appendP2pEvent).toHaveBeenCalledTimes(1)
  })
})
