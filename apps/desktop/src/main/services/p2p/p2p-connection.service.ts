import type { P2pConnectionInfo, P2pConnectionMode, P2pConnectionState } from '@toolman/shared'
import { P2pBridge, type NativeConnectionInfo } from './p2p-bridge'
import {
  broadcastP2pConnectionError,
  broadcastP2pConnectionStateChange,
} from './p2p-connection-broadcast'
import { handlePeerConnectionChange } from './p2p-peer.service'

const POLL_INTERVAL_MS = 2_000
const KNOWN_STATES = new Set<P2pConnectionState>([
  'idle',
  'signaling',
  'connecting',
  'connected',
  'reconnecting',
  'closed',
])

let pollTimer: ReturnType<typeof setInterval> | null = null
const knownConnections = new Map<string, P2pConnectionInfo>()

const KNOWN_MODES = new Set<P2pConnectionMode>(['lan', 'wan'])
const peerConnectionModes = new Map<string, P2pConnectionMode>()

function mapNativeConnection(connection: NativeConnectionInfo): P2pConnectionInfo {
  const state = KNOWN_STATES.has(connection.state as P2pConnectionState)
    ? (connection.state as P2pConnectionState)
    : 'idle'
  const connectionMode = KNOWN_MODES.has(connection.connectionMode as P2pConnectionMode)
    ? (connection.connectionMode as P2pConnectionMode)
    : undefined

  if (connectionMode) {
    peerConnectionModes.set(connection.peerDeviceId, connectionMode)
  }

  return {
    peerDeviceId: connection.peerDeviceId,
    state,
    workspaceId: connection.workspaceId,
    connectedAt: connection.connectedAt,
    bytesSent: connection.bytesSent,
    bytesReceived: connection.bytesReceived,
    connectionMode,
  }
}

export function getPeerConnectionMode(peerDeviceId: string): P2pConnectionMode | undefined {
  return peerConnectionModes.get(peerDeviceId)
}

function syncConnectionEvents(connections: P2pConnectionInfo[]): void {
  const nextByPeer = new Map(connections.map((item) => [item.peerDeviceId, item]))

  for (const [peerDeviceId, connection] of nextByPeer) {
    const previous = knownConnections.get(peerDeviceId)
    if (!previous || previous.state !== connection.state) {
      broadcastP2pConnectionStateChange({
        peerDeviceId,
        state: connection.state,
        workspaceId: connection.workspaceId,
      })
      if (connection.workspaceId) {
        handlePeerConnectionChange(
          connection.workspaceId,
          peerDeviceId,
          connection.state,
        )
        if (connection.state === 'connected') {
          void import('./p2p-sync.service').then((module) => {
            void module.recoverWorkspaceSyncAfterReconnect(
              connection.workspaceId!,
              peerDeviceId,
            )
          })
        }
      }
    }
  }

  for (const [peerDeviceId, previous] of knownConnections) {
    if (!nextByPeer.has(peerDeviceId) && previous.state !== 'closed') {
      broadcastP2pConnectionStateChange({
        peerDeviceId,
        state: 'closed',
        workspaceId: previous.workspaceId,
      })
    }
  }

  knownConnections.clear()
  for (const [peerDeviceId, connection] of nextByPeer) {
    knownConnections.set(peerDeviceId, connection)
  }
}

async function pollConnections(): Promise<void> {
  try {
    const connections = (await P2pBridge.connectionList()).map(mapNativeConnection)
    const sync = await import('./p2p-sync.service')
    sync.updateP2pSyncConnectionSnapshot(connections)
    syncConnectionEvents(connections)
    await sync.processP2pIncomingMessages()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to poll P2P connections'
    console.error(`[p2p] connection poll failed: ${message}`)
  }
}

function startPolling(): void {
  if (pollTimer) return
  void pollConnections()
  pollTimer = setInterval(() => {
    void pollConnections()
  }, POLL_INTERVAL_MS)
}

function stopPolling(): void {
  if (!pollTimer) return
  clearInterval(pollTimer)
  pollTimer = null
  knownConnections.clear()
}

export function getKnownP2pConnections(): P2pConnectionInfo[] {
  return Array.from(knownConnections.values())
}

export async function connectP2pPeer(
  peerDeviceId: string,
  workspaceId?: string,
): Promise<P2pConnectionState> {
  startPolling()
  try {
    const result = await P2pBridge.connectionConnect(peerDeviceId, workspaceId)
    const state = KNOWN_STATES.has(result.state as P2pConnectionState)
      ? (result.state as P2pConnectionState)
      : 'connecting'
    broadcastP2pConnectionStateChange({
      peerDeviceId,
      state,
      workspaceId,
    })
    if (workspaceId) {
      handlePeerConnectionChange(workspaceId, peerDeviceId, state)
    }
    return state
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to connect peer'
    broadcastP2pConnectionError({
      peerDeviceId,
      code: 'P2P_CONNECTION_FAILED',
      message,
    })
    throw error
  }
}

export async function disconnectP2pPeer(peerDeviceId: string): Promise<void> {
  await P2pBridge.connectionDisconnect(peerDeviceId)
  broadcastP2pConnectionStateChange({
    peerDeviceId,
    state: 'closed',
  })
}

export async function listP2pConnections(): Promise<P2pConnectionInfo[]> {
  return (await P2pBridge.connectionList()).map(mapNativeConnection)
}

export function startP2pConnectionMonitor(): void {
  startPolling()
}

export function stopP2pConnectionMonitor(): void {
  stopPolling()
}
