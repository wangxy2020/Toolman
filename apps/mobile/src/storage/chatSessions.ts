import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import {
  AGENT_CHAT_SCOPES,
  isAgentChatScope,
  type AgentChatScope,
} from '../chat/agentScopes'
import type { ChatSession } from '../state/MobileAppContext'

const SESSIONS_KEY = 'toolman.mobile.chatSessions.v2'
const SESSIONS_KEY_V1 = 'toolman.mobile.chatSessions.v1'

export type ChatSessionsStore = {
  sessions: ChatSession[]
  activeSessionByScope: Record<AgentChatScope, string | null>
}

const EMPTY_ACTIVE: Record<AgentChatScope, string | null> = {
  agent: null,
  classroom: null,
  projects: null,
}

const EMPTY: ChatSessionsStore = {
  sessions: [],
  activeSessionByScope: { ...EMPTY_ACTIVE },
}

async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return globalThis.localStorage?.getItem(key) ?? null
    } catch {
      return null
    }
  }
  try {
    return await SecureStore.getItemAsync(key)
  } catch {
    return null
  }
}

async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      globalThis.localStorage?.setItem(key, value)
    } catch {
      // ignore
    }
    return
  }
  await SecureStore.setItemAsync(key, value)
}

function normalizeSession(value: unknown): ChatSession | null {
  if (!value || typeof value !== 'object') return null
  const s = value as Partial<ChatSession> & { agentScope?: string }
  if (
    typeof s.id !== 'string' ||
    typeof s.title !== 'string' ||
    typeof s.updatedAt !== 'number' ||
    !Array.isArray(s.messages)
  ) {
    return null
  }
  const rawScope = (value as { agentScope?: unknown }).agentScope
  // Group page is member chat now (not LLM sessions).
  if (rawScope === 'group') return null
  const agentScope: AgentChatScope =
    typeof rawScope === 'string' && isAgentChatScope(rawScope as AgentChatScope)
      ? (rawScope as AgentChatScope)
      : 'agent'
  return {
    id: s.id,
    title: s.title,
    updatedAt: s.updatedAt,
    messages: s.messages as ChatSession['messages'],
    agentScope,
  }
}

function resolveActiveByScope(
  sessions: ChatSession[],
  raw: unknown,
  legacyActiveId: unknown,
): Record<AgentChatScope, string | null> {
  const next = { ...EMPTY_ACTIVE }
  if (raw && typeof raw === 'object') {
    for (const scope of AGENT_CHAT_SCOPES) {
      const id = (raw as Record<string, unknown>)[scope]
      if (typeof id === 'string' && sessions.some((s) => s.id === id && s.agentScope === scope)) {
        next[scope] = id
      } else {
        next[scope] = sessions.find((s) => s.agentScope === scope)?.id ?? null
      }
    }
    return next
  }
  if (typeof legacyActiveId === 'string' && sessions.some((s) => s.id === legacyActiveId)) {
    const sess = sessions.find((s) => s.id === legacyActiveId)!
    next[sess.agentScope] = legacyActiveId
  }
  for (const scope of AGENT_CHAT_SCOPES) {
    if (!next[scope]) next[scope] = sessions.find((s) => s.agentScope === scope)?.id ?? null
  }
  return next
}

export async function loadChatSessions(): Promise<ChatSessionsStore> {
  try {
    let raw = await getItem(SESSIONS_KEY)
    if (!raw) raw = await getItem(SESSIONS_KEY_V1)
    if (!raw) return EMPTY
    const parsed = JSON.parse(raw) as {
      sessions?: unknown
      activeSessionByScope?: unknown
      activeSessionId?: unknown
    }
    const sessions = Array.isArray(parsed.sessions)
      ? parsed.sessions.map(normalizeSession).filter((s): s is ChatSession => Boolean(s))
      : []
    const activeSessionByScope = resolveActiveByScope(
      sessions,
      parsed.activeSessionByScope,
      parsed.activeSessionId,
    )
    return { sessions, activeSessionByScope }
  } catch {
    return EMPTY
  }
}

export async function saveChatSessions(store: ChatSessionsStore): Promise<void> {
  await setItem(
    SESSIONS_KEY,
    JSON.stringify({
      sessions: store.sessions,
      activeSessionByScope: store.activeSessionByScope,
    }),
  )
}
