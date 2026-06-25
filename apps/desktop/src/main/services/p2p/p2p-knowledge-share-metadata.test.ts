import { describe, expect, it, vi } from 'vitest'

vi.mock('./p2p-event.service', () => ({
  listWorkspaceEventsSince: vi.fn(() => []),
}))

import {
  buildKnowledgeShareMetadata,
  findLatestKnowledgeDocumentContentEvent,
  mergeSharedDocumentIds,
  parseKnowledgeDocumentPermissionsFromPayload,
  readKnowledgeShareMetadata,
} from './p2p-knowledge-share-metadata'

describe('p2p-knowledge-share-metadata', () => {
  it('reads and builds share metadata', () => {
    const json = buildKnowledgeShareMetadata({
      description: 'Team docs',
      sourceWorkspaceId: 'ws-src',
      documentIds: ['doc-1', 'doc-2'],
      documentPermissions: { 'doc-1': 'read', 'doc-2': 'savable' },
    })
    const parsed = readKnowledgeShareMetadata(json)
    expect(parsed.description).toBe('Team docs')
    expect(parsed.documentIds).toEqual(['doc-1', 'doc-2'])
    expect(parsed.documentPermissions).toEqual({ 'doc-1': 'read', 'doc-2': 'savable' })
  })

  it('returns empty metadata for invalid json', () => {
    expect(readKnowledgeShareMetadata('{bad')).toEqual({})
  })

  it('merges shared document ids', () => {
    expect(mergeSharedDocumentIds(['a'], ['b', 'a'])).toEqual(['a', 'b'])
    expect(mergeSharedDocumentIds(['a'], undefined)).toEqual(['a'])
  })

  it('parses document permissions from event payload', () => {
    expect(
      parseKnowledgeDocumentPermissionsFromPayload({
        document_permissions: { 'doc-1': 'read', 'doc-2': 'invalid' },
      }),
    ).toEqual({ 'doc-1': 'read' })
  })

  it('finds no content event when store is empty', () => {
    expect(findLatestKnowledgeDocumentContentEvent('ws-1', 'kb-1', 'doc-1')).toBeNull()
  })
})
