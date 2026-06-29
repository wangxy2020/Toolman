import { toErrorMessage } from '@toolman/shared'
import { applyRemoteP2pEvent } from './p2p-event.service'
import { assertPeerTrustedForSync } from './p2p-peer.service'
import {
  broadcastP2pSyncCompleted,
  broadcastP2pSyncEventApplied,
} from './p2p-sync-broadcast'
import { parseReplicationMessage, wireToRemoteInput } from './p2p-sync-protocol'
import { isSeqConflictError, MAX_SEQ_CONFLICT_RETRIES } from './p2p-sync-sequencing'
import { forceP2pSync } from './p2p-sync-peer'
import { sendEventsBatch, sendReplicationMessage } from './p2p-sync-replication-send'
import {
  cursorLastReceived,
  getCursorRepo,
  getPeerCursor,
  reconcileGroupChatAfterSync,
  reconcileSharedResourcesAfterSync,
  reportSyncConflict,
  setWorkspaceState,
} from './p2p-sync-state'

type ReplicationMessage = NonNullable<ReturnType<typeof parseReplicationMessage>>
type EventsBatchMessage = Extract<ReplicationMessage, { type: 'events.batch' }>

export async function handleEventsRequest(
  peerDeviceId: string,
  message: Extract<ReplicationMessage, { type: 'events.request' }>,
): Promise<void> {
  assertPeerTrustedForSync(message.workspaceId, peerDeviceId)
  await sendEventsBatch(peerDeviceId, message.workspaceId, message.sinceSeq)
}

async function handleSeqGapDuringBatch(
  peerDeviceId: string,
  message: EventsBatchMessage,
): Promise<void> {
  const cursor = getPeerCursor(message.workspaceId, peerDeviceId)
  await sendReplicationMessage(peerDeviceId, {
    type: 'events.request',
    workspaceId: message.workspaceId,
    sinceSeq: cursorLastReceived(cursor),
  })
}

async function handleEventsBatch(
  peerDeviceId: string,
  message: EventsBatchMessage,
): Promise<number> {
  assertPeerTrustedForSync(message.workspaceId, peerDeviceId)

  let applied = 0
  let conflictRetries = 0
  const sorted = [...message.events].sort((a, b) => a.seq - b.seq)

  for (const wire of sorted) {
    try {
      const remoteInput = wireToRemoteInput(wire)
      if (!remoteInput) continue
      const event = applyRemoteP2pEvent(remoteInput)
      getCursorRepo().updateReceivedSeq(message.workspaceId, peerDeviceId, wire.seq)
      if (!event) continue

      applied += 1
      broadcastP2pSyncEventApplied(event)
    } catch (error) {
      const errMessage = toErrorMessage(error, 'Failed to apply remote event')

      if (errMessage.includes('序号不连续')) {
        await handleSeqGapDuringBatch(peerDeviceId, message)
        break
      }

      if (isSeqConflictError(error) && conflictRetries < MAX_SEQ_CONFLICT_RETRIES) {
        conflictRetries += 1
        reportSyncConflict(message.workspaceId, errMessage, conflictRetries)
        await forceP2pSync(message.workspaceId, peerDeviceId)
        break
      }

      throw error
    }
  }

  return applied
}

export async function handleEventsBatchReplication(
  peerDeviceId: string,
  message: EventsBatchMessage,
): Promise<void> {
  const applied = await handleEventsBatch(peerDeviceId, message)
  setWorkspaceState(message.workspaceId, {
    status: 'idle',
    lastSyncAt: Date.now(),
    error: undefined,
  })

  if (message.events.length > 0) {
    reconcileSharedResourcesAfterSync(message.workspaceId)
  }

  if (applied <= 0) return

  reconcileGroupChatAfterSync(message.workspaceId)
  broadcastP2pSyncCompleted({
    workspaceId: message.workspaceId,
    eventsApplied: applied,
    filesFetched: 0,
  })
}
