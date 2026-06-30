export const GROUP_NOTEBOOK_ID_PREFIX = 'group-notebook:'

export function buildGroupNotebookId(workspaceId: string): string {
  return `${GROUP_NOTEBOOK_ID_PREFIX}${workspaceId}`
}

export function isGroupNotebookId(notebookId: string): boolean {
  return notebookId.startsWith(GROUP_NOTEBOOK_ID_PREFIX)
}

export function parseGroupNotebookWorkspaceId(notebookId: string): string | null {
  if (!isGroupNotebookId(notebookId)) return null
  const workspaceId = notebookId.slice(GROUP_NOTEBOOK_ID_PREFIX.length).trim()
  return workspaceId || null
}
