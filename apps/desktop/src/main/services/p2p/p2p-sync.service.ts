import {
  P2pMemberRepository,
  P2pSyncCursorRepository,
  P2pWorkspaceRepository,
} from '@toolman/db'
import type { P2pConnectionInfo, P2pMember, P2pSyncStatus, WorkspaceEvent } from '@toolman/shared'
import {
  orderMeshCatchUpPeers,
  resolveReplicationTopology,
  type MeshPeerSyncCandidate,
} from '@toolman/shared'
import { getDatabase } from '../../bootstrap/database'
import { P2pBridge } from './p2p-bridge'
import {
  applyRemoteP2pEvent,
  appendP2pEventLocally,
  getWorkspaceLatestSeq,
  listWorkspaceEventsSince,
  markP2pEventSynced,
} from './p2p-event.service'
import { getP2pDeviceInfo } from './p2p-device-identity.service'
import { assertRegisteredForP2p } from './p2p-auth.guard'
import { ensurePeerReadyForWorkspace, isPeerConnected, listP2pConnections } from './p2p-connection.service'
import {
  assertPeerTrustedForSync,
  ensureOwnerPeerTrustedForSync,
  isPeerTrusted,
} from './p2p-peer.service'
import {
  broadcastP2pSyncCompleted,
  broadcastP2pSyncError,
  broadcastP2pSyncEventApplied,
  broadcastP2pSyncProgress,
} from './p2p-sync-broadcast'
import {
  handleP2pFileChannelMessage,
  syncMissingWorkspaceBlobs,
} from './p2p-blob-transfer.service'
import { syncMissingSharedKnowledgeDocuments } from './p2p-knowledge-projection'
import { reconcileAgentSharedResources } from './p2p-agent-projection'
import { handleP2pGroupChatChannelMessage, handleP2pGroupChatClearFromPeer } from './p2p-group-chat.service'
import { reconcileGroupChatProjection } from './p2p-group-chat-projector'
import { applyRemoteMemberJoin, ensureMemberConnectsToOwner, handleMemberSyncRequest, handleMemberSyncResponse } from './p2p-member.service'
import { dispatchP2pAgentRelayMessage, registerP2pSyncHandlers } from './p2p-sync-lifecycle'
import { maybeAutoSnapshot } from './p2p-snapshot.service'
import { reconcileWorkspaceMemberMesh } from './p2p-member-mesh.service'
import {
  describeReplicationMessage,
  sendEventsBatchChunked,
  sendReplicationMessageOnEventsChannel,
} from './p2p-events-channel'
import {
  encodeReplicationMessage,
  parseReplicationMessage,
  wireToRemoteInput,
  workspaceEventToWire,
  type SnapshotWire,
} from './p2p-sync-protocol'
import {
  applyWorkspaceSnapshotWire,
  createWorkspaceSnapshot,
  getLatestWorkspaceSnapshot,
  shouldUseSnapshotSync,
  toSnapshotWire,
} from './p2p-snapshot.service'
import {
  getWorkspaceOwnerDeviceId,
  getWorkspaceSequencingMode,
  isLocalWorkspaceOwner,
  isOwnerPeerConnected,
  isSeqConflictError,
  MAX_SEQ_CONFLICT_RETRIES,
  rehydrateLamportClocksFromDatabase,
} from './p2p-sync-sequencing'
import {
  handleRemoteEventProposal,
  handleRemoteEventProposalRejected,
  handleRemoteEventProposed,
} from './p2p-event-proposal.service'

interface WorkspaceSyncState {
  status: P2pSyncStatus
  error?: string
  lastSyncAt?: number
}

type ReplicationMessage = NonNullable<ReturnType<typeof parseReplicationMessage>>
type SyncHelloMessage = Extract<ReplicationMessage, { type: 'sync.hello' }>
type SyncHelloAckMessage = Extract<ReplicationMessage, { type: 'sync.hello_ack' }>
type EventsBatchMessage = Extract<ReplicationMessage, { type: 'events.batch' }>
type SnapshotResponseMessage = Extract<ReplicationMessage, { type: 'snapshot.response' }>

const workspaceStates = new Map<string, WorkspaceSyncState>()
const syncingWorkspaces = new Set<string>()
const reconnectRecoveryInFlight = new Set<string>()
const reconnectRecoveryLastRunAt = new Map<string, number>()
const RECONNECT_RECOVERY_COOLDOWN_MS = 30_000

const joinerCatchUpInFlight = new Map<string, Promise<void>>()
const joinerCatchUpScheduled = new Map<string, ReturnType<typeof setTimeout>>()
const JOINER_CATCH_UP_DEBOUNCE_MS = 1500

const connectionSnapshot: P2pConnectionInfo[] = []

function getCursorRepo(): P2pSyncCursorRepository {
  return new P2pSyncCursorRepository(getDatabase())
}

function getMemberRepo(): P2pMemberRepository {
  return new P2pMemberRepository(getDatabase())
}

function getWorkspaceRepo(): P2pWorkspaceRepository {
  return new P2pWorkspaceRepository(getDatabase())
}

function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

function getPeerCursor(workspaceId: string, peerDeviceId: string) {
  return getCursorRepo().findByWorkspaceAndPeer(workspaceId, peerDeviceId)
}

function cursorLastReceived(cursor: ReturnType<typeof getPeerCursor>): number {
  return cursor?.lastReceivedSeq ?? 0
}

function cursorLastSent(cursor: ReturnType<typeof getPeerCursor>): number {
  return cursor?.lastSentSeq ?? 0
}

function getWorkspaceState(workspaceId: string): WorkspaceSyncState {
  return workspaceStates.get(workspaceId) ?? { status: 'idle' }
}

function setWorkspaceState(workspaceId: string, patch: Partial<WorkspaceSyncState>): void {
  workspaceStates.set(workspaceId, { ...getWorkspaceState(workspaceId), ...patch })
}

function listWorkspacePeerDeviceIds(workspaceId: string): string[] {
  const device = getP2pDeviceInfo()
  return getMemberRepo()
    .listByWorkspace(workspaceId)
    .filter((member) => member.status === 'active' && member.deviceId !== device.deviceId)
    .map((member) => member.deviceId)
}

function listSyncTargetPeerIds(workspaceId: string, peerDeviceId?: string): string[] {
  const device = getP2pDeviceInfo()
  const targets = peerDeviceId ? [peerDeviceId] : listWorkspacePeerDeviceIds(workspaceId)
  return targets.filter((id) => id !== device.deviceId)
}

function knownConnectionsSnapshot(): P2pConnectionInfo[] {
  return [...connectionSnapshot]
}

function findConnectedPeer(
  connections: P2pConnectionInfo[],
  peerDeviceId: string,
): P2pConnectionInfo | undefined {
  return connections.find((item) => item.peerDeviceId === peerDeviceId && item.state === 'connected')
}

async function sendReplicationMessage(
  peerDeviceId: string,
  message: Parameters<typeof encodeReplicationMessage>[0],
): Promise<void> {
  await sendReplicationMessageOnEventsChannel(peerDeviceId, message)
}

async function sendEventsBatch(
  peerDeviceId: string,
  workspaceId: string,
  sinceSeq: number,
): Promise<number> {
  const BATCH_LIMIT = 200
  let totalSent = 0
  let cursor = sinceSeq

  while (true) {
    const events = listWorkspaceEventsSince(workspaceId, cursor, BATCH_LIMIT)
    if (events.length === 0) break

    const wireEvents = events.map(workspaceEventToWire)
    await sendEventsBatchChunked(peerDeviceId, workspaceId, wireEvents)

    const lastSeq = events.at(-1)?.seq ?? cursor
    getCursorRepo().updateSentSeq(workspaceId, peerDeviceId, lastSeq)
    for (const event of events) {
      markP2pEventSynced(event.eventId)
    }

    totalSent += events.length
    cursor = lastSeq
    if (events.length < BATCH_LIMIT) break
  }

  return totalSent
}

async function requestCatchUpFromPeer(
  peerDeviceId: string,
  workspaceId: string,
  localLastReceivedSeq: number,
  remoteLatestSeq: number,
): Promise<void> {
  if (localLastReceivedSeq >= remoteLatestSeq) return

  if (shouldUseSnapshotSync(localLastReceivedSeq, remoteLatestSeq)) {
    await sendReplicationMessage(peerDeviceId, { type: 'snapshot.request', workspaceId })
    return
  }

  await sendReplicationMessage(peerDeviceId, {
    type: 'events.request',
    workspaceId,
    sinceSeq: localLastReceivedSeq,
  })
}

async function pushMissingEventsToPeer(
  peerDeviceId: string,
  workspaceId: string,
  peerLastReceivedSeq: number,
  localLatestSeq: number,
): Promise<void> {
  if (peerLastReceivedSeq >= localLatestSeq) return

  if (shouldUseSnapshotSync(peerLastReceivedSeq, localLatestSeq)) {
    await sendSnapshotToPeer(peerDeviceId, workspaceId)
    const snapshot = getLatestWorkspaceSnapshot(workspaceId)
    const sinceSeq = snapshot?.snapshotSeq ?? peerLastReceivedSeq
    await sendEventsBatch(peerDeviceId, workspaceId, sinceSeq)
    return
  }

  await sendEventsBatch(peerDeviceId, workspaceId, peerLastReceivedSeq)
}

async function sendSyncHello(peerDeviceId: string, workspaceId: string): Promise<void> {
  const device = getP2pDeviceInfo()
  const cursor = getPeerCursor(workspaceId, peerDeviceId)
  await sendReplicationMessage(peerDeviceId, {
    type: 'sync.hello',
    workspaceId,
    deviceId: device.deviceId,
    lastReceivedSeq: cursorLastReceived(cursor),
    latestSeq: getWorkspaceLatestSeq(workspaceId),
  })
}

async function handleSyncHello(peerDeviceId: string, message: SyncHelloMessage): Promise<void> {
  assertPeerTrustedForSync(message.workspaceId, peerDeviceId)

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

async function sendSnapshotToPeer(
  peerDeviceId: string,
  workspaceId: string,
): Promise<SnapshotWire | null> {
  let snapshot = getLatestWorkspaceSnapshot(workspaceId)
  const latestSeq = getWorkspaceLatestSeq(workspaceId)
  if (!snapshot && latestSeq > 0) {
    snapshot = createWorkspaceSnapshot(workspaceId)
  }
  const wire = snapshot ? toSnapshotWire(snapshot) : null
  await sendReplicationMessage(peerDeviceId, {
    type: 'snapshot.response',
    workspaceId,
    snapshot: wire,
  })
  return wire
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

async function handleEventsRequest(
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
      const event = applyRemoteP2pEvent(wireToRemoteInput(wire))
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

async function handleEventsBatchReplication(
  peerDeviceId: string,
  message: EventsBatchMessage,
): Promise<void> {
  const applied = await handleEventsBatch(peerDeviceId, message)
  setWorkspaceState(message.workspaceId, {
    status: 'idle',
    lastSyncAt: Date.now(),
    error: undefined,
  })

  if (applied <= 0) return

  reconcileGroupChatAfterSync(message.workspaceId)
  broadcastP2pSyncCompleted({
    workspaceId: message.workspaceId,
    eventsApplied: applied,
    filesFetched: 0,
  })
}

function reconcileGroupChatAfterSync(workspaceId: string): void {
  try {
    reconcileGroupChatProjection(workspaceId)
  } catch (error) {
    console.warn(`[p2p] group chat projection reconcile failed: ${toErrorMessage(error, String(error))}`)
  }
}

function reportSyncConflict(workspaceId: string, message: string, attempt: number): void {
  const detail =
    attempt < MAX_SEQ_CONFLICT_RETRIES
      ? `${message}（正在自动重试 ${attempt}/${MAX_SEQ_CONFLICT_RETRIES}）`
      : message
  setWorkspaceState(workspaceId, { status: 'error', error: detail })
  broadcastP2pSyncError({
    workspaceId,
    code: 'P2P_SYNC_CONFLICT',
    message: detail,
  })
}

async function handleReplicationMessage(peerDeviceId: string, payload: Buffer): Promise<void> {
  const message = parseReplicationMessage(payload)
  if (!message) return

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
    case 'events.proposed':
      applyRemoteP2pEvent(wireToRemoteInput(message.event))
      handleRemoteEventProposed(message)
      return
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
    case 'member.joined':
      void applyRemoteMemberJoin(
        {
          workspaceId: message.workspaceId,
          member: {
            id: message.member.id,
            workspaceId: message.workspaceId,
            identityId: message.member.identityId ?? '',
            deviceId: message.member.deviceId,
            displayName: message.member.displayName,
            role: message.member.role as P2pMember['role'],
            status: 'active',
            online: false,
          },
          inviteId: message.inviteId,
          peerDeviceId,
          subscriptionSku: message.member.subscriptionSku,
        },
        { requirePeerTrust: false },
      )
      return
    case 'group-chat.message':
      handleP2pGroupChatChannelMessage(peerDeviceId, payload)
      return
    case 'group-chat.clear':
      handleP2pGroupChatClearFromPeer(peerDeviceId, message.workspaceId)
      return
    case 'agent-relay.message':
      await dispatchP2pAgentRelayMessage(
        peerDeviceId,
        Buffer.from(JSON.stringify(message.relay)),
      )
      return
    case 'member.sync_request':
      await handleMemberSyncRequest(peerDeviceId, message.workspaceId)
      return
    case 'member.sync_response':
      handleMemberSyncResponse(peerDeviceId, message)
      return
    default:
      return
  }
}

async function runIncomingChannelHandler(
  label: string,
  handler: () => void | Promise<void>,
): Promise<void> {
  try {
    await handler()
  } catch (error) {
    console.error(`[p2p] ${label} failed: ${toErrorMessage(error, `Failed to process ${label}`)}`)
  }
}

export async function processP2pIncomingMessages(): Promise<void> {
  const messages = await P2pBridge.connectionDrainAllMessages()

  for (const item of messages) {
    if (item.channel === 'files') {
      await runIncomingChannelHandler('file channel message', () =>
        handleP2pFileChannelMessage(item.peerDeviceId, item.data),
      )
      continue
    }

    if (item.channel === 'agent-relay') {
      await runIncomingChannelHandler('agent relay message', () =>
        dispatchP2pAgentRelayMessage(item.peerDeviceId, item.data),
      )
      continue
    }

    if (item.channel === 'group-chat') {
      await runIncomingChannelHandler('group chat message', () =>
        handleP2pGroupChatChannelMessage(item.peerDeviceId, item.data),
      )
      continue
    }

    if (item.channel !== 'events') continue

    try {
      await handleReplicationMessage(item.peerDeviceId, item.data)
    } catch (error) {
      const parsed = parseReplicationMessage(item.data)
      const label = parsed ? describeReplicationMessage(parsed) : 'unknown'
      console.error(
        `[p2p] replication message failed: ${label} error=${toErrorMessage(error, 'Failed to process replication message')}`,
      )
    }
  }
}

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

async function catchUpFromMeshPeers(workspaceId: string): Promise<number> {
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
      console.warn(
        `[p2p] mesh catch-up with ${peerDeviceId} failed: ${toErrorMessage(error, 'mesh catch-up failed')}`,
      )
    }
  }

  return syncedPeers
}

async function runJoinerEventCatchUp(workspaceId: string, ownerDeviceId: string): Promise<void> {
  const connections = await listP2pConnections()
  const ownerOnline = isOwnerPeerConnected(workspaceId, connections)

  if (ownerOnline) {
    ensureOwnerPeerTrustedForSync(workspaceId, ownerDeviceId)
    await (isPeerConnected(ownerDeviceId)
      ? ensurePeerReadyForWorkspace(ownerDeviceId, workspaceId)
      : ensureMemberConnectsToOwner(workspaceId))
    await syncWithPeer(workspaceId, ownerDeviceId)
  } else {
    const syncedPeers = await catchUpFromMeshPeers(workspaceId)
    if (syncedPeers === 0) {
      console.warn(`[p2p] owner offline and no mesh peers available for ${workspaceId}`)
    }
  }

  await syncMissingWorkspaceBlobs(workspaceId)
  reconcileAgentSharedResources(workspaceId)
  await syncMissingSharedKnowledgeDocuments(workspaceId)
  await reconcileWorkspaceMemberMesh(workspaceId)
  reconcileGroupChatAfterSync(workspaceId)
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
          console.warn(
            `[p2p] joiner event catch-up failed: ${toErrorMessage(error, 'joiner event catch-up failed')}`,
          )
        })
        .finally(() => {
          joinerCatchUpInFlight.delete(workspaceId)
        })

      joinerCatchUpInFlight.set(workspaceId, promise)
    }, JOINER_CATCH_UP_DEBOUNCE_MS),
  )
}

export async function awaitJoinerEventCatchUp(workspaceId: string): Promise<void> {
  scheduleJoinerEventCatchUp(workspaceId)
  const inFlight = joinerCatchUpInFlight.get(workspaceId)
  if (inFlight) await inFlight
}

export function onLocalP2pEventAppended(event: WorkspaceEvent): void {
  void replicateLocalP2pEvent(event)
}

export async function replicateLocalP2pEvent(event: WorkspaceEvent): Promise<void> {
  const device = getP2pDeviceInfo()
  const ownerDeviceId = getWorkspaceOwnerDeviceId(event.workspaceId)
  const memberDeviceIds = new Set(
    new P2pMemberRepository(getDatabase())
      .listByWorkspace(event.workspaceId, 'active')
      .map((item) => item.deviceId),
  )
  const connections = await listP2pConnections()

  const isJoinerOwnEvent =
    Boolean(ownerDeviceId) &&
    event.sourceDeviceId === device.deviceId &&
    !isLocalWorkspaceOwner(event.workspaceId)

  const peers = connections.filter(
    (item) =>
      item.state === 'connected' &&
      item.peerDeviceId !== device.deviceId &&
      memberDeviceIds.has(item.peerDeviceId) &&
      !(isJoinerOwnEvent && item.peerDeviceId === ownerDeviceId),
  )

  if (peers.length === 0) return

  const wireEvent = workspaceEventToWire(event)
  await Promise.all(
    peers.map(async (peer) => {
      if (!isPeerTrusted(event.workspaceId, peer.peerDeviceId)) return
      try {
        await ensurePeerReadyForWorkspace(peer.peerDeviceId, event.workspaceId)
        await sendEventsBatchChunked(peer.peerDeviceId, event.workspaceId, [wireEvent])
        getCursorRepo().updateSentSeq(event.workspaceId, peer.peerDeviceId, event.seq)
        markP2pEventSynced(event.eventId)
      } catch (error) {
        console.warn(
          `[p2p] replicate to ${peer.peerDeviceId} failed: ${toErrorMessage(error, 'Failed to replicate event')}`,
        )
      }
    }),
  )
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
    console.warn(
      `[p2p] reconnect catch-up failed for ${workspaceId}: ${toErrorMessage(error, '重连后同步失败')}`,
    )
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

function mapPeerStatus(
  workspaceId: string,
  connection: P2pConnectionInfo | undefined,
  peerDeviceId: string,
) {
  const cursor = getPeerCursor(workspaceId, peerDeviceId)
  const latestSeq = getWorkspaceLatestSeq(workspaceId)
  const lastReceivedSeq = cursorLastReceived(cursor)
  return {
    deviceId: peerDeviceId,
    state: connection?.state ?? 'idle',
    lastSentSeq: cursorLastSent(cursor),
    lastReceivedSeq,
    pendingEvents: Math.max(0, latestSeq - lastReceivedSeq),
  }
}

export async function startP2pSync(workspaceId: string): Promise<{
  status: 'syncing' | 'idle'
  peersTotal: number
  peersConnected: number
}> {
  assertRegisteredForP2p()
  const workspace = getWorkspaceRepo().findById(workspaceId)
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
      const errMessage = toErrorMessage(error, 'Sync failed')
      setWorkspaceState(workspaceId, { status: 'error', error: errMessage })
      broadcastP2pSyncError({ workspaceId, code: 'P2P_SYNC_FAILED', message: errMessage })
    }
  }

  setWorkspaceState(workspaceId, { status: 'idle', lastSyncAt: Date.now() })
  syncingWorkspaces.delete(workspaceId)

  return {
    status: 'syncing',
    peersTotal: peerDeviceIds.length,
    peersConnected,
  }
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
  const connections = knownConnectionsSnapshot()
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
    pendingFiles: 0,
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
    console.warn(
      `[p2p] snapshot connect to owner failed: ${toErrorMessage(error, 'connect owner failed')}`,
    )
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
