import { P2pWorkspaceRepository } from '@toolman/db'
import type { P2pConnectionInfo, P2pSyncStatus } from '@toolman/shared'
import { resolveReplicationTopology, toErrorMessage } from '@toolman/shared'
import { getDatabase } from '../../bootstrap/database'
import { assertRegisteredForP2p } from './p2p-auth.guard'
import { getPendingBlobTransferCount } from './p2p-blob-transfer.service'
import { getWorkspaceLatestSeq } from './p2p-event.service'
import { withWorkspaceEventWrite } from './p2p-workspace-event-mutex'
import { maybeAutoSnapshot } from './p2p-snapshot.service'
import { registerP2pSyncHandlers } from './p2p-sync-lifecycle'
import {
  getWorkspaceSequencingMode,
  isOwnerPeerConnected,
  rehydrateLamportClocksFromDatabase,
} from './p2p-sync-sequencing'
import { processP2pIncomingMessages } from './p2p-sync-message-processing'
import {
  handleP2pPeerConnected,
  recoverWorkspaceSyncAfterReconnect,
  syncWithPeer,
} from './p2p-sync-peer'
import { onLocalP2pEventAppended } from './p2p-sync-local-replication'
import {
  broadcastP2pSyncError,
  broadcastP2pSyncProgress,
} from './p2p-sync-broadcast'
import { shouldSetWorkspaceIdleAfterPeerSync } from './p2p-sync-error-state'
import { isPeerTrusted } from './p2p-peer.service'
import { listP2pConnections } from './p2p-connection.service'
import {
  connectionSnapshot,
  findConnectedPeer,
  getWorkspaceState,
  listWorkspacePeerDeviceIds,
  mapPeerStatus,
  setWorkspaceState,
  syncingWorkspaces,
} from './p2p-sync-state'

async function startP2pSyncCore(workspaceId: string): Promise<{
  status: 'syncing' | 'idle'
  peersTotal: number
  peersConnected: number
}> {
  assertRegisteredForP2p()
  const workspace = new P2pWorkspaceRepository(getDatabase()).findById(workspaceId)
  if (!workspace) {
    throw new Error('群组不存在')
  }

  const peerDeviceIds = listWorkspacePeerDeviceIds(workspaceId)
  syncingWorkspaces.add(workspaceId)
  setWorkspaceState(workspaceId, { status: 'syncing', error: undefined })

  const connections = await listP2pConnections()
  let peersConnected = 0

  broadcastP2pSyncProgress({
    workspaceId,
    phase: 'events',
    current: 0,
    total: peerDeviceIds.length,
  })

  let syncHadError = false

  for (const [index, peerDeviceId] of peerDeviceIds.entries()) {
    try {
      if (!isPeerTrusted(workspaceId, peerDeviceId)) continue
      await syncWithPeer(workspaceId, peerDeviceId)
      if (findConnectedPeer(connections, peerDeviceId)) peersConnected += 1
      broadcastP2pSyncProgress({
        workspaceId,
        phase: 'events',
        current: index + 1,
        total: peerDeviceIds.length,
      })
    } catch (error) {
      syncHadError = true
      const errMessage = toErrorMessage(error, 'Sync failed')
      setWorkspaceState(workspaceId, { status: 'error', error: errMessage })
      broadcastP2pSyncError({ workspaceId, code: 'P2P_SYNC_FAILED', message: errMessage })
    }
  }

  if (shouldSetWorkspaceIdleAfterPeerSync(syncHadError)) {
    setWorkspaceState(workspaceId, { status: 'idle', lastSyncAt: Date.now() })
  }
  syncingWorkspaces.delete(workspaceId)

  return {
    status: 'syncing',
    peersTotal: peerDeviceIds.length,
    peersConnected,
  }
}

export async function startP2pSync(workspaceId: string): Promise<{
  status: 'syncing' | 'idle'
  peersTotal: number
  peersConnected: number
}> {
  return withWorkspaceEventWrite(workspaceId, () => startP2pSyncCore(workspaceId))
}

export function stopP2pSync(workspaceId: string): { status: 'idle' } {
  syncingWorkspaces.delete(workspaceId)
  setWorkspaceState(workspaceId, { status: 'idle' })
  return { status: 'idle' }
}

export function getP2pSyncStatus(workspaceId: string): {
  status: P2pSyncStatus
  lastEventSeq: number
  lastSyncAt?: number
  peers: ReturnType<typeof mapPeerStatus>[]
  pendingFiles: number
  error?: string
  sequencingMode: ReturnType<typeof getWorkspaceSequencingMode>
  ownerOnline: boolean
  replicationTopology: ReturnType<typeof resolveReplicationTopology>
  meshPeersConnected: number
} {
  const state = getWorkspaceState(workspaceId)
  const connections = [...connectionSnapshot]
  const peerDeviceIds = listWorkspacePeerDeviceIds(workspaceId)
  const workspaceRow = new P2pWorkspaceRepository(getDatabase()).findById(workspaceId)
  const lastEventSeq = Math.max(
    getWorkspaceLatestSeq(workspaceId),
    workspaceRow?.lastEventSeq ?? 0,
  )
  const ownerOnline = isOwnerPeerConnected(workspaceId, connections)
  const ownerDeviceId = workspaceRow?.ownerDeviceId
  const meshPeersConnected = peerDeviceIds.filter((peerDeviceId) => {
    if (peerDeviceId === ownerDeviceId) return false
    return Boolean(findConnectedPeer(connections, peerDeviceId))
  }).length

  return {
    status: syncingWorkspaces.has(workspaceId) ? 'syncing' : state.status,
    lastEventSeq,
    lastSyncAt: state.lastSyncAt,
    peers: peerDeviceIds.map((peerDeviceId) =>
      mapPeerStatus(
        workspaceId,
        connections.find((item) => item.peerDeviceId === peerDeviceId),
        peerDeviceId,
      ),
    ),
    pendingFiles: getPendingBlobTransferCount(),
    error: state.error,
    sequencingMode: getWorkspaceSequencingMode(workspaceId, connections),
    ownerOnline,
    replicationTopology: resolveReplicationTopology({ ownerOnline, meshPeersConnected }),
    meshPeersConnected,
  }
}

export function updateP2pSyncConnectionSnapshot(connections: P2pConnectionInfo[]): void {
  connectionSnapshot.splice(0, connectionSnapshot.length, ...connections)
}

export function bootstrapP2pSync(): void {
  rehydrateLamportClocksFromDatabase()
  registerP2pSyncHandlers({
    onLocalEventAppended: onLocalP2pEventAppended,
    onReconnect: recoverWorkspaceSyncAfterReconnect,
    onPeerConnected: handleP2pPeerConnected,
    onAutoSnapshot: (workspaceId) => {
      maybeAutoSnapshot(workspaceId)
    },
    updateConnectionSnapshot: updateP2pSyncConnectionSnapshot,
    processIncomingMessages: processP2pIncomingMessages,
  })
}
