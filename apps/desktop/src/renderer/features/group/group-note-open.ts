import type { P2pSharedResourcePermission } from '@toolman/shared'

export interface OpenGroupNoteRequest {
  noteId: string
  workspaceId: string
  workspaceName: string
  permission?: P2pSharedResourcePermission
  sharedBy?: string
  title: string
  notebookId?: string
  notebookName?: string
  editable?: boolean
}

export interface SaveGroupNoteAsCopyRequest {
  noteId: string
  title: string
}

export interface OpenGroupKnowledgeMarkdownRequest {
  documentId: string
  workspaceId: string
  workspaceName: string
  title: string
  absolutePath: string
}
