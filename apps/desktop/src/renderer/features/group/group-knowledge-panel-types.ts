import type { KnowledgeBase, P2pMember } from '@toolman/shared'
import type { OpenGroupKnowledgeMarkdownRequest, OpenGroupNoteRequest } from './group-note-open'

export interface GroupKnowledgePanelProps {
  p2pWorkspaceId: string
  workspaceName: string
  sourceWorkspaceId: string | null
  knowledgeBases: KnowledgeBase[]
  canManageGroupResources: boolean
  canWriteWorkspace: boolean
  members: P2pMember[]
  selfMemberId: string | null
  onOpenNote?: (noteId: string) => boolean
  onOpenGroupNote?: (request: OpenGroupNoteRequest) => void | Promise<void>
  onOpenGroupKnowledgeMarkdown?: (
    request: OpenGroupKnowledgeMarkdownRequest,
  ) => void | Promise<void>
  onKnowledgeBasesChanged?: () => void | Promise<void>
}

export type PendingDeleteKind = 'kb' | 'documents' | 'saved-documents' | 'saved-section'

export interface PendingDelete {
  kind: PendingDeleteKind
  groups: Array<{ resourceId: string; documentIds: string[] }>
  savedGroups?: Array<{
    resourceId: string
    workspaceId: string
    savedKbId: string
    savedDocumentIds: string[]
  }>
  message: string
}

export interface SavedDocumentOverride {
  savedDocumentId: string
  absolutePath: string
}
