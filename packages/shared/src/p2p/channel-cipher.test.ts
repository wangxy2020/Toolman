import { describe, expect, it } from 'vitest'
import {
  bytesEqual,
  decryptP2pChannelPayload,
  encryptP2pChannelPayload,
  P2P_EVENTS_CHANNEL,
  P2P_HANDSHAKE_PING,
} from './channel-cipher.js'

describe('p2p channel cipher', () => {
  it('round-trips handshake ping on the events channel', async () => {
    const workspaceKey = new Uint8Array(32).fill(7)
    const envelope = await encryptP2pChannelPayload({
      workspaceKey,
      workspaceId: 'ws-1',
      channel: P2P_EVENTS_CHANNEL,
      plaintext: P2P_HANDSHAKE_PING,
    })
    const plain = await decryptP2pChannelPayload({
      workspaceKey,
      workspaceId: 'ws-1',
      channel: P2P_EVENTS_CHANNEL,
      envelope,
    })
    expect(bytesEqual(plain, P2P_HANDSHAKE_PING)).toBe(true)
  })
})
