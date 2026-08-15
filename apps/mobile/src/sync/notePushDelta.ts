import type { SyncChange } from '@toolman/shared'
import type { MobileNote, NoteTombstone } from '../storage/notes'
import type { MobileSyncState } from './syncState'

export function selectDirtyNoteChanges(
  notes: MobileNote[],
  deletedNotes: NoteTombstone[],
  state: Pick<MobileSyncState, 'noteStamps' | 'deletedStamps'>,
): SyncChange[] {
  const changes: SyncChange[] = []
  for (const note of notes) {
    if (state.noteStamps[note.id] === note.updatedAt) continue
    changes.push({
      entityKind: 'note',
      entityId: note.id,
      op: 'upsert',
      updatedAt: note.updatedAt,
      payload: { title: note.title, body: note.body, notebookId: note.notebookId },
    })
  }
  for (const item of deletedNotes) {
    if (state.deletedStamps[item.id] === item.deletedAt) continue
    changes.push({
      entityKind: 'note',
      entityId: item.id,
      op: 'delete',
      updatedAt: item.deletedAt,
      payload: {},
    })
  }
  return changes
}

export function applyNotePushStamps(
  state: MobileSyncState,
  notes: MobileNote[],
  deletedNotes: NoteTombstone[],
  pushed: SyncChange[],
): MobileSyncState {
  if (pushed.length === 0) return state
  const noteStamps = { ...state.noteStamps }
  const deletedStamps = { ...state.deletedStamps }
  const live = new Set(notes.map((note) => note.id))
  for (const change of pushed) {
    if (change.op === 'delete') {
      deletedStamps[change.entityId] = change.updatedAt
      delete noteStamps[change.entityId]
    } else {
      noteStamps[change.entityId] = change.updatedAt
      delete deletedStamps[change.entityId]
    }
  }
  for (const id of Object.keys(noteStamps)) {
    if (!live.has(id)) delete noteStamps[id]
  }
  return { ...state, noteStamps, deletedStamps }
}
