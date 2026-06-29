import { applyRemoteP2pEvent, appendP2pEventLocally, getWorkspaceLatestSeq } from './p2p-event.service'
import { getP2pDeviceInfo } from './p2p-device-identity.service'
import { handleP2pGroupChatChannelMessage } from './p2p-group-chat.service'
import { reconcileWorkspaceMemberMesh } from './p2p-member-mesh.service'
import { applyWorkspaceSnapshotWire } from './p2p-snapshot.service'
import {
  assertPeerTrustedForSync,
  isPeerTrusted,
  promptPeerTrustIfNeeded,
} from './p2p-peer.service'
import { broadcastP2pSyncCompleted } from './p2p-sync-broadcast'
import {
  handleRemoteEventProposal,
  handleRemoteEventProposalRejected,
  handleRemoteEventProposed,
} from './p2p-event-proposal.service'
import { dispatchP2pAgentRelayMessage } from './p2p-sync-lifecycle'
import { parseReplicationMessage, wireToRemoteInput } from './p2p-sync-protocol'
import { isLocalWorkspaceOwner } from './p2p-sync-sequencing'
import {
  handleEventsBatchReplication,
  handleEventsRequest,
} from './p2p-sync-replication-events'
import { handleMemberReplicationMessage } from './p2p-sync-replication-member'
import {
  pushMissingEventsToPeer,
  requestCatchUpFromPeer,
  sendEventsBatch,
  sendReplicationMessage,
  sendSnapshotToPeer,
} from './p2p-sync-replication-send'
import {
  cursorLastReceived,
  cursorLastSent,
  getCursorRepo,
  getPeerCursor,
} from './p2p-sync-state'

type ReplicationMessage = NonNullable<ReturnType<typeof parseReplicationMessage>>
type SyncHelloMessage = Extract<ReplicationMessage, { type: 'sync.hello' }>
type SyncHelloAckMessage = Extract<ReplicationMessage, { type: 'sync.hello_ack' }>
type SnapshotResponseMessage = Extract<ReplicationMessage, { type: 'snapshot.response' }>

async function handleSyncHello(peerDeviceId: string, message: SyncHelloMessage): Promise<void> {
  if (!isPeerTrusted(message.workspaceId, peerDeviceId)) {
    promptPeerTrustIfNeeded(message.workspaceId, peerDeviceId, { connected: true })
    return
  }

  const device = getP2pDeviceInfo()
  const latestSeq = getWorkspaceLatestSeq(message.workspaceId)
  const cursor = getPeerCursor(message.workspaceId, peerDeviceId)

  await sendReplicationMessage(peerDeviceId, {
    type: 'sync.hello_ack',
    workspaceId: message.workspaceId,
    deviceId: device.deviceId,
    lastReceivedSeq: cursorLastReceived(cursor),
    latestSeq,
  })

  await pushMissingEventsToPeer(
    peerDeviceId,
    message.workspaceId,
    message.lastReceivedSeq,
    latestSeq,
  )
  await requestCatchUpFromPeer(
    peerDeviceId,
    message.workspaceId,
    cursorLastReceived(cursor),
    message.latestSeq,
  )
}

async function handleSyncHelloAck(peerDeviceId: string, message: SyncHelloAckMessage): Promise<void> {
  assertPeerTrustedForSync(message.workspaceId, peerDeviceId)

  const cursor = getPeerCursor(message.workspaceId, peerDeviceId)
  const latestSeq = getWorkspaceLatestSeq(message.workspaceId)

  if (cursorLastSent(cursor) < latestSeq) {
    await sendEventsBatch(peerDeviceId, message.workspaceId, cursorLastSent(cursor))
  }

  await requestCatchUpFromPeer(
    peerDeviceId,
    message.workspaceId,
    cursorLastReceived(cursor),
    message.latestSeq,
  )
}

async function handleSnapshotRequest(
  peerDeviceId: string,
  message: Extract<ReplicationMessage, { type: 'snapshot.request' }>,
): Promise<void> {
  assertPeerTrustedForSync(message.workspaceId, peerDeviceId)
  await sendSnapshotToPeer(peerDeviceId, message.workspaceId)
}

async function handleSnapshotResponse(
  peerDeviceId: string,
  message: SnapshotResponseMessage,
): Promise<boolean> {
  assertPeerTrustedForSync(message.workspaceId, peerDeviceId)
  if (!message.snapshot) return false

  const state = applyWorkspaceSnapshotWire(message.workspaceId, message.snapshot)
  getCursorRepo().updateReceivedSeq(message.workspaceId, peerDeviceId, state.snapshotSeq)

  const localLatestSeq = getWorkspaceLatestSeq(message.workspaceId)
  const sinceSeq = localLatestSeq === 0 ? 0 : state.snapshotSeq

  await sendReplicationMessage(peerDeviceId, {
    type: 'events.request',
    workspaceId: message.workspaceId,
    sinceSeq,
  })

  void reconcileWorkspaceMemberMesh(message.workspaceId)
  return true
}

export async function handleReplicationMessage(peerDeviceId: string, payload: Buffer): Promise<void> {
  const message = parseReplicationMessage(payload)
  if (!message) return

  if (await handleMemberReplicationMessage(peerDeviceId, message)) {
    return
  }

  switch (message.type) {
    case 'sync.hello':
      await handleSyncHello(peerDeviceId, message)
      return
    case 'sync.hello_ack':
      await handleSyncHelloAck(peerDeviceId, message)
      return
    case 'events.request':
      await handleEventsRequest(peerDeviceId, message)
      return
    case 'events.batch':
      await handleEventsBatchReplication(peerDeviceId, message)
      return
    case 'events.propose':
      if (isLocalWorkspaceOwner(message.workspaceId)) {
        await handleRemoteEventProposal(peerDeviceId, message, async (input) =>
          appendP2pEventLocally(input),
        )
      }
      return
    case 'events.proposed': {
      const remoteInput = wireToRemoteInput(message.event)
      if (remoteInput) {
        applyRemoteP2pEvent(remoteInput)
      }
      handleRemoteEventProposed(message)
      return
    }
    case 'events.propose_rejected':
      handleRemoteEventProposalRejected(message)
      return
    case 'snapshot.request':
      await handleSnapshotRequest(peerDeviceId, message)
      return
    case 'snapshot.response': {
      const used = await handleSnapshotResponse(peerDeviceId, message)
      if (!used) return
      broadcastP2pSyncCompleted({
        workspaceId: message.workspaceId,
        eventsApplied: 0,
        filesFetched: 0,
      })
      return
    }
    case 'group-chat.message':
      handleP2pGroupChatChannelMessage(peerDeviceId, payload)
      return
    case 'group-chat.clear':
      handleP2pGroupChatChannelMessage(peerDeviceId, payload)
      return
    case 'agent-relay.message':
      await dispatchP2pAgentRelayMessage(
        peerDeviceId,
        Buffer.from(JSON.stringify(message.relay)),
      )
      return
    default:
      return
  }
}
