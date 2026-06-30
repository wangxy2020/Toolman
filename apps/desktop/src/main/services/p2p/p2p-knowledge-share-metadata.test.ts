import { describe, expect, it, vi } from 'vitest'

import {
  buildKnowledgeShareMetadata,
  findLatestKnowledgeDocumentContentEvent,
  mergeSharedDocumentIds,
  parseKnowledgeDocumentPermissionsFromPayload,
  readKnowledgeShareMetadata,
} from './p2p-knowledge-share-metadata'

vi.mock('./p2p-event.service', () => ({
  listWorkspaceEventsSince: vi.fn(() => [
    {
      seq: 1,
      resourceType: 'Knowledge',
      eventType: 'Updated',
      payload: { kb_id: 'kb-1', doc_id: 'doc-1', content_hash: 'hash-1' },
    },
    {
      seq: 2,
      resourceType: 'Knowledge',
      eventType: 'Updated',
      payload: { kb_id: 'kb-1', doc_id: 'doc-2', content_hash: 'hash-2' },
    },
  ]),
}))

describe('p2p-knowledge-share-metadata', () => {
  it('round-trips knowledge share metadata', () => {
    const metadata = buildKnowledgeShareMetadata({
      description: 'demo kb',
      sourceWorkspaceId: 'ws-1',
      sourceKbKind: 'local',
      documentIds: ['doc-1'],
      documentPermissions: { 'doc-1': 'read' },
    })

    expect(readKnowledgeShareMetadata(metadata)).toEqual({
      description: 'demo kb',
      sourceWorkspaceId: 'ws-1',
      sourceKbKind: 'local',
      documentIds: ['doc-1'],
      documentPermissions: { 'doc-1': 'read' },
    })
  })

  it('filters invalid knowledge metadata values', () => {
    expect(
      readKnowledgeShareMetadata(
        JSON.stringify({
          sourceKbKind: 'invalid',
          documentIds: ['ok', '', 1],
          documentPermissions: { good: 'read', bad: 'write' },
        }),
      ),
    ).toEqual({
      description: null,
      documentIds: ['ok'],
      documentPermissions: { good: 'read' },
    })
  })

  it('mergeSharedDocumentIds deduplicates incoming ids', () => {
    expect(mergeSharedDocumentIds(['a'], ['b', 'a'])).toEqual(['a', 'b'])
    expect(mergeSharedDocumentIds(['a'], undefined)).toEqual(['a'])
    expect(mergeSharedDocumentIds(undefined, [])).toBeUndefined()
  })

  it('parseKnowledgeDocumentPermissionsFromPayload keeps valid permissions only', () => {
    expect(
      parseKnowledgeDocumentPermissionsFromPayload({
        document_permissions: { 'doc-1': 'savable', 'doc-2': 'admin' },
      }),
    ).toEqual({ 'doc-1': 'savable' })
    expect(parseKnowledgeDocumentPermissionsFromPayload({})).toBeUndefined()
    expect(parseKnowledgeDocumentPermissionsFromPayload({ document_permissions: [] })).toBeUndefined()
  })

  it('findLatestKnowledgeDocumentContentEvent returns the newest matching event', () => {
    const latest = findLatestKnowledgeDocumentContentEvent('ws-1', 'kb-1', 'doc-1')
    expect(latest?.payload).toEqual({
      kb_id: 'kb-1',
      doc_id: 'doc-1',
      content_hash: 'hash-1',
    })
  })
})
