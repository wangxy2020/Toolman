import { createContext, useContext } from 'react'
import type { MobileAuthSession } from '../auth/types'
import type { AgentChatScope } from '../chat/agentScopes'
import type { MobileAgentSettings } from '../features/agentSettingsResolve'
import type { MobileModuleId } from '../modules'
import type { ModulePrefs } from '../settings/prefs'
import type { SettingsTabId } from '../settings/tabs'
import type { MobileNote, MobileNotebook, NoteTombstone } from '../storage/notes'
import type { KnowledgeMetaItem } from '../sync/mobileSync'
import type { MobileClassroomCourse } from '../sync/classroomSyncMerge'

export type AuthSession = MobileAuthSession | null

export type ModelConfig = {
  /** Matches mobile provider preset id (deepseek / openai / …). */
  providerId: string
  baseUrl: string
  apiKey: string
  model: string
  /** Optional on-device path; off by default. */
  localModelEnabled: boolean
  /** Per-provider API keys so switching chips does not reuse another vendor's secret. */
  credentialsByProvider?: Record<string, { apiKey: string; baseUrl?: string; model?: string }>
}

export type ChatMessage = {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  createdAt: number
}

export type GroupAgentProxy = {
  workspaceId: string
  resourceId: string
  sourceSessionId: string
  sourceAssistantId: string
  groupName: string
  sharedAgentName: string
  permission: 'read' | 'callable'
  ownerMemberId: string
  ownerDeviceId?: string
  referencedModelId?: string
}

/** Local sidebar agent (assistant), aligned with desktop MiddleSidebar groups. */
export type MobileAgent = {
  id: string
  name: string
  agentScope: AgentChatScope
  createdAt: number
  /** Per-agent settings; falls back to modulePrefs.agent when missing. */
  settings?: MobileAgentSettings
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
  /** Local agent (assistant) this topic belongs to. Group-proxy sessions omit this. */
  assistantId?: string
  /** Local proxy for a group-shared topic; invoke goes to the owner's agent. */
  groupAgent?: GroupAgentProxy
}

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline'

export type MobileSyncReason = 'bootstrap' | 'page' | 'interval' | 'foreground' | 'manual'

export type MobileDeviceInfo = {
  deviceId: string
  identityId: string | null
  kind: 'mobile'
}

export type MobileAppState = {
  module: MobileModuleId
  setModule: (id: MobileModuleId) => void
  leftOpen: boolean
  setLeftOpen: (open: boolean) => void
  auth: AuthSession
  setAuth: (auth: AuthSession) => void
  /** Stable per-install device id; bound to `auth.identityId` after login. */
  device: MobileDeviceInfo
  modelConfig: ModelConfig
  setModelConfig: (config: ModelConfig) => void
  sessions: ChatSession[]
  /** Local agents (assistants) for sidebar grouping. */
  agents: MobileAgent[]
  setAgents: (agents: MobileAgent[]) => void
  /** Active session id for the current module’s agent scope. */
  activeSessionId: string | null
  setActiveSessionId: (id: string | null) => void
  /** Last active session per agent page (persisted). */
  activeSessionByScope: Record<AgentChatScope, string | null>
  upsertSession: (session: ChatSession) => void
  renameSession: (id: string, title: string) => void
  removeSession: (id: string) => void
  upsertAgent: (agent: MobileAgent) => void
  renameAgent: (id: string, name: string) => void
  removeAgent: (id: string) => void
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
  classroomCourses: MobileClassroomCourse[]
  setClassroomCourses: (courses: MobileClassroomCourse[]) => void
  activeNoteId: string | null
  setActiveNoteId: (id: string | null) => void
  showSettings: boolean
  setShowSettings: (show: boolean) => void
  settingsTab: SettingsTabId
  setSettingsTab: (tab: SettingsTabId) => void
  modulePrefs: ModulePrefs
  setModulePrefs: (prefs: ModulePrefs) => void
  /** Push local notes (if enabled) and pull desktop changelog / knowledge snapshot. */
  runSync: (reason?: MobileSyncReason) => Promise<string>
}

const MobileAppContext = createContext<MobileAppState | null>(null)

export const MobileAppProvider = MobileAppContext.Provider

export function useMobileApp(): MobileAppState {
  const ctx = useContext(MobileAppContext)
  if (!ctx) throw new Error('useMobileApp requires MobileAppProvider')
  return ctx
}
