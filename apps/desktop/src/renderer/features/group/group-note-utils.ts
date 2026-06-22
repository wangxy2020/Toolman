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

export function formatGroupVirtualAgentName(groupName: string, agentName: string): string {
  const trimmedGroup = groupName.trim()
  const prefix = trimmedGroup ? `[${trimmedGroup}] ` : '[群组] '
  if (agentName.startsWith(prefix)) return agentName
  return `${prefix}${agentName}`
}

export function isGroupSharedMirrorAssistant(assistant: {
  parameters?: { p2pGroupSharedMirror?: unknown }
}): boolean {
  return Boolean(assistant.parameters?.p2pGroupSharedMirror)
}

export function formatGroupResourceDisplayName(
  groupName: string,
  resourceName: string,
): string {
  const trimmedGroup = groupName.trim()
  const prefix = trimmedGroup ? `[${trimmedGroup}] ` : '[群组] '
  if (resourceName.startsWith(prefix)) return resourceName
  if (trimmedGroup && resourceName.startsWith(trimmedGroup)) return resourceName
  return `${prefix}${resourceName}`
}

export function formatNotePermissionLabel(permission: P2pSharedResourcePermission): string {
  return permission === 'read' ? '仅阅读' : '可编辑'
}

export function isNoteEditablePermission(permission: P2pSharedResourcePermission): boolean {
  return permission !== 'read'
}
