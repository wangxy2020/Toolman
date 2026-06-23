import type { WorkspaceEvent } from '@toolman/shared'

export function readNoteUpdatedPermission(
  event: WorkspaceEvent,
): 'read' | 'write' | 'admin' | null {
  const permission = event.payload.permission
  if (permission === 'read' || permission === 'write' || permission === 'admin') {
    return permission
  }
  return null
}

export function readNoteUpdatedContent(event: WorkspaceEvent): string | null {
  const content = event.payload.content
  return typeof content === 'string' ? content : null
}

export function readNoteUpdatedNoteId(event: WorkspaceEvent): string | null {
  const noteId = event.payload.note_id
  if (typeof noteId === 'string') return noteId
  return event.resourceId
}
