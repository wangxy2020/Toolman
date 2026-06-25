import { describe, expect, it, vi } from 'vitest'
import type { P2pSharedResourceRow } from '@toolman/db'

vi.mock('./agent-share.service', () => ({
  mapP2pAgentSharedResourceRow: (row: P2pSharedResourceRow) => ({
    ...row,
    resourceType: 'Agent',
  }),
}))

import { mapSharedResourceRow } from './knowledge-sync-shared-resource'

describe('mapSharedResourceRow', () => {
  const baseRow = {
    id: 'res-1',
    workspaceId: 'ws-1',
    localResourceId: 'kb-1',
    name: 'Docs',
    sharedBy: 'member-1',
    permission: 'read',
    contentHash: null,
    version: 1,
    status: 'active',
    metadataJson: JSON.stringify({
      documentIds: ['doc-1'],
      documentPermissions: { 'doc-1': 'read' },
      sourceWorkspaceId: 'ws-src',
    }),
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-02T00:00:00.000Z'),
  } as P2pSharedResourceRow

  it('maps knowledge resources with shared document metadata', () => {
    const mapped = mapSharedResourceRow({ ...baseRow, resourceType: 'Knowledge' })
    expect(mapped.resourceType).toBe('Knowledge')
    if (mapped.resourceType !== 'Knowledge') return
    expect(mapped.sharedDocumentIds).toEqual(['doc-1'])
    expect(mapped.sourceWorkspaceId).toBe('ws-src')
  })

  it('delegates agent resources to agent mapper', () => {
    const mapped = mapSharedResourceRow({ ...baseRow, resourceType: 'Agent' })
    expect(mapped.resourceType).toBe('Agent')
  })
})
