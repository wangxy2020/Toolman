import { describe, expect, it, vi } from 'vitest'

vi.mock('./p2p-bridge', () => ({
  P2pBridge: {
    connectionSend: vi.fn(async () => undefined),
  },
}))

import { P2pBridge } from './p2p-bridge'
import {
  P2P_EVENTS_SAFE_PAYLOAD_BYTES,
  P2pEventsPayloadTooLargeError,
  describeReplicationMessage,
  measureAgentRelayEnvelopeBytes,
  measureReplicationMessageBytes,
  sendEventsBatchChunked,
  sendReplicationMessageOnEventsChannel,
  splitWireEventsByPayloadBudget,
} from './p2p-events-channel'
import type { RemoteWorkspaceEventWire } from './p2p-sync-protocol'

function makeWireEvent(seq: number, payloadSize: number): RemoteWorkspaceEventWire {
  return {
    eventId: `event-${seq}`,
    workspaceId: 'ws-1',
    seq,
    resourceType: 'Knowledge',
    resourceId: 'kb-1',
    operatorId: 'op-1',
    eventType: 'Updated',
    payloadJson: JSON.stringify({ blob: 'x'.repeat(payloadSize) }),
    payloadHash: '',
    prevEventHash: null,
    timestamp: Date.now(),
    sourceDeviceId: 'device-1',
  }
}

describe('p2p-events-channel', () => {
  it('describes replication message types', () => {
    expect(
      describeReplicationMessage({
        type: 'events.batch',
        workspaceId: 'ws-1',
        events: [makeWireEvent(1, 8), makeWireEvent(2, 8)],
      }),
    ).toBe('events.batch count=2')

    expect(
      describeReplicationMessage({
        type: 'agent-relay.message',
        relay: { type: 'stream', event: { type: 'message.delta' } },
      }),
    ).toBe('agent-relay.stream event=message.delta')
  })

  it('splits oversized events.batch payloads', () => {
    const events = [
      makeWireEvent(1, 16 * 1024),
      makeWireEvent(2, 16 * 1024),
      makeWireEvent(3, 16 * 1024),
      makeWireEvent(4, 16 * 1024),
    ]

    const chunks = splitWireEventsByPayloadBudget('ws-1', events, P2P_EVENTS_SAFE_PAYLOAD_BYTES)
    expect(chunks.length).toBeGreaterThan(1)

    for (const chunk of chunks) {
      const bytes = measureReplicationMessageBytes({
        type: 'events.batch',
        workspaceId: 'ws-1',
        events: chunk,
      })
      expect(bytes).toBeLessThanOrEqual(P2P_EVENTS_SAFE_PAYLOAD_BYTES)
    }

    expect(chunks.flat()).toHaveLength(events.length)
  })

  it('measures agent relay envelopes', () => {
    const bytes = measureAgentRelayEnvelopeBytes({
      type: 'stream',
      event: { type: 'message.delta' },
    } as never)
    expect(bytes).toBeGreaterThan(0)
  })

  it('rejects oversize replication messages', async () => {
    const hugeEvent = makeWireEvent(1, P2P_EVENTS_SAFE_PAYLOAD_BYTES)
    await expect(
      sendReplicationMessageOnEventsChannel('peer-1', {
        type: 'events.batch',
        workspaceId: 'ws-1',
        events: [hugeEvent],
      }),
    ).rejects.toBeInstanceOf(P2pEventsPayloadTooLargeError)
  })

  it('sends chunked event batches', async () => {
    vi.mocked(P2pBridge.connectionSend).mockClear()
    const sent = await sendEventsBatchChunked('peer-1', 'ws-1', [
      makeWireEvent(1, 1024),
      makeWireEvent(2, 1024),
    ])
    expect(sent).toBe(2)
    expect(P2pBridge.connectionSend).toHaveBeenCalled()
  })
})
