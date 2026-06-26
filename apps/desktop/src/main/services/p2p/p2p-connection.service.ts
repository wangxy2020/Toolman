import type { P2pConnectionInfo, P2pConnectionMode, P2pConnectionState } from '@toolman/shared'
import { logStructured } from '../structured-log.service'
import { toErrorMessage } from '@toolman/shared'
import { P2pBridge, type NativeConnectionInfo } from './p2p-bridge'
import {
  broadcastP2pConnectionError,
  broadcastP2pConnectionStateChange,
} from './p2p-connection-broadcast'
import { isP2pPeerDiscoverableOnline } from './p2p-discovery.service'
import { handlePeerConnectionChange } from './p2p-peer.service'
import { notifyP2pReconnect, applyP2pConnectionSnapshot, processP2pIncomingMessagesFromPoll } from './p2p-sync-lifecycle'
import { loadWorkspaceKey } from './p2p-workspace-key.store'
import { rotateWorkspaceKey, setWorkspaceKey } from './p2p-crypto.service'

const POLL_INTERVAL_MS = 2_000
const CONNECT_RETRY_DELAYS_MS = [1_000, 2_000, 4_000] as const
const PEER_RECONNECT_DELAYS_MS = [2_000, 5_000, 10_000, 20_000, 30_000] as const
const KNOWN_STATES = new Set<P2pConnectionState>([
  'idle',
  'signaling',
  'connecting',
  'connected',
  'reconnecting',
  'closed',
])

let pollTimer: ReturnType<typeof setInterval> | null = null
let pollInFlight = false
const knownConnections = new Map<string, P2pConnectionInfo>()
const connectInFlight = new Map<string, Promise<P2pConnectionState>>()

const KNOWN_MODES = new Set<P2pConnectionMode>(['lan', 'wan'])
const peerConnectionModes = new Map<string, P2pConnectionMode>()
const reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>()
const reconnectAttempts = new Map<string, number>()
const iceRestartInFlight = new Set<string>()

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

function cancelPendingPeerRecovery(peerDeviceId: string): void {
  const timer = reconnectTimers.get(peerDeviceId)
  if (timer) {
    clearTimeout(timer)
    reconnectTimers.delete(peerDeviceId)
  }
  iceRestartInFlight.delete(peerDeviceId)
}

export async function resetStalePeerConnection(peerDeviceId: string): Promise<void> {
  cancelPendingPeerRecovery(peerDeviceId)
  if (isPeerConnected(peerDeviceId)) {
    return
  }

  const native = (await P2pBridge.connectionList()).find(
    (item) => item.peerDeviceId === peerDeviceId,
  )
  if (!native) {
    knownConnections.delete(peerDeviceId)
    return
  }
  if (native.state === 'connected') {
    return
  }

  await disconnectP2pPeer(peerDeviceId)
}

function schedulePeerReconnect(peerDeviceId: string, workspaceId: string): void {
  if (reconnectTimers.has(peerDeviceId)) return

  const attempt = reconnectAttempts.get(peerDeviceId) ?? 0
  const delay =
    PEER_RECONNECT_DELAYS_MS[Math.min(attempt, PEER_RECONNECT_DELAYS_MS.length - 1)] ?? 30_000

  const timer = setTimeout(() => {
    reconnectTimers.delete(peerDeviceId)
    void connectP2pPeer(peerDeviceId, workspaceId)
      .then((state) => {
        if (state === 'connected') {
          reconnectAttempts.delete(peerDeviceId)
          return
        }
        reconnectAttempts.set(peerDeviceId, attempt + 1)
        schedulePeerReconnect(peerDeviceId, workspaceId)
      })
      .catch(() => {
        reconnectAttempts.set(peerDeviceId, attempt + 1)
        schedulePeerReconnect(peerDeviceId, workspaceId)
      })
  }, delay)

  reconnectTimers.set(peerDeviceId, timer)
}

async function tryIceRestartBeforeReconnect(
  peerDeviceId: string,
  workspaceId: string,
): Promise<void> {
  if (iceRestartInFlight.has(peerDeviceId) || reconnectTimers.has(peerDeviceId)) {
    return
  }

  if (getPeerConnectionMode(peerDeviceId) === 'wan') {
    schedulePeerReconnect(peerDeviceId, workspaceId)
    return
  }

  // Peer is visible on LAN while we are reconnecting — likely restarted with a fresh
  // WebRTC stack; ICE restart cannot succeed against an empty remote session.
  if (isP2pPeerDiscoverableOnline(peerDeviceId)) {
    await resetStalePeerConnection(peerDeviceId)
    void connectP2pPeer(peerDeviceId, workspaceId)
      .then((state) => {
        if (state === 'connected') {
          reconnectAttempts.delete(peerDeviceId)
          notifyP2pReconnect(workspaceId, peerDeviceId)
        } else {
          schedulePeerReconnect(peerDeviceId, workspaceId)
        }
      })
      .catch(() => {
        schedulePeerReconnect(peerDeviceId, workspaceId)
      })
    return
  }

  iceRestartInFlight.add(peerDeviceId)
  try {
    const result = await P2pBridge.connectionRestartIce(peerDeviceId)
    if (result.state === 'connected') {
      reconnectAttempts.delete(peerDeviceId)
      notifyP2pReconnect(workspaceId, peerDeviceId)
      return
    }
  } catch (error) {
    const message = toErrorMessage(error, 'ICE restart failed')
    logStructured('p2p', 'warn', `ICE restart failed for ${peerDeviceId.slice(0, 8)}: ${message}`)
  } finally {
    iceRestartInFlight.delete(peerDeviceId)
  }

  await resetStalePeerConnection(peerDeviceId)
  schedulePeerReconnect(peerDeviceId, workspaceId)
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
          reconnectAttempts.delete(peerDeviceId)
          const timer = reconnectTimers.get(peerDeviceId)
          if (timer) {
            clearTimeout(timer)
            reconnectTimers.delete(peerDeviceId)
          }
          notifyP2pReconnect(connection.workspaceId!, peerDeviceId)
          void import('./p2p-member.service').then((module) => {
            module.flushPendingJoinNotification(peerDeviceId, connection.workspaceId ?? undefined)
            if (connection.workspaceId) {
              void module.reconcileOwnerWorkspaceMembers(connection.workspaceId)
            }
          })
        } else if (
          previous?.state === 'connected' &&
          connection.state === 'reconnecting'
        ) {
          void tryIceRestartBeforeReconnect(peerDeviceId, connection.workspaceId)
        } else if (
          previous?.state === 'connected' &&
          connection.state === 'closed'
        ) {
          schedulePeerReconnect(peerDeviceId, connection.workspaceId)
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
      if (previous.workspaceId) {
        handlePeerConnectionChange(previous.workspaceId, peerDeviceId, 'closed')
        if (previous.state === 'connected') {
          schedulePeerReconnect(peerDeviceId, previous.workspaceId)
        }
      }
      void P2pBridge.connectionDisconnect(peerDeviceId).catch(() => undefined)
    }
  }

  knownConnections.clear()
  for (const [peerDeviceId, connection] of nextByPeer) {
    knownConnections.set(peerDeviceId, connection)
  }
}

async function pollConnections(): Promise<void> {
  if (pollInFlight) return
  pollInFlight = true
  try {
    const connections = (await P2pBridge.connectionList()).map(mapNativeConnection)
    applyP2pConnectionSnapshot(connections)
    syncConnectionEvents(connections)
    await processP2pIncomingMessagesFromPoll()
  } catch (error) {
    const message = toErrorMessage(error, 'Failed to poll P2P connections')
    logStructured('p2p', 'error', `connection poll failed: ${message}`)
  } finally {
    pollInFlight = false
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
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
  options?: { workspaceKeyB64?: string },
): Promise<void> {
  const workspaceKey = options?.workspaceKeyB64 ?? loadWorkspaceKey(workspaceId)
  if (!workspaceKey) {
    throw new Error('群组密钥不存在')
  }

  setWorkspaceKey(workspaceId, workspaceKey, 1)
  const state = await connectP2pPeer(peerDeviceId, workspaceId)
  if (state !== 'connected') {
    throw new Error(`对端未连接 (${state})`)
  }

  try {
    await rotateWorkspaceKey(workspaceId, workspaceKey, 1)
  } catch (error) {
    const errMessage = toErrorMessage(error, 'rotate failed')
    logStructured('p2p', 'warn', `workspace key rotate skipped for ${peerDeviceId.slice(0, 8)}: ${errMessage}`)
  }
}

async function connectP2pPeerOnce(
  peerDeviceId: string,
  workspaceId?: string,
): Promise<P2pConnectionState> {
  startPolling()
  await resetStalePeerConnection(peerDeviceId)

  if (workspaceId) {
    const workspaceKey = loadWorkspaceKey(workspaceId)
    if (workspaceKey) {
      setWorkspaceKey(workspaceId, workspaceKey, 1)
    }
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
    const message = toErrorMessage(error, 'Failed to connect peer')
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

  const promise = (async () => {
    let lastError: unknown = null
    for (let attempt = 0; attempt < CONNECT_RETRY_DELAYS_MS.length; attempt += 1) {
      try {
        const state = await connectP2pPeerOnce(peerDeviceId, workspaceId)
        if (state === 'connected') {
          return state
        }
      } catch (error) {
        lastError = error
      }
      if (attempt < CONNECT_RETRY_DELAYS_MS.length - 1) {
        await sleep(CONNECT_RETRY_DELAYS_MS[attempt]!)
      }
    }
    if (lastError instanceof Error) {
      throw lastError
    }
    throw new Error('Failed to connect peer after retries')
  })()

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
  knownConnections.delete(peerDeviceId)
  peerConnectionModes.delete(peerDeviceId)
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
