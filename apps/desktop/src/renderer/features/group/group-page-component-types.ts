import type { AuthFeature, Assistant, KnowledgeBase, P2pWorkspace, Session } from '@toolman/shared'
import type { NoteItem, NotebookItem } from '../notes/notes-storage'
import type {
  OpenGroupKnowledgeMarkdownRequest,
  OpenGroupNoteRequest,
  SaveGroupNoteAsCopyRequest,
} from './group-note-open'
import type { OpenGroupAgentSessionRequest } from './group-agent-open'
import type { MessageSettings } from '../chat/message-settings'

export interface GroupPageProps {
  workspace: P2pWorkspace | null
  sourceWorkspaceId: string | null
  knowledgeBases: KnowledgeBase[]
  assistants: Assistant[]
  sessions: Session[]
  notebooks: NotebookItem[]
  notes: NoteItem[]
  syncFolderPath?: string | null
  onInvite?: () => void
  onWorkspaceUpdated?: (workspace: P2pWorkspace) => void
  onWorkspaceLeft?: () => void
  onOpenNote?: (noteId: string) => boolean
  onOpenGroupNote?: (request: OpenGroupNoteRequest) => void | Promise<void>
  onOpenGroupKnowledgeMarkdown?: (
    request: OpenGroupKnowledgeMarkdownRequest,
  ) => void | Promise<void>
  onKnowledgeBasesChanged?: () => void | Promise<void>
  onSaveGroupNoteAsCopy?: (request: SaveGroupNoteAsCopyRequest) => void | Promise<void>
  onOpenGroupAgentSession?: (request: OpenGroupAgentSessionRequest) => void | Promise<void>
  onReloadAssistants?: () => void | Promise<void>
  onSyncGroupNoteLock?: (noteId: string, locked: boolean) => void
  messageSettings: MessageSettings
  spellCheckEnabled?: boolean
  defaultFilePath?: string | null
  requireRegistration?: (feature: AuthFeature) => boolean
  onUpgradeMembership?: () => void
}

export interface GroupPageHeaderAction {
  key: string
  icon: React.ReactNode
  title: string
}

export const DEFAULT_GROUP_ACTION = 'messages'

export const GROUP_NESTED_SCROLL_ACTIONS = new Set([
  'messages',
  'agents',
  'knowledge',
  'notes',
  'workflow',
])
