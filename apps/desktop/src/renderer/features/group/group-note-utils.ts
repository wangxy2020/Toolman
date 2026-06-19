import type { P2pSharedResourcePermission } from '@toolman/shared'

export const GROUP_NOTEBOOK_ID_PREFIX = 'group-notebook:'
export const GROUP_KB_NOTE_ID_PREFIX = 'group-kb:'

export function buildGroupNotebookId(workspaceId: string): string {
  return `${GROUP_NOTEBOOK_ID_PREFIX}${workspaceId}`
}

export function buildGroupKnowledgeNoteId(documentId: string): string {
  return `${GROUP_KB_NOTE_ID_PREFIX}${documentId}`
}

export function isGroupKnowledgeNoteId(noteId: string): boolean {
  return noteId.startsWith(GROUP_KB_NOTE_ID_PREFIX)
}

export function isGroupNotebookId(notebookId: string): boolean {
  return notebookId.startsWith(GROUP_NOTEBOOK_ID_PREFIX)
}

export function formatNotePermissionLabel(permission: P2pSharedResourcePermission): string {
  return permission === 'read' ? '仅阅读' : '可编辑'
}

export function isNoteEditablePermission(permission: P2pSharedResourcePermission): boolean {
  return permission !== 'read'
}
