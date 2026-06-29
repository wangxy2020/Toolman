import { toErrorMessage } from '@toolman/shared'
import { logStructured } from '../structured-log.service'
import { assertRegisteredForP2p } from './p2p-auth.guard'
import { ensurePeerReadyForWorkspace, isPeerConnected, listP2pConnections } from './p2p-connection.service'
import { syncMissingWorkspaceBlobs } from './p2p-blob-transfer.service'
import { syncMissingSharedKnowledgeDocuments } from './p2p-knowledge-projection'
import { ensureMemberConnectsToOwner } from './p2p-member-reconcile.service'
import { reconcileWorkspaceMemberMesh } from './p2p-member-mesh.service'
import { ensureOwnerPeerTrustedForSync } from './p2p-peer.service'
import { broadcastP2pSyncCompleted } from './p2p-sync-broadcast'
import { getWorkspaceLatestSeq } from './p2p-event.service'
import { getP2pDeviceInfo } from './p2p-device-identity.service'
import { isOwnerPeerConnected } from './p2p-sync-sequencing'
import { processP2pIncomingMessages } from './p2p-sync-message-processing'
import {
  catchUpFromMeshPeers,
  ensureWorkspaceKeyForCatchUp,
  syncWithPeer,
} from './p2p-sync-peer'
import { requestMissingEventsFromPeer } from './p2p-sync-replication-send'
import {
  getWorkspaceRepo,
  joinerCatchUpInFlight,
  joinerCatchUpScheduled,
  JOINER_CATCH_UP_DEBOUNCE_MS,
  reconcileGroupChatAfterSync,
  reconcileSharedResourcesAfterSync,
} from './p2p-sync-state'

const REPLICATION_SETTLE_INTERVAL_MS = 200
const REPLICATION_SETTLE_IDLE_ROUNDS = 6
const REPLICATION_SETTLE_MAX_WAIT_MS = 8000

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

/** sync.hello 仅发送握手；轮询 drain 直至事件批次处理完毕或超时 */
async function settleInboundReplication(workspaceId: string): Promise<void> {
  const deadline = Date.now() + REPLICATION_SETTLE_MAX_WAIT_MS
  let idleRounds = 0
  let lastSeq = getWorkspaceLatestSeq(workspaceId)

  while (Date.now() < deadline && idleRounds < REPLICATION_SETTLE_IDLE_ROUNDS) {
    const seqBefore = getWorkspaceLatestSeq(workspaceId)
    await processP2pIncomingMessages()
    const seqAfter = getWorkspaceLatestSeq(workspaceId)

    if (seqAfter === seqBefore && seqAfter === lastSeq) {
      idleRounds += 1
    } else {
      idleRounds = 0
      lastSeq = seqAfter
    }

    await sleepMs(REPLICATION_SETTLE_INTERVAL_MS)
  }
}

async function runJoinerEventCatchUp(workspaceId: string, ownerDeviceId: string): Promise<void> {
  if (!(await ensureWorkspaceKeyForCatchUp(workspaceId))) {
    logStructured('p2p', 'warn', `joiner catch-up skipped: workspace key missing for ${workspaceId}`)
    return
  }

  const connections = await listP2pConnections()
  const ownerOnline = isOwnerPeerConnected(workspaceId, connections)

  if (ownerOnline) {
    ensureOwnerPeerTrustedForSync(workspaceId, ownerDeviceId)
    await (isPeerConnected(ownerDeviceId)
      ? ensurePeerReadyForWorkspace(ownerDeviceId, workspaceId)
      : ensureMemberConnectsToOwner(workspaceId, { immediate: true }))
    await syncWithPeer(workspaceId, ownerDeviceId)
    await requestMissingEventsFromPeer(workspaceId, ownerDeviceId)
  } else {
    const syncedPeers = await catchUpFromMeshPeers(workspaceId)
    if (syncedPeers === 0) {
      logStructured('p2p', 'warn', `owner offline and no mesh peers available for ${workspaceId}`)
    }
  }

  await settleInboundReplication(workspaceId)

  await syncMissingWorkspaceBlobs(workspaceId)
  reconcileSharedResourcesAfterSync(workspaceId)
  await syncMissingSharedKnowledgeDocuments(workspaceId)
  await reconcileWorkspaceMemberMesh(workspaceId)
  reconcileGroupChatAfterSync(workspaceId)

  broadcastP2pSyncCompleted({
    workspaceId,
    eventsApplied: 0,
    filesFetched: 0,
  })
}

export function scheduleJoinerEventCatchUp(workspaceId: string): void {
  assertRegisteredForP2p()
  const workspace = getWorkspaceRepo().findById(workspaceId)
  if (!workspace) return

  const device = getP2pDeviceInfo()
  if (workspace.ownerDeviceId === device.deviceId) return
  if (joinerCatchUpInFlight.has(workspaceId)) return

  const pending = joinerCatchUpScheduled.get(workspaceId)
  if (pending) clearTimeout(pending)

  joinerCatchUpScheduled.set(
    workspaceId,
    setTimeout(() => {
      joinerCatchUpScheduled.delete(workspaceId)
      if (joinerCatchUpInFlight.has(workspaceId)) return

      const promise = runJoinerEventCatchUp(workspaceId, workspace.ownerDeviceId)
        .catch((error) => {
          logStructured('p2p', 'warn', `joiner event catch-up failed: ${toErrorMessage(error, 'joiner event catch-up failed')}`)
        })
        .finally(() => {
          joinerCatchUpInFlight.delete(workspaceId)
        })

      joinerCatchUpInFlight.set(workspaceId, promise)
    }, JOINER_CATCH_UP_DEBOUNCE_MS),
  )
}

export async function awaitJoinerEventCatchUp(
  workspaceId: string,
  options?: { force?: boolean },
): Promise<void> {
  assertRegisteredForP2p()
  const workspace = getWorkspaceRepo().findById(workspaceId)
  if (!workspace) return

  const device = getP2pDeviceInfo()
  if (workspace.ownerDeviceId === device.deviceId) return

  const existing = joinerCatchUpInFlight.get(workspaceId)
  if (existing) {
    await existing
    if (!options?.force) return
  } else {
    const pending = joinerCatchUpScheduled.get(workspaceId)
    if (pending) {
      clearTimeout(pending)
      joinerCatchUpScheduled.delete(workspaceId)
    }
  }

  const promise = runJoinerEventCatchUp(workspaceId, workspace.ownerDeviceId)
    .catch((error) => {
      logStructured('p2p', 'warn', `joiner event catch-up failed: ${toErrorMessage(error, 'joiner event catch-up failed')}`)
    })
    .finally(() => {
      joinerCatchUpInFlight.delete(workspaceId)
    })

  joinerCatchUpInFlight.set(workspaceId, promise)
  await promise
}
