import type { MouseEvent } from 'react'
import type { GroupKnowledgePanelItem } from './group-knowledge-panel-item'
import type { OpenGroupKnowledgeMarkdownRequest, OpenGroupNoteRequest } from './group-note-open'

export interface GroupKnowledgeFileListProps {
  resourceId: string
  p2pWorkspaceId: string
  workspaceName: string
  isResourceOwner: boolean
  documents: GroupKnowledgePanelItem[]
  selectedKeys: Set<string>
  canRemoveFromGroup: boolean
  canRemoveSaved: boolean
  canSelect: boolean
  removingDocumentId?: string | null
  onToggleSelect: (selectionKey: string) => void
  onRemoveFromGroup: (documentId: string) => void
  onRemoveSaved: (documentId: string) => void
  onOpenNote?: (noteId: string) => boolean
  onOpenGroupNote?: (request: OpenGroupNoteRequest) => void | Promise<void>
  onOpenGroupKnowledgeMarkdown?: (
    request: OpenGroupKnowledgeMarkdownRequest,
  ) => void | Promise<void>
  onMaterializeDocument?: (
    documentId: string,
    currentPath?: string | null,
  ) => Promise<string | null>
  onEnsureDocumentSaved?: (
    documentId: string,
    currentPath?: string | null,
  ) => Promise<{ absolutePath: string; savedDocumentId: string } | null>
  onOpenError?: (message: string) => void
  onContextMenu?: (event: MouseEvent) => void
}
