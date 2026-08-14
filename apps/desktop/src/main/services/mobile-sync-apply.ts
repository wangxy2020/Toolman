/**
 * Apply inbound Sync changes from mobile onto desktop local stores.
 */
import type { SyncChange } from '@toolman/shared'
import { applyClassroomSyncChanges } from './classroom-mobile-sync'
import { deleteNoteItem, getNoteById, upsertNoteItem } from './notes-data/storage'
import { broadcastMobileNotesChanged } from './notes-mobile-sync-broadcast'
import type { NoteItem } from './notes-data/types'

function toNoteItem(change: SyncChange): NoteItem {
  const title =
    typeof change.payload?.title === 'string' && change.payload.title.trim()
      ? change.payload.title
      : '未命名'
  const content = typeof change.payload?.body === 'string' ? change.payload.body : ''
  return {
    id: change.entityId,
    notebookId: 'notebook-default',
    title,
    content,
    editorMode: 'markdown',
    blocks: [],
    tags: [],
    updatedAt: change.updatedAt,
  }
}

export function applyInboundSyncChanges(changes: SyncChange[]): void {
  let changed = false
  for (const change of changes) {
    if (change.entityKind !== 'note') continue
    const existing = getNoteById(change.entityId)
    const existingAt = existing?.updatedAt ?? 0
    if (change.op === 'delete') {
      if (existing && existingAt > change.updatedAt) continue
      deleteNoteItem(change.entityId, { skipSyncPublish: true, deletedAt: change.updatedAt })
      changed = true
      continue
    }
    if (existing && existingAt > change.updatedAt) continue
    upsertNoteItem(toNoteItem(change), { skipSyncPublish: true })
    changed = true
  }
  if (changed) broadcastMobileNotesChanged()
  try {
    applyClassroomSyncChanges(changes)
  } catch {
    // Classroom apply is best-effort; notes already persisted.
  }
}
