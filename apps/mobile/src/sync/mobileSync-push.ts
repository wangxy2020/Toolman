import type { ToolmanSyncClient } from '@toolman/sync-client'
import { getOrCreateDeviceId } from '../storage/secure'
import type { MobileNote, NoteTombstone } from '../storage/notes'
import { loadMobileSyncState, saveMobileSyncState, type MobileSyncState } from './syncState'
import { applyNotePushStamps, selectDirtyNoteChanges } from './notePushDelta'
import {
  applyClassroomPushStamps,
  selectDirtyClassroomChanges,
} from './classroomPushDelta'
import type { MobileClassroomCourse } from './classroomSyncMerge'
import {
  createReachableMobileSyncClient,
  isForeignSyncHubError,
} from './mobileSync-client'

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
  let client
  try {
    client = extras?.client ?? (await createReachableMobileSyncClient())
  } catch (error) {
    if (isForeignSyncHubError(error)) return syncState
    throw error
  }
  const deviceId = await getOrCreateDeviceId()
  const deletedNotes = extras?.deletedNotes ?? []
  const changes = selectDirtyNoteChanges(notes, deletedNotes, syncState)
  if (changes.length === 0) return syncState
  await client.push({ deviceId, cursor, changes })
  const next = applyNotePushStamps(syncState, notes, deletedNotes, changes)
  await saveMobileSyncState(next)
  return next
}

export async function pushClassroomChanges(
  courses: MobileClassroomCourse[],
  cursor: string | null,
  extras?: { client?: ToolmanSyncClient; syncState?: MobileSyncState },
): Promise<MobileSyncState> {
  const syncState = extras?.syncState ?? (await loadMobileSyncState())
  let client
  try {
    client = extras?.client ?? (await createReachableMobileSyncClient())
  } catch (error) {
    if (isForeignSyncHubError(error)) return syncState
    throw error
  }
  const deviceId = await getOrCreateDeviceId()
  const changes = selectDirtyClassroomChanges(courses, syncState)
  if (changes.length === 0) return syncState
  await client.push({ deviceId, cursor, changes })
  const next = applyClassroomPushStamps(syncState, courses, changes)
  await saveMobileSyncState(next)
  return next
}
