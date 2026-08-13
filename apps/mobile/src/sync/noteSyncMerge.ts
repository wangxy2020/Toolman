import type { SyncChange } from '@toolman/shared'

const DEFAULT_NOTEBOOK_ID = 'notebook-default'

export type SyncMobileNote = {
  id: string
  notebookId: string
  title: string
  body: string
  updatedAt: number
}

export type SyncNoteTombstone = {
  id: string
  deletedAt: number
}

export function mergeNotesFromSyncChanges(
  notes: SyncMobileNote[],
  tombstones: SyncNoteTombstone[],
  changes: SyncChange[],
): { notes: SyncMobileNote[]; deletedNotes: SyncNoteTombstone[] } {
  const byId = new Map(notes.map((note) => [note.id, note]))
  const deleted = new Map(tombstones.map((item) => [item.id, item.deletedAt]))
  for (const change of changes) {
    applyNoteChange(byId, deleted, change)
  }
  return {
    notes: Array.from(byId.values()).sort((a, b) => b.updatedAt - a.updatedAt),
    deletedNotes: Array.from(deleted.entries()).map(([id, deletedAt]) => ({ id, deletedAt })),
  }
}

function applyNoteChange(
  byId: Map<string, SyncMobileNote>,
  tombstones: Map<string, number>,
  change: SyncChange,
): void {
  if (change.entityKind !== 'note') return
  if (change.op === 'delete') {
    byId.delete(change.entityId)
    const previous = tombstones.get(change.entityId) ?? 0
    if (change.updatedAt >= previous) tombstones.set(change.entityId, change.updatedAt)
    return
  }
  const tomb = tombstones.get(change.entityId)
  if (tomb != null && tomb >= change.updatedAt) return
  tombstones.delete(change.entityId)
  const existing = byId.get(change.entityId)
  if (existing && existing.updatedAt > change.updatedAt) return
  const title =
    typeof change.payload?.title === 'string' ? change.payload.title : existing?.title ?? '未命名'
  const body =
    typeof change.payload?.body === 'string' ? change.payload.body : existing?.body ?? ''
  const notebookId =
    typeof change.payload?.notebookId === 'string'
      ? change.payload.notebookId
      : existing?.notebookId ?? DEFAULT_NOTEBOOK_ID
  byId.set(change.entityId, {
    id: change.entityId,
    notebookId,
    title,
    body,
    updatedAt: change.updatedAt,
  })
}
