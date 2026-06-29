import { logStructured } from '../structured-log.service'
import { toErrorMessage } from '@toolman/shared'
import type { P2pConnectionState } from '@toolman/shared'
import { P2pBridge } from './p2p-bridge'
import {
  broadcastP2pConnectionError,
  broadcastP2pConnectionStateChange,
} from './p2p-connection-broadcast'
import { isP2pPeerDiscoverableOnline } from './p2p-discovery.service'
import { handlePeerConnectionChange, resolveWorkspaceIdForPeerConnection } from './p2p-peer.service'
import { notifyP2pReconnect } from './p2p-sync-lifecycle'
import {
  getPeerConnectionMode,
  iceRestartInFlight,
  knownConnections,
  reconnectAttempts,
  reconnectTimers,
} from './p2p-connection-state'

const PEER_RECONNECT_DELAYS_MS = [2_000, 5_000, 10_000, 20_000, 30_000] as const

export function cancelPendingPeerRecovery(peerDeviceId: string): void {
  const timer = reconnectTimers.get(peerDeviceId)
  if (timer) {
    clearTimeout(timer)
    reconnectTimers.delete(peerDeviceId)
  }
  iceRestartInFlight.delete(peerDeviceId)
}

export async function resetStalePeerConnection(peerDeviceId: string): Promise<void> {
  cancelPendingPeerRecovery(peerDeviceId)
  if (knownConnections.get(peerDeviceId)?.state === 'connected') {
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

  const { disconnectP2pPeer } = await import('./p2p-connection-connect')
  await disconnectP2pPeer(peerDeviceId)
}

export function schedulePeerReconnect(
  peerDeviceId: string,
  workspaceId: string,
  connectP2pPeer: (peerDeviceId: string, workspaceId?: string) => Promise<P2pConnectionState>,
): void {
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
        schedulePeerReconnect(peerDeviceId, workspaceId, connectP2pPeer)
      })
      .catch(() => {
        reconnectAttempts.set(peerDeviceId, attempt + 1)
        schedulePeerReconnect(peerDeviceId, workspaceId, connectP2pPeer)
      })
  }, delay)

  reconnectTimers.set(peerDeviceId, timer)
}

export async function tryIceRestartBeforeReconnect(
  peerDeviceId: string,
  workspaceId: string,
  connectP2pPeer: (peerDeviceId: string, workspaceId?: string) => Promise<P2pConnectionState>,
): Promise<void> {
  if (iceRestartInFlight.has(peerDeviceId) || reconnectTimers.has(peerDeviceId)) {
    return
  }

  if (getPeerConnectionMode(peerDeviceId) === 'wan') {
    schedulePeerReconnect(peerDeviceId, workspaceId, connectP2pPeer)
    return
  }

  if (isP2pPeerDiscoverableOnline(peerDeviceId)) {
    await resetStalePeerConnection(peerDeviceId)
    void connectP2pPeer(peerDeviceId, workspaceId)
      .then((state) => {
        if (state === 'connected') {
          reconnectAttempts.delete(peerDeviceId)
          notifyP2pReconnect(workspaceId, peerDeviceId)
        } else {
          schedulePeerReconnect(peerDeviceId, workspaceId, connectP2pPeer)
        }
      })
      .catch(() => {
        schedulePeerReconnect(peerDeviceId, workspaceId, connectP2pPeer)
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
  schedulePeerReconnect(peerDeviceId, workspaceId, connectP2pPeer)
}

export function syncConnectionEvents(
  connections: import('@toolman/shared').P2pConnectionInfo[],
  connectP2pPeer: (peerDeviceId: string, workspaceId?: string) => Promise<P2pConnectionState>,
): void {
  const nextByPeer = new Map(connections.map((item) => [item.peerDeviceId, item]))

  for (const [peerDeviceId, connection] of nextByPeer) {
    const previous = knownConnections.get(peerDeviceId)
    if (!previous || previous.state !== connection.state) {
      broadcastP2pConnectionStateChange({
        peerDeviceId,
        state: connection.state,
        workspaceId: connection.workspaceId,
      })
      const resolvedWorkspaceId = resolveWorkspaceIdForPeerConnection(
        peerDeviceId,
        connection.workspaceId,
      )
      handlePeerConnectionChange(resolvedWorkspaceId, peerDeviceId, connection.state)
      if (connection.state === 'connected') {
        reconnectAttempts.delete(peerDeviceId)
        const timer = reconnectTimers.get(peerDeviceId)
        if (timer) {
          clearTimeout(timer)
          reconnectTimers.delete(peerDeviceId)
        }
        if (resolvedWorkspaceId) {
          notifyP2pReconnect(resolvedWorkspaceId, peerDeviceId)
          void import('./p2p-member.service').then((module) => {
            module.flushPendingJoinNotification(peerDeviceId, resolvedWorkspaceId)
            void module.reconcileOwnerWorkspaceMembers(resolvedWorkspaceId)
          })
        }
      } else if (
        previous?.state === 'connected' &&
        connection.state === 'reconnecting'
      ) {
        const restartWorkspaceId = resolvedWorkspaceId ?? connection.workspaceId
        if (restartWorkspaceId) {
          void tryIceRestartBeforeReconnect(peerDeviceId, restartWorkspaceId, connectP2pPeer)
        }
      } else if (
        previous?.state === 'connected' &&
        connection.state === 'closed'
      ) {
        const reconnectWorkspaceId = resolvedWorkspaceId ?? connection.workspaceId
        if (reconnectWorkspaceId) {
          schedulePeerReconnect(peerDeviceId, reconnectWorkspaceId, connectP2pPeer)
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
          schedulePeerReconnect(peerDeviceId, previous.workspaceId, connectP2pPeer)
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

export function broadcastConnectionError(peerDeviceId: string, error: unknown): void {
  const message = toErrorMessage(error, 'Failed to connect peer')
  broadcastP2pConnectionError({
    peerDeviceId,
    code: 'P2P_CONNECTION_FAILED',
    message,
  })
}
