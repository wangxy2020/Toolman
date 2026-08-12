/**
 * Apply inbound Sync changes from mobile onto desktop local stores.
 */
import type { SyncChange } from '@toolman/shared'
import { upsertNoteItem } from './notes-data/storage'
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
  for (const change of changes) {
    if (change.entityKind !== 'note') continue
    if (change.op === 'delete') continue
    upsertNoteItem(toNoteItem(change), { skipSyncPublish: true })
  }
}
