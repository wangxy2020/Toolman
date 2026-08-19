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

async function tryCreateHubClient(client?: ToolmanSyncClient): Promise<ToolmanSyncClient | null> {
  if (client) return client
  try {
    return await createReachableMobileSyncClient()
  } catch (error) {
    if (isForeignSyncHubError(error)) throw error
    return null
  }
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

  if (await pushViaPersonalMailbox(changes)) {
    const next = applyNotePushStamps(syncState, notes, deletedNotes, changes)
    await saveMobileSyncState(next)
    return next
  }

  if (!client) {
    throw new Error(
      '无法连接 Sync Hub，且个人投递失败。请完成设备配对；localhost/真机局域网可直连桌面，托管网页需 HTTPS 桌面地址或点到点 WebRTC（不依赖官方 Hub）。',
    )
  }
  throw new Error(
    '同步未授权。请填写局域网配对令牌，或依赖已配对的点到点 / 投递（桌面 Sync Hub 需对端可达）。',
  )
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

  if (await pushViaPersonalMailbox(changes)) {
    const next = applyClassroomPushStamps(syncState, courses, changes)
    await saveMobileSyncState(next)
    return next
  }

  if (!client) {
    throw new Error(
      '无法连接 Sync Hub，且个人投递失败。请完成设备配对；localhost/真机局域网可直连桌面，托管网页需 HTTPS 桌面地址或点到点 WebRTC（不依赖官方 Hub）。',
    )
  }
  throw new Error(
    '同步未授权。请填写局域网配对令牌，或依赖已配对的点到点 / 投递（桌面 Sync Hub 需对端可达）。',
  )
}
