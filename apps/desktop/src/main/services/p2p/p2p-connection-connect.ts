import type { P2pConnectionInfo, P2pConnectionState } from '@toolman/shared'
import { logStructured } from '../structured-log.service'
import { toErrorMessage } from '@toolman/shared'
import { P2pBridge } from './p2p-bridge'
import { broadcastP2pConnectionStateChange } from './p2p-connection-broadcast'
import { handlePeerConnectionChange, resolveWorkspaceIdForPeerConnection } from './p2p-peer.service'
import { applyP2pConnectionSnapshot, processP2pIncomingMessagesFromPoll } from './p2p-sync-lifecycle'
import { loadWorkspaceKey } from './p2p-workspace-key.store'
import { rotateWorkspaceKey, setWorkspaceKey } from './p2p-crypto.service'
import {
  getKnownP2pConnections,
  isPeerConnected,
  knownConnections,
  mapNativeConnection,
  peerConnectionModes,
  KNOWN_CONNECTION_STATES,
} from './p2p-connection-state'
import {
  broadcastConnectionError,
  resetStalePeerConnection,
  syncConnectionEvents,
} from './p2p-connection-recovery'

const POLL_INTERVAL_MS = 2_000
const CONNECT_RETRY_DELAYS_MS = [1_000, 2_000, 4_000] as const

let pollTimer: ReturnType<typeof setInterval> | null = null
let pollInFlight = false
const connectInFlight = new Map<string, Promise<P2pConnectionState>>()

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function pollConnections(): Promise<void> {
  if (pollInFlight) return
  pollInFlight = true
  try {
    const connections = (await P2pBridge.connectionList()).map(mapNativeConnection)
    applyP2pConnectionSnapshot(connections)
    syncConnectionEvents(connections, connectP2pPeer)
    await processP2pIncomingMessagesFromPoll()
  } catch (error) {
    const message = toErrorMessage(error, 'Failed to poll P2P connections')
    logStructured('p2p', 'error', `connection poll failed: ${message}`)
  } finally {
    pollInFlight = false
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

export async function ensurePeerReadyForWorkspace(
  peerDeviceId: string,
  workspaceId: string,
  options?: { workspaceKeyB64?: string },
): Promise<void> {
  const resolvedWorkspaceId =
    resolveWorkspaceIdForPeerConnection(peerDeviceId, workspaceId) ?? workspaceId
  const workspaceKey = options?.workspaceKeyB64 ?? loadWorkspaceKey(resolvedWorkspaceId)
  if (!workspaceKey) {
    throw new Error('群组密钥不存在')
  }

  setWorkspaceKey(resolvedWorkspaceId, workspaceKey, 1)
  const state = await connectP2pPeer(peerDeviceId, resolvedWorkspaceId)
  if (state !== 'connected') {
    throw new Error(`对端未连接 (${state})`)
  }

  try {
    await rotateWorkspaceKey(resolvedWorkspaceId, workspaceKey, 1)
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
    const state = KNOWN_CONNECTION_STATES.has(result.state as P2pConnectionState)
      ? (result.state as P2pConnectionState)
      : 'connecting'
    broadcastP2pConnectionStateChange({
      peerDeviceId,
      state,
      workspaceId,
    })
    handlePeerConnectionChange(workspaceId, peerDeviceId, state)
    return state
  } catch (error) {
    broadcastConnectionError(peerDeviceId, error)
    throw error
  }
}

export async function connectP2pPeer(
  peerDeviceId: string,
  workspaceId?: string,
): Promise<P2pConnectionState> {
  const resolvedWorkspaceId = resolveWorkspaceIdForPeerConnection(peerDeviceId, workspaceId)

  const inFlight = connectInFlight.get(peerDeviceId)
  if (inFlight) {
    return inFlight
  }

  const promise = (async () => {
    let lastError: unknown = null
    for (let attempt = 0; attempt < CONNECT_RETRY_DELAYS_MS.length; attempt += 1) {
      try {
        const state = await connectP2pPeerOnce(peerDeviceId, resolvedWorkspaceId)
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

export {
  getKnownP2pConnections,
  isPeerConnected,
  resetStalePeerConnection,
}
