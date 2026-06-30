import type { P2pSharedResource, P2pSharedResourcePermission } from '@toolman/shared'
import { isGroupNotebookId } from '@toolman/shared'

export { buildGroupNotebookId, isGroupNotebookId } from '@toolman/shared'

const GROUP_KB_NOTE_ID_PREFIX = 'group-kb:'

export function buildGroupKnowledgeNoteId(documentId: string): string {
  return `${GROUP_KB_NOTE_ID_PREFIX}${documentId}`
}

export function formatGroupVirtualAgentName(groupName: string, agentName: string): string {
  const trimmedGroup = groupName.trim()
  const prefix = trimmedGroup ? `[${trimmedGroup}] ` : '[群组] '
  if (agentName.startsWith(prefix)) return agentName
  return `${prefix}${agentName}`
}

export function formatNotePermissionLabel(permission: P2pSharedResourcePermission): string {
  return permission === 'read' ? '仅阅读' : '可编辑'
}

export function resolveSharedNoteNotebookKey(
  resource: Pick<P2pSharedResource, 'notebookId'>,
  note: { notebookId: string } | null,
): string {
  if (resource.notebookId) return resource.notebookId
  if (note?.notebookId && !isGroupNotebookId(note.notebookId)) {
    return note.notebookId
  }
  return ''
}

export function resolveSharedNoteNotebookName(
  resource: Pick<P2pSharedResource, 'notebookId' | 'notebookName'>,
  notebookId: string,
  notebooksByName: Map<string, { name: string }>,
  fallback = '笔记本',
): string {
  if (resource.notebookName) return resource.notebookName
  if (!notebookId) return fallback
  return notebooksByName.get(notebookId)?.name ?? fallback
}
