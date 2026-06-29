import type { P2pMember, P2pMemberRole } from '@toolman/shared'
import type { OpenGroupNoteRequest, SaveGroupNoteAsCopyRequest } from './group-note-open'
import type { NoteItem, NotebookItem } from '../notes/notes-storage'

export interface GroupNotesPanelProps {
  p2pWorkspaceId: string
  workspaceName: string
  notebooks: NotebookItem[]
  notes: NoteItem[]
  syncFolderPath?: string | null
  canManageGroupResources: boolean
  canWriteWorkspace: boolean
  members: P2pMember[]
  selfMemberId: string | null
  selfMemberRole: P2pMemberRole | null
  onOpenGroupNote?: (request: OpenGroupNoteRequest) => void | Promise<void>
  onSaveGroupNoteAsCopy?: (request: SaveGroupNoteAsCopyRequest) => void | Promise<void>
  onSyncGroupNoteLock?: (noteId: string, locked: boolean) => void
}

export interface PendingNoteDelete {
  resourceIds: string[]
  message: string
}

export interface NoteActionMenuState {
  x: number
  y: number
  align: 'bottom-start'
  resource: import('@toolman/shared').P2pSharedResource
  note: NoteItem | null
}

export const UNKNOWN_NOTEBOOK_ID = '__unknown_notebook__'
