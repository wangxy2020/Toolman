import type { ToolmanSyncClient } from '@toolman/sync-client'
import { getOrCreateDeviceId } from '../storage/secure'
import type { MobileNote, NoteTombstone } from '../storage/notes'
import { loadDevicePairing } from '../storage/devicePairing'
import { loadMobileSyncState, saveMobileSyncState, type MobileSyncState } from './syncState'
import { applyNotePushStamps, selectDirtyNoteChanges } from './notePushDelta'
import {
  applyClassroomPushStamps,
  selectDirtyClassroomChanges,
} from './classroomPushDelta'
import type { MobileClassroomCourse } from './classroomSyncMerge'
import { createReachableMobileSyncClient, isForeignSyncHubError } from './mobileSync-client'
import { pushPersonalMailboxChanges } from './personalMailboxSync'
import { tryDeviceSyncWebrtc } from './deviceSyncWebrtc'

async function tryCreateHubClient(client?: ToolmanSyncClient): Promise<ToolmanSyncClient | null> {
  if (client) return client
  try {
    return await createReachableMobileSyncClient()
  } catch (error) {
    if (isForeignSyncHubError(error)) throw error
    return null
  }
}

async function pushViaPersonalWebRtc(changes: import('@toolman/shared').SyncChange[]): Promise<boolean> {
  if (changes.length === 0) return true
  const pairing = await loadDevicePairing()
  if (!pairing?.signalToken) return false
  try {
    const result = await tryDeviceSyncWebrtc(pairing, { outboundChanges: changes, pull: false })
    return result.ok
  } catch {
    return false
  }
}

function personalTransportError(hasClient: boolean, hasSignalTicket: boolean): Error {
  if (!hasSignalTicket) {
    return new Error(
      '无法连接桌面 Sync Hub。跨网同步需要先在能访问桌面的网络上完成一次配对，或重新输入 4 位配对码，以取得点到点信令。',
    )
  }
  if (!hasClient) {
    return new Error(
      '无法连接 Sync Hub，且点到点同步未完成。请确认桌面端在线；两端都需能访问 TURN。知识库正文仍只在局域网同步。',
    )
  }
  return new Error('同步未授权。请填写局域网配对令牌，或在可访问桌面的网络上重新配对后再跨网同步。')
}

async function pushViaPersonalMailbox(changes: import('@toolman/shared').SyncChange[]): Promise<boolean> {
  if (changes.length === 0) return true
  const pairing = await loadDevicePairing()
  if (!pairing?.peerDeviceId) return false
  try {
    return await pushPersonalMailboxChanges({
      pairing,
      recipientDeviceId: pairing.peerDeviceId,
      changes,
    })
  } catch {
    return false
  }
}

export async function pushNoteChanges(
  notes: MobileNote[],
  cursor: string | null,
  extras?: {
    client?: ToolmanSyncClient
    deletedNotes?: NoteTombstone[]
    syncState?: MobileSyncState
  },
): Promise<MobileSyncState> {
  const syncState = extras?.syncState ?? (await loadMobileSyncState())
  const deletedNotes = extras?.deletedNotes ?? []
  const changes = selectDirtyNoteChanges(notes, deletedNotes, syncState)
  if (changes.length === 0) return syncState

  const client = await tryCreateHubClient(extras?.client)
  if (client) {
    try {
      const deviceId = await getOrCreateDeviceId()
      await client.push({ deviceId, cursor, changes })
      const next = applyNotePushStamps(syncState, notes, deletedNotes, changes)
      await saveMobileSyncState(next)
      return next
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!/401|unauthorized|未授权/i.test(message)) throw error
      // Fall through to personal mailbox when LAN token is missing/wrong.
    }
  }

  if (await pushViaPersonalMailbox(changes) || (await pushViaPersonalWebRtc(changes))) {
    const next = applyNotePushStamps(syncState, notes, deletedNotes, changes)
    await saveMobileSyncState(next)
    return next
  }

  const pairing = await loadDevicePairing()
  throw personalTransportError(Boolean(client), Boolean(pairing?.signalToken))
}

export async function pushClassroomChanges(
  courses: MobileClassroomCourse[],
  cursor: string | null,
  extras?: { client?: ToolmanSyncClient; syncState?: MobileSyncState },
): Promise<MobileSyncState> {
  const syncState = extras?.syncState ?? (await loadMobileSyncState())
  const changes = selectDirtyClassroomChanges(courses, syncState)
  if (changes.length === 0) return syncState

  const client = await tryCreateHubClient(extras?.client)
  if (client) {
    try {
      const deviceId = await getOrCreateDeviceId()
      await client.push({ deviceId, cursor, changes })
      const next = applyClassroomPushStamps(syncState, courses, changes)
      await saveMobileSyncState(next)
      return next
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (!/401|unauthorized|未授权/i.test(message)) throw error
    }
  }

  if (await pushViaPersonalMailbox(changes) || (await pushViaPersonalWebRtc(changes))) {
    const next = applyClassroomPushStamps(syncState, courses, changes)
    await saveMobileSyncState(next)
    return next
  }

  const pairing = await loadDevicePairing()
  throw personalTransportError(Boolean(client), Boolean(pairing?.signalToken))
}
