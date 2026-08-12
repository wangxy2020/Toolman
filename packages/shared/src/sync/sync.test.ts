import { describe, expect, it } from 'vitest'
import {
  AgentHostPresenceSchema,
  SyncChangeSchema,
  SyncPullOutputSchema,
} from './index.js'

describe('sync contracts', () => {
  it('parses sync changes', () => {
    const change = SyncChangeSchema.parse({
      entityKind: 'note',
      entityId: 'n1',
      op: 'upsert',
      updatedAt: 1,
      payload: { title: 't' },
    })
    expect(change.entityKind).toBe('note')
  })

  it('parses host presence', () => {
    const presence = AgentHostPresenceSchema.parse({
      deviceId: 'd1',
      identityId: 'i1',
      deviceKind: 'desktop',
      agentHost: true,
      capabilities: ['agent', 'classroom'],
      lastSeenAt: 1,
    })
    expect(presence.agentHost).toBe(true)
  })

  it('parses pull output', () => {
    const out = SyncPullOutputSchema.parse({
      changes: [],
      nextCursor: null,
      serverTime: 1,
    })
    expect(out.changes).toEqual([])
  })
})
