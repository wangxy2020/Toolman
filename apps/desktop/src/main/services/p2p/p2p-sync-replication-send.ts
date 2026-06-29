import {
  getWorkspaceLatestSeq,
  listWorkspaceEventsSince,
  markP2pEventSynced,
} from './p2p-event.service'
import { getP2pDeviceInfo } from './p2p-device-identity.service'
import { sendEventsBatchChunked, sendReplicationMessageOnEventsChannel } from './p2p-events-channel'
import {
  createWorkspaceSnapshot,
  getLatestWorkspaceSnapshot,
  shouldUseSnapshotSync,
  toSnapshotWire,
} from './p2p-snapshot.service'
import { encodeReplicationMessage, workspaceEventToWire, type SnapshotWire } from './p2p-sync-protocol'
import {
  cursorLastReceived,
  cursorLastSent,
  getCursorRepo,
  getPeerCursor,
} from './p2p-sync-state'

export async function sendReplicationMessage(
  peerDeviceId: string,
  message: Parameters<typeof encodeReplicationMessage>[0],
): Promise<void> {
  await sendReplicationMessageOnEventsChannel(peerDeviceId, message)
}

export async function sendEventsBatch(
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

export async function sendSnapshotToPeer(
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

export async function requestCatchUpFromPeer(
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

export async function pushMissingEventsToPeer(
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

export async function sendSyncHello(peerDeviceId: string, workspaceId: string): Promise<void> {
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

export async function requestMissingEventsFromPeer(
  workspaceId: string,
  peerDeviceId: string,
): Promise<void> {
  const sinceSeq = getWorkspaceLatestSeq(workspaceId)
  await sendReplicationMessage(peerDeviceId, {
    type: 'events.request',
    workspaceId,
    sinceSeq,
  })
}

export { cursorLastSent }
