import type { WorkspaceEvent } from '@toolman/shared'

export function readNoteUpdatedContent(event: WorkspaceEvent): string | null {
  const content = event.payload.content
  return typeof content === 'string' ? content : null
}

export function readNoteUpdatedNoteId(event: WorkspaceEvent): string | null {
  const noteId = event.payload.note_id
  if (typeof noteId === 'string') return noteId
  return event.resourceId
}
