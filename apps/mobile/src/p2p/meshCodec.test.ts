import { describe, expect, it } from 'vitest'
import { encodeFileChannelMessageJson, parseFileChannelMessageJson } from '@toolman/shared'
import { encodeReplicationMessage, parseReplicationMessage } from './meshCodec'

describe('meshCodec', () => {
  it('round-trips sync.hello', () => {
    const encoded = encodeReplicationMessage({
      type: 'sync.hello',
      workspaceId: 'ws-a',
      deviceId: 'phone-b',
      lastReceivedSeq: 3,
      latestSeq: 3,
    })
    expect(parseReplicationMessage(encoded)).toMatchObject({
      type: 'sync.hello',
      lastReceivedSeq: 3,
    })
  })

  it('round-trips events.propose', () => {
    const encoded = encodeReplicationMessage({
      type: 'events.propose',
      workspaceId: 'ws-a',
      proposalId: 'p1',
      resourceType: 'Note',
      resourceId: 'note-1',
      operatorId: 'm1',
      eventType: 'Shared',
      payloadJson: '{"note_id":"note-1"}',
      sourceDeviceId: 'phone-b',
      timestamp: 1,
    })
    expect(parseReplicationMessage(encoded)).toMatchObject({
      type: 'events.propose',
      resourceType: 'Note',
      proposalId: 'p1',
    })
  })

  it('round-trips a blob.request', () => {
    const json = encodeFileChannelMessageJson({
      type: 'blob.request',
      workspaceId: 'ws-a',
      contentHash: 'abc',
      requestId: 'req-1',
    })
    expect(parseFileChannelMessageJson(json)).toMatchObject({ type: 'blob.request', contentHash: 'abc' })
  })
})
