import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { P2pConnectionInfo, WorkspaceEvent } from '@toolman/shared'

import {
  applyP2pConnectionSnapshot,
  dispatchP2pAgentRelayMessage,
  notifyLocalP2pEventAppended,
  notifyP2pPeerConnected,
  notifyP2pReconnect,
  processP2pIncomingMessagesFromPoll,
  registerP2pSyncHandlers,
  resetP2pSyncHandlersForTests,
} from './p2p-sync-lifecycle'

describe('p2p-sync-lifecycle', () => {
  beforeEach(() => {
    resetP2pSyncHandlersForTests()
  })

  it('dispatches registered handlers', async () => {
    const localEvent = vi.fn()
    const reconnect = vi.fn()
    const peerConnected = vi.fn()
    const autoSnapshot = vi.fn()
    const snapshot = vi.fn()
    const incoming = vi.fn(async () => undefined)
    const relay = vi.fn(async () => undefined)

    registerP2pSyncHandlers({
      onLocalEventAppended: localEvent,
      onReconnect: reconnect,
      onPeerConnected: peerConnected,
      onAutoSnapshot: autoSnapshot,
      updateConnectionSnapshot: snapshot,
      processIncomingMessages: incoming,
      handleAgentRelayMessage: relay,
    })

    const event = {
      eventId: 'evt-1',
      workspaceId: 'ws-1',
      seq: 1,
      resourceType: 'Knowledge' as const,
      resourceId: 'kb-1',
      operatorId: 'op-1',
      eventType: 'Shared' as const,
      payload: {},
      timestamp: Date.now(),
      sourceDeviceId: 'dev-a',
    } satisfies WorkspaceEvent

    notifyLocalP2pEventAppended(event)
    await Promise.resolve()
    expect(localEvent).toHaveBeenCalledWith(event)
    expect(autoSnapshot).toHaveBeenCalledWith('ws-1')

    notifyP2pReconnect('ws-1', 'dev-b')
    expect(reconnect).toHaveBeenCalledWith('ws-1', 'dev-b')

    notifyP2pPeerConnected('ws-1', 'dev-c')
    expect(peerConnected).toHaveBeenCalledWith('ws-1', 'dev-c')

    const connections = [{ peerDeviceId: 'dev-a', state: 'connected' }] as P2pConnectionInfo[]
    applyP2pConnectionSnapshot(connections)
    expect(snapshot).toHaveBeenCalledWith(connections)

    await processP2pIncomingMessagesFromPoll()
    expect(incoming).toHaveBeenCalled()

    await dispatchP2pAgentRelayMessage('dev-a', new Uint8Array([1, 2, 3]))
    expect(relay).toHaveBeenCalled()
  })
})
