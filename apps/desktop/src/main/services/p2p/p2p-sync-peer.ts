import { orderMeshCatchUpPeers, toErrorMessage, type MeshPeerSyncCandidate } from '@toolman/shared'
import { logStructured } from '../structured-log.service'
import { assertRegisteredForP2p } from './p2p-auth.guard'
import { ensurePeerReadyForWorkspace, listP2pConnections } from './p2p-connection.service'
import { loadAllWorkspaceKeys, loadWorkspaceKey } from './p2p-workspace-key.store'
import { isPeerTrusted } from './p2p-peer.service'
import { broadcastP2pSyncError } from './p2p-sync-broadcast'
import { getWorkspaceLatestSeq } from './p2p-event.service'
import { withWorkspaceEventWrite } from './p2p-workspace-event-mutex'
import { getP2pDeviceInfo } from './p2p-device-identity.service'
import { reconcileWorkspaceMemberMesh } from './p2p-member-mesh.service'
import {
  getWorkspaceOwnerDeviceId,
  isLocalWorkspaceOwner,
} from './p2p-sync-sequencing'
import { shouldUseSnapshotSync } from './p2p-snapshot.service'
import {
  cursorLastReceived,
  cursorLastSent,
  findConnectedPeer,
  getPeerCursor,
  getWorkspaceRepo,
  listSyncTargetPeerIds,
  listWorkspacePeerDeviceIds,
  reconcileGroupChatAfterSync,
  reconnectRecoveryInFlight,
  reconnectRecoveryLastRunAt,
  RECONNECT_RECOVERY_COOLDOWN_MS,
  setWorkspaceState,
} from './p2p-sync-state'
import {
  sendEventsBatch,
  sendReplicationMessage,
  sendSnapshotToPeer,
  sendSyncHello,
} from './p2p-sync-replication-send'

export async function syncWithPeer(workspaceId: string, peerDeviceId: string): Promise<void> {
  assertRegisteredForP2p()
  const device = getP2pDeviceInfo()
  if (peerDeviceId === device.deviceId) return
  if (!isPeerTrusted(workspaceId, peerDeviceId)) return

  const connections = await listP2pConnections()
  if (!findConnectedPeer(connections, peerDeviceId)) {
    await ensurePeerReadyForWorkspace(peerDeviceId, workspaceId)
  }

  await sendSyncHello(peerDeviceId, workspaceId)
}

export async function catchUpFromMeshPeers(workspaceId: string): Promise<number> {
  await reconcileWorkspaceMemberMesh(workspaceId, { immediate: true })

  const localLatestSeq = getWorkspaceLatestSeq(workspaceId)
  const connections = await listP2pConnections()
  const peerDeviceIds = listWorkspacePeerDeviceIds(workspaceId)
  const ownerDeviceId = getWorkspaceOwnerDeviceId(workspaceId)

  const candidates: MeshPeerSyncCandidate[] = peerDeviceIds
    .filter((deviceId) => deviceId !== ownerDeviceId)
    .map((deviceId) => {
      const cursor = getPeerCursor(workspaceId, deviceId)
      const connection = connections.find((item) => item.peerDeviceId === deviceId)
      return {
        deviceId,
        connected: connection?.state === 'connected',
        lastReceivedSeq: cursorLastReceived(cursor),
        lastSentSeq: cursorLastSent(cursor),
      }
    })

  const orderedPeerIds = orderMeshCatchUpPeers(localLatestSeq, candidates)
  let syncedPeers = 0

  for (const peerDeviceId of orderedPeerIds) {
    if (!isPeerTrusted(workspaceId, peerDeviceId)) continue
    try {
      await syncWithPeer(workspaceId, peerDeviceId)
      syncedPeers += 1
    } catch (error) {
      logStructured('p2p', 'warn', `mesh catch-up with ${peerDeviceId} failed: ${toErrorMessage(error, 'mesh catch-up failed')}`)
    }
  }

  return syncedPeers
}

export async function ensureWorkspaceKeyForCatchUp(workspaceId: string): Promise<boolean> {
  if (loadWorkspaceKey(workspaceId)) return true
  loadAllWorkspaceKeys()
  return Boolean(loadWorkspaceKey(workspaceId))
}

/** 群主在成员激活后主动推送尚未同步的历史事件（不依赖 sync.hello 往返） */
export async function pushWorkspaceEventsToPeer(
  workspaceId: string,
  peerDeviceId: string,
): Promise<number> {
  assertRegisteredForP2p()
  if (!isLocalWorkspaceOwner(workspaceId)) return 0
  if (!isPeerTrusted(workspaceId, peerDeviceId)) return 0

  try {
    await ensurePeerReadyForWorkspace(peerDeviceId, workspaceId)
  } catch (error) {
    logStructured(
      'p2p',
      'warn',
      `push events to ${peerDeviceId.slice(0, 8)} failed: ${toErrorMessage(error, 'connect failed')}`,
    )
    return 0
  }

  const cursor = getPeerCursor(workspaceId, peerDeviceId)
  const sinceSeq = cursorLastSent(cursor)
  const latestSeq = getWorkspaceLatestSeq(workspaceId)
  if (sinceSeq >= latestSeq) return 0

  return sendEventsBatch(peerDeviceId, workspaceId, sinceSeq)
}

export async function recoverWorkspaceSyncAfterReconnect(
  workspaceId: string,
  peerDeviceId?: string,
): Promise<void> {
  if (!workspaceId) return

  const recoveryKey = `${workspaceId}:${peerDeviceId ?? 'all'}`
  if (reconnectRecoveryInFlight.has(recoveryKey)) return

  const lastRun = reconnectRecoveryLastRunAt.get(recoveryKey) ?? 0
  if (Date.now() - lastRun < RECONNECT_RECOVERY_COOLDOWN_MS) return

  reconnectRecoveryLastRunAt.set(recoveryKey, Date.now())
  reconnectRecoveryInFlight.add(recoveryKey)

  try {
    for (const peer of listSyncTargetPeerIds(workspaceId, peerDeviceId)) {
      if (!isPeerTrusted(workspaceId, peer)) continue
      await syncWithPeer(workspaceId, peer)
    }
    reconcileGroupChatAfterSync(workspaceId)
  } catch (error) {
    logStructured('p2p', 'warn', `reconnect catch-up failed for ${workspaceId}: ${toErrorMessage(error, '重连后同步失败')}`)
  } finally {
    reconnectRecoveryInFlight.delete(recoveryKey)
  }
}

export async function handleP2pPeerConnected(
  workspaceId: string,
  peerDeviceId: string,
): Promise<void> {
  if (!isPeerTrusted(workspaceId, peerDeviceId)) return
  await recoverWorkspaceSyncAfterReconnect(workspaceId, peerDeviceId)
  void reconcileWorkspaceMemberMesh(workspaceId)
}

export async function requestSnapshotFromOwner(
  workspaceId: string,
  ownerDeviceId: string,
): Promise<void> {
  assertRegisteredForP2p()
  const device = getP2pDeviceInfo()
  if (ownerDeviceId === device.deviceId) return

  try {
    await ensurePeerReadyForWorkspace(ownerDeviceId, workspaceId)
  } catch (error) {
    logStructured('p2p', 'warn', `snapshot connect to owner failed: ${toErrorMessage(error, 'connect owner failed')}`)
    return
  }

  await sendReplicationMessage(ownerDeviceId, {
    type: 'snapshot.request',
    workspaceId,
  })
}

export async function forceP2pSync(
  workspaceId: string,
  peerDeviceId?: string,
): Promise<{ eventsApplied: number; filesFetched: number; snapshotUsed: boolean }> {
  return withWorkspaceEventWrite(workspaceId, () => forceP2pSyncCore(workspaceId, peerDeviceId))
}

async function forceP2pSyncCore(
  workspaceId: string,
  peerDeviceId?: string,
): Promise<{ eventsApplied: number; filesFetched: number; snapshotUsed: boolean }> {
  assertRegisteredForP2p()

  let eventsApplied = 0
  let snapshotUsed = false

  setWorkspaceState(workspaceId, { status: 'syncing', error: undefined })

  for (const peer of listSyncTargetPeerIds(workspaceId, peerDeviceId)) {
    if (!isPeerTrusted(workspaceId, peer)) continue

    try {
      await ensurePeerReadyForWorkspace(peer, workspaceId)
      const latestSeq = getWorkspaceLatestSeq(workspaceId)
      const cursor = getPeerCursor(workspaceId, peer)
      const peerBehind = cursorLastReceived(cursor) < latestSeq

      if (peerBehind && shouldUseSnapshotSync(cursorLastReceived(cursor), latestSeq)) {
        const wire = await sendSnapshotToPeer(peer, workspaceId)
        if (wire) snapshotUsed = true
        const sinceSeq = wire?.snapshotSeq ?? cursorLastSent(cursor)
        eventsApplied += await sendEventsBatch(peer, workspaceId, sinceSeq)
      } else if (peerBehind) {
        eventsApplied += await sendEventsBatch(peer, workspaceId, cursorLastSent(cursor))
      }

      const localSeq = getWorkspaceLatestSeq(workspaceId)
      const workspace = getWorkspaceRepo().findById(workspaceId)
      if ((workspace?.lastSnapshotSeq ?? 0) < localSeq || localSeq === 0) {
        await sendReplicationMessage(peer, {
          type: 'snapshot.request',
          workspaceId,
        })
      }

      await sendSyncHello(peer, workspaceId)
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Force sync failed')
      setWorkspaceState(workspaceId, { status: 'error', error: errMessage })
      broadcastP2pSyncError({ workspaceId, code: 'P2P_SYNC_FAILED', message: errMessage })
    }
  }

  setWorkspaceState(workspaceId, { status: 'idle', lastSyncAt: Date.now() })

  return {
    eventsApplied,
    filesFetched: 0,
    snapshotUsed,
  }
}
