import { describe, expect, it } from 'vitest'
import { applyAgentShareListings } from './agentShareListing'
import { subscribeMeshEvents } from './meshEvents'

describe('applyAgentShareListings', () => {
  it('upserts the agent and each authorized topic', () => {
    const seen: Array<{ id: string; parentId?: string; permission?: string }> = []
    const stop = subscribeMeshEvents((event) => {
      if (event.type === 'shared') {
        seen.push({
          id: event.item.id,
          parentId: event.item.parentId,
          permission: event.item.sessionPermission,
        })
      }
    })
    applyAgentShareListings('ws-1', [
      {
        id: 'ag-1',
        name: '助手',
        sessionIds: ['sess-1'],
        sessionTitles: { 'sess-1': '问候' },
        sessionPermissions: { 'sess-1': 'callable' },
      },
    ])
    stop()
    expect(seen).toEqual([
      { id: 'ag-1' },
      { id: 'sess-1', parentId: 'ag-1', permission: 'callable' },
    ])
  })
})
