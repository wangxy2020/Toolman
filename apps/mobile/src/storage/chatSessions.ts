import {
  AGENT_CHAT_SCOPES,
  isAgentChatScope,
  type AgentChatScope,
} from '../chat/agentScopes'
import { normalizeAgentSettings } from '../features/agentSettingsResolve'
import type { ChatSession, MobileAgent } from '../state/MobileAppContext'
import { loadOwnedScoped, saveOwnedScoped } from './identityScope'
import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'

const SESSIONS_KEY = 'toolman.mobile.chatSessions.v2'

export type ChatSessionsStore = {
  sessions: ChatSession[]
  agents: MobileAgent[]
  activeSessionByScope: Record<AgentChatScope, string | null>
}

const EMPTY_ACTIVE: Record<AgentChatScope, string | null> = {
  agent: null,
  classroom: null,
  projects: null,
}

export function emptyChatSessionsStore(): ChatSessionsStore {
  return { sessions: [], agents: [], activeSessionByScope: { ...EMPTY_ACTIVE } }
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

function normalizeGroupAgent(value: unknown): ChatSession['groupAgent'] {
  if (!value || typeof value !== 'object') return undefined
  const item = value as Partial<NonNullable<ChatSession['groupAgent']>>
  if (
    typeof item.workspaceId !== 'string' ||
    typeof item.resourceId !== 'string' ||
    typeof item.sourceSessionId !== 'string' ||
    typeof item.sourceAssistantId !== 'string' ||
    typeof item.groupName !== 'string' ||
    typeof item.sharedAgentName !== 'string' ||
    typeof item.ownerMemberId !== 'string'
  ) {
    return undefined
  }
  return {
    workspaceId: item.workspaceId,
    resourceId: item.resourceId,
    sourceSessionId: item.sourceSessionId,
    sourceAssistantId: item.sourceAssistantId,
    groupName: item.groupName,
    sharedAgentName: item.sharedAgentName,
    permission: item.permission === 'callable' ? 'callable' : 'read',
    ownerMemberId: item.ownerMemberId,
    ownerDeviceId: typeof item.ownerDeviceId === 'string' ? item.ownerDeviceId : undefined,
    referencedModelId: typeof item.referencedModelId === 'string' ? item.referencedModelId : undefined,
  }
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
  if (rawScope === 'group') return null
  const agentScope: AgentChatScope =
    typeof rawScope === 'string' && isAgentChatScope(rawScope as AgentChatScope)
      ? (rawScope as AgentChatScope)
      : 'agent'
  const groupAgent = normalizeGroupAgent((value as { groupAgent?: unknown }).groupAgent)
  const assistantId =
    typeof (value as { assistantId?: unknown }).assistantId === 'string'
      ? ((value as { assistantId: string }).assistantId)
      : undefined
  return {
    id: s.id,
    title: s.title,
    updatedAt: s.updatedAt,
    messages: s.messages as ChatSession['messages'],
    agentScope,
    assistantId: groupAgent ? undefined : assistantId,
    groupAgent,
  }
}

function normalizeAgent(value: unknown): MobileAgent | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Partial<MobileAgent>
  if (typeof item.id !== 'string' || typeof item.name !== 'string') return null
  const rawScope = item.agentScope
  const agentScope: AgentChatScope =
    typeof rawScope === 'string' && isAgentChatScope(rawScope as AgentChatScope)
      ? (rawScope as AgentChatScope)
      : 'agent'
  const settings = normalizeAgentSettings(item.settings)
  return {
    id: item.id,
    name: item.name.trim() || '智能体',
    agentScope,
    createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
    ...(settings ? { settings } : {}),
  }
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/** Ensure each scope has agents and personal sessions are attached to one. */
export function migrateAgentsAndSessions(
  sessions: ChatSession[],
  agentsInput: MobileAgent[],
): { sessions: ChatSession[]; agents: MobileAgent[] } {
  const agents = agentsInput.slice()
  const byScope = new Map<AgentChatScope, MobileAgent[]>()
  for (const scope of AGENT_CHAT_SCOPES) byScope.set(scope, [])
  for (const agent of agents) {
    byScope.get(agent.agentScope)?.push(agent)
  }

  const nextSessions = sessions.map((session) => ({ ...session }))

  for (const scope of AGENT_CHAT_SCOPES) {
    // Classroom course sessions are 1:1 with courses and must not gain synthetic
    // agents / assistantId (removeAgent would otherwise wipe courses).
    if (scope === 'classroom') {
      for (const session of nextSessions) {
        if (session.agentScope === 'classroom' && session.assistantId) {
          session.assistantId = undefined
        }
      }
      continue
    }

    const personal = nextSessions.filter((s) => s.agentScope === scope && !s.groupAgent)
    let scopeAgents = byScope.get(scope) ?? []
    // First-run / wiped store: seed a default agent (and topic below) so the
    // agent page is usable without colliding with classroom course selection.
    if (scopeAgents.length === 0) {
      const defaultAgent: MobileAgent = {
        id: newId('asst'),
        name: '默认智能体',
        agentScope: scope,
        createdAt: Date.now(),
      }
      agents.push(defaultAgent)
      scopeAgents = [defaultAgent]
      byScope.set(scope, scopeAgents)
    }
    const fallbackId = scopeAgents[0]?.id
    if (!fallbackId) continue
    const known = new Set(scopeAgents.map((a) => a.id))
    for (const session of nextSessions) {
      if (session.agentScope !== scope || session.groupAgent) continue
      if (!session.assistantId || !known.has(session.assistantId)) {
        session.assistantId = fallbackId
      }
    }
    if (personal.length === 0) {
      nextSessions.push({
        id: newId('sess'),
        title: '新话题',
        updatedAt: Date.now(),
        messages: [],
        agentScope: scope,
        assistantId: fallbackId,
      })
    }
  }

  return {
    sessions: nextSessions,
    agents: agents.filter((agent) => agent.agentScope !== 'classroom'),
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

function storeFromMigrated(
  migrated: { sessions: ChatSession[]; agents: MobileAgent[] },
  activeRaw?: unknown,
  legacyActiveId?: unknown,
): ChatSessionsStore {
  return {
    sessions: migrated.sessions,
    agents: migrated.agents,
    activeSessionByScope: resolveActiveByScope(
      migrated.sessions,
      activeRaw,
      legacyActiveId,
    ),
  }
}

export async function loadChatSessions(): Promise<ChatSessionsStore> {
  try {
    const parsed = await loadOwnedScoped<{
      sessions?: unknown
      agents?: unknown
      activeSessionByScope?: unknown
      activeSessionId?: unknown
    }>(SESSIONS_KEY, getItem)
    if (!parsed) {
      return storeFromMigrated(migrateAgentsAndSessions([], []))
    }
    const rawSessions = Array.isArray(parsed.sessions)
      ? parsed.sessions.map(normalizeSession).filter((s): s is ChatSession => Boolean(s))
      : []
    const rawAgents = Array.isArray(parsed.agents)
      ? parsed.agents.map(normalizeAgent).filter((a): a is MobileAgent => Boolean(a))
      : []
    return storeFromMigrated(
      migrateAgentsAndSessions(rawSessions, rawAgents),
      parsed.activeSessionByScope,
      parsed.activeSessionId,
    )
  } catch {
    return storeFromMigrated(migrateAgentsAndSessions([], []))
  }
}

export async function saveChatSessions(store: ChatSessionsStore): Promise<void> {
  await saveOwnedScoped(
    SESSIONS_KEY,
    {
      sessions: store.sessions,
      agents: store.agents,
      activeSessionByScope: store.activeSessionByScope,
    },
    setItem,
  )
}
