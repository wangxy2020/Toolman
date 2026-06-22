import type { P2pConnectionInfo, P2pConnectionMode, P2pConnectionState } from '@toolman/shared'
import { P2pBridge, type NativeConnectionInfo } from './p2p-bridge'
import {
  broadcastP2pConnectionError,
  broadcastP2pConnectionStateChange,
} from './p2p-connection-broadcast'
import { handlePeerConnectionChange } from './p2p-peer.service'
import { notifyP2pReconnect, applyP2pConnectionSnapshot, processP2pIncomingMessagesFromPoll } from './p2p-sync-lifecycle'
import { loadWorkspaceKey } from './p2p-workspace-key.store'
import { rotateWorkspaceKey, setWorkspaceKey } from './p2p-crypto.service'

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
const connectInFlight = new Map<string, Promise<P2pConnectionState>>()

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
          notifyP2pReconnect(connection.workspaceId!, peerDeviceId)
          void import('./p2p-member.service').then((module) => {
            module.flushPendingJoinNotification(peerDeviceId, connection.workspaceId ?? undefined)
            if (connection.workspaceId) {
              void module.reconcileOwnerWorkspaceMembers(connection.workspaceId)
            }
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
    applyP2pConnectionSnapshot(connections)
    syncConnectionEvents(connections)
    await processP2pIncomingMessagesFromPoll()
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

export function isPeerConnected(peerDeviceId: string): boolean {
  return knownConnections.get(peerDeviceId)?.state === 'connected'
}

export async function ensurePeerReadyForWorkspace(
  peerDeviceId: string,
  workspaceId: string,
): Promise<void> {
  const workspaceKey = loadWorkspaceKey(workspaceId)
  if (!workspaceKey) {
    throw new Error('群组密钥不存在')
  }

  setWorkspaceKey(workspaceId, workspaceKey, 1)

  if (isPeerConnected(peerDeviceId)) {
    await rotateWorkspaceKey(workspaceId, workspaceKey, 1)
    return
  }

  await connectP2pPeerOnce(peerDeviceId, workspaceId)
}

async function connectP2pPeerOnce(
  peerDeviceId: string,
  workspaceId?: string,
): Promise<P2pConnectionState> {
  startPolling()
  if (isPeerConnected(peerDeviceId)) {
    if (workspaceId) {
      const workspaceKey = loadWorkspaceKey(workspaceId)
      if (workspaceKey) {
        setWorkspaceKey(workspaceId, workspaceKey, 1)
        await rotateWorkspaceKey(workspaceId, workspaceKey, 1)
      }
    }
    return 'connected'
  }

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

export async function connectP2pPeer(
  peerDeviceId: string,
  workspaceId?: string,
): Promise<P2pConnectionState> {
  const inFlight = connectInFlight.get(peerDeviceId)
  if (inFlight) {
    return inFlight
  }

  const promise = connectP2pPeerOnce(peerDeviceId, workspaceId)
  connectInFlight.set(peerDeviceId, promise)
  try {
    return await promise
  } finally {
    if (connectInFlight.get(peerDeviceId) === promise) {
      connectInFlight.delete(peerDeviceId)
    }
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
