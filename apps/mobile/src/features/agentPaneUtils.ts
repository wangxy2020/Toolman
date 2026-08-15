import type { AgentChatScope } from '../chat/agentScopes'
import type { ChatMessage, ChatSession, SyncStatus } from '../state/MobileAppContext'
import type { ModulePrefs } from '../settings/prefs'
import type { ModulePanelStatusEntry } from './modulePageStatus'

/** Match composer / message stream horizontal inset (12 + 8 scrollbar gutter). */
export const STREAM_PAD_SIDE = 20

export type MessageTranslation = { text: string; targetLanguage: string }

export type ComposerToolbarState = {
  webSearchEnabled: boolean
  kbEnabled: boolean
  useDesktopHost: boolean
}

export function defaultComposerToolbar(
  scope: AgentChatScope,
  prefs: ModulePrefs,
): ComposerToolbarState {
  return {
    webSearchEnabled: prefs.agent.defaultWebSearch,
    kbEnabled: scope === 'classroom' ? true : prefs.agent.defaultKb,
    useDesktopHost:
      scope === 'classroom'
        ? prefs.classroom.preferDesktopHost
        : scope === 'projects'
          ? prefs.projects.preferDesktopHost
          : prefs.agent.preferDesktopHost,
  }
}

/** Match desktop `formatMessageTime`: `MM/DD HH:mm`. */
export function formatMessageTime(timestamp: number): string {
  const date = new Date(timestamp)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${month}/${day} ${hours}:${minutes}`
}

export function newAgentId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function eventPoint(event: {
  nativeEvent?: { pageX?: number; pageY?: number }
  pageX?: number
  pageY?: number
}): { x: number; y: number } {
  const native = event.nativeEvent
  return {
    x: native?.pageX ?? event.pageX ?? 24,
    y: native?.pageY ?? event.pageY ?? 96,
  }
}

export function createEmptyAgentSession(agentScope: AgentChatScope): ChatSession {
  return {
    id: newAgentId('sess'),
    title: '新话题',
    updatedAt: Date.now(),
    messages: [],
    agentScope,
  }
}

export function classroomStatusFromSync(
  agentScope: AgentChatScope,
  syncStatus: SyncStatus,
): ModulePanelStatusEntry | null {
  if (agentScope !== 'classroom') return null
  if (syncStatus === 'syncing') {
    return { tone: 'info', message: '正在同步课堂…' }
  }
  if (syncStatus === 'offline') {
    return { tone: 'warning', message: '未连接桌面，课堂仅保存在本地' }
  }
  if (syncStatus === 'error') {
    return { tone: 'error', message: '课堂同步失败' }
  }
  return { tone: 'muted', message: '就绪' }
}

export function messageIdsToDelete(messages: ChatMessage[], messageId: string): Set<string> {
  const idx = messages.findIndex((m) => m.id === messageId)
  const removeIds = new Set([messageId])
  if (idx < 0) return removeIds
  const target = messages[idx]!
  if (target.role === 'user') {
    const next = messages[idx + 1]
    if (next?.role === 'assistant') removeIds.add(next.id)
  }
  return removeIds
}

export function forkSessionFromMessage(
  session: ChatSession,
  messageId: string,
  agentScope: AgentChatScope,
): ChatSession | null {
  const idx = session.messages.findIndex((m) => m.id === messageId)
  if (idx < 0) return null
  return {
    id: newAgentId('sess'),
    title: `${session.title} · 分叉`.slice(0, 40),
    updatedAt: Date.now(),
    messages: session.messages.slice(0, idx + 1).map((m) => ({ ...m, id: newAgentId('msg') })),
    agentScope,
  }
}

export function buildAgentSystemPrompt(prefs: ModulePrefs): string {
  return [
    prefs.agent.systemPrompt.trim(),
    prefs.app.memoryEnabled
      ? prefs.app.language === 'en'
        ? `Long-term memory is enabled (retention ${prefs.app.memoryRetentionDays} days). Remember the user's preferences and keep replies consistent across sessions.`
        : `长期记忆已启用（保留 ${prefs.app.memoryRetentionDays} 天）。请记住用户跨会话的偏好与约定，并在回复中保持一致。`
      : '',
  ]
    .filter(Boolean)
    .join('\n\n')
}

export function createNoteFromMessage(
  body: string,
  notebookId: string,
): { id: string; notebookId: string; title: string; body: string; updatedAt: number } {
  return {
    id: newAgentId('note'),
    notebookId,
    title: body.slice(0, 24) || '来自对话',
    body,
    updatedAt: Date.now(),
  }
}
