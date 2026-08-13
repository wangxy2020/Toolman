import { createContext, useContext } from 'react'
import type { MobileAuthSession } from '../auth/types'
import type { AgentChatScope } from '../chat/agentScopes'
import type { MobileModuleId } from '../modules'
import type { ModulePrefs } from '../settings/prefs'
import type { SettingsTabId } from '../settings/tabs'
import type { MobileNote, MobileNotebook, NoteTombstone } from '../storage/notes'
import type { KnowledgeMetaItem } from '../sync/mobileSync'

export type AuthSession = MobileAuthSession | null

export type ModelConfig = {
  /** Matches mobile provider preset id (deepseek / openai / …). */
  providerId: string
  baseUrl: string
  apiKey: string
  model: string
  /** Optional on-device path; off by default. */
  localModelEnabled: boolean
}

export type ChatMessage = {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt: number
}

export type ChatSession = {
  id: string
  title: string
  updatedAt: number
  messages: ChatMessage[]
  /**
   * Which module agent owns this session. Same LLM (`modelConfig`) for all scopes;
   * histories stay separate per page.
   */
  agentScope: AgentChatScope
}

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline'

export type MobileAppState = {
  module: MobileModuleId
  setModule: (id: MobileModuleId) => void
  leftOpen: boolean
  setLeftOpen: (open: boolean) => void
  auth: AuthSession
  setAuth: (auth: AuthSession) => void
  modelConfig: ModelConfig
  setModelConfig: (config: ModelConfig) => void
  sessions: ChatSession[]
  /** Active session id for the current module’s agent scope. */
  activeSessionId: string | null
  setActiveSessionId: (id: string | null) => void
  /** Last active session per agent page (persisted). */
  activeSessionByScope: Record<AgentChatScope, string | null>
  upsertSession: (session: ChatSession) => void
  renameSession: (id: string, title: string) => void
  removeSession: (id: string) => void
  syncStatus: SyncStatus
  setSyncStatus: (status: SyncStatus) => void
  syncCursor: string | null
  setSyncCursor: (cursor: string | null) => void
  desktopHostsOnline: number
  setDesktopHostsOnline: (count: number) => void
  notebooks: MobileNotebook[]
  setNotebooks: (notebooks: MobileNotebook[]) => void
  notes: MobileNote[]
  setNotes: (notes: MobileNote[]) => void
  deletedNotes: NoteTombstone[]
  setDeletedNotes: (items: NoteTombstone[]) => void
  knowledgeMeta: KnowledgeMetaItem[]
  setKnowledgeMeta: (items: KnowledgeMetaItem[]) => void
  activeNoteId: string | null
  setActiveNoteId: (id: string | null) => void
  showSettings: boolean
  setShowSettings: (show: boolean) => void
  settingsTab: SettingsTabId
  setSettingsTab: (tab: SettingsTabId) => void
  modulePrefs: ModulePrefs
  setModulePrefs: (prefs: ModulePrefs) => void
}

const MobileAppContext = createContext<MobileAppState | null>(null)

export const MobileAppProvider = MobileAppContext.Provider

export function useMobileApp(): MobileAppState {
  const ctx = useContext(MobileAppContext)
  if (!ctx) throw new Error('useMobileApp requires MobileAppProvider')
  return ctx
}
