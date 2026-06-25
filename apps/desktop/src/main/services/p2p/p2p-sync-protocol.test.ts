import { describe, expect, it } from 'vitest'
import type { WorkspaceEvent } from '@toolman/shared'

import {
  encodeReplicationMessage,
  parseReplicationMessage,
  P2P_REPLICATION_VERSION,
  wireToRemoteInput,
  workspaceEventToWire,
} from './p2p-sync-protocol'

describe('p2p-sync-protocol', () => {
  const sampleEvent: WorkspaceEvent = {
    eventId: 'evt-1',
    workspaceId: 'ws-1',
    seq: 3,
    resourceType: 'Knowledge',
    resourceId: 'kb-1',
    operatorId: 'op-1',
    eventType: 'Shared',
    payload: { kb_id: 'kb-1' },
    timestamp: 1_700_000_000_000,
    sourceDeviceId: 'dev-a',
  }

  it('round-trips sync.hello messages', () => {
    const message = {
      type: 'sync.hello' as const,
      workspaceId: 'ws-1',
      deviceId: 'dev-a',
      lastReceivedSeq: 1,
      latestSeq: 3,
    }
    const parsed = parseReplicationMessage(encodeReplicationMessage(message))
    expect(parsed).toMatchObject(message)
  })

  it('round-trips events.batch payloads', () => {
    const wire = workspaceEventToWire(sampleEvent)
    const message = {
      type: 'events.batch' as const,
      workspaceId: 'ws-1',
      events: [wire],
    }
    const parsed = parseReplicationMessage(encodeReplicationMessage(message))
    expect(parsed?.type).toBe('events.batch')
    if (parsed?.type !== 'events.batch') return
    expect(parsed.events[0]?.eventId).toBe('evt-1')
  })

  it('converts wire events back to remote input', () => {
    const wire = workspaceEventToWire(sampleEvent)
    const input = wireToRemoteInput(wire)
    expect(input.payload).toEqual({ kb_id: 'kb-1' })
    expect(input.seq).toBe(3)
  })

  it('returns null for invalid payloads', () => {
    expect(parseReplicationMessage(Buffer.from('not-json'))).toBeNull()
    expect(parseReplicationMessage(Buffer.from('{}'))).toBeNull()
  })

  it('embeds protocol version in encoded payloads', () => {
    const raw = JSON.parse(
      encodeReplicationMessage({
        type: 'snapshot.request',
        workspaceId: 'ws-1',
      }).toString('utf8'),
    ) as { v: number }
    expect(raw.v).toBe(P2P_REPLICATION_VERSION)
  })
})
