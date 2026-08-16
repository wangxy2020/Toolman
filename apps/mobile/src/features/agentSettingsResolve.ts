import type { AgentChatScope } from '../chat/agentScopes'
import type { ModulePrefs } from '../settings/prefs'

/** Per-agent preferences (sidebar assistants). Falls back to modulePrefs.agent. */
export type MobileAgentSettings = Omit<ModulePrefs['agent'], 'name'> & {
  /** Optional preferred model for this agent. */
  model?: string
  providerId?: string
}

type AgentLike = {
  id: string
  agentScope: AgentChatScope
  settings?: MobileAgentSettings
}

type SessionLike = {
  id: string
  agentScope: AgentChatScope
  assistantId?: string
}

export function defaultAgentSettingsFromPrefs(
  prefs: ModulePrefs['agent'],
): MobileAgentSettings {
  const { name: _name, ...rest } = prefs
  return { ...rest }
}

export function resolveAgentSettings(
  agent: AgentLike | null | undefined,
  defaults: ModulePrefs['agent'],
): MobileAgentSettings {
  const base = defaultAgentSettingsFromPrefs(defaults)
  if (!agent?.settings) return base
  return {
    ...base,
    ...agent.settings,
    mcpServerIds: agent.settings.mcpServerIds ?? base.mcpServerIds,
    skillIds: agent.settings.skillIds ?? base.skillIds,
    kbIds: agent.settings.kbIds ?? base.kbIds,
    translationLanguages: agent.settings.translationLanguages ?? base.translationLanguages,
  }
}

export function resolveActiveAgent<T extends AgentLike>(input: {
  agents: T[]
  sessions: SessionLike[]
  activeSessionId: string | null
  agentScope: AgentChatScope
}): T | null {
  const { agents, sessions, activeSessionId, agentScope } = input
  const scoped = agents.filter((agent) => agent.agentScope === agentScope)
  if (scoped.length === 0) return null
  const session = sessions.find((item) => item.id === activeSessionId)
  if (session?.assistantId) {
    const match = scoped.find((agent) => agent.id === session.assistantId)
    if (match) return match
  }
  return scoped[0] ?? null
}

export function normalizeAgentSettings(value: unknown): MobileAgentSettings | undefined {
  if (!value || typeof value !== 'object') return undefined
  const raw = value as Partial<MobileAgentSettings>
  const out: MobileAgentSettings = {
    preferDesktopHost: Boolean(raw.preferDesktopHost),
    defaultWebSearch: Boolean(raw.defaultWebSearch),
    defaultKb: Boolean(raw.defaultKb),
    ttsEngine: raw.ttsEngine === 'web-speech' ? 'web-speech' : 'edge',
    ttsVoice: typeof raw.ttsVoice === 'string' ? raw.ttsVoice : '',
    autoSpeak: raw.autoSpeak !== false,
    description: typeof raw.description === 'string' ? raw.description : '',
    systemPrompt: typeof raw.systemPrompt === 'string' ? raw.systemPrompt : '',
    permissionMode:
      raw.permissionMode === 'plan' ||
      raw.permissionMode === 'auto-edit' ||
      raw.permissionMode === 'full-auto'
        ? raw.permissionMode
        : 'normal',
    heartbeatEnabled: Boolean(raw.heartbeatEnabled),
    heartbeatIntervalMinutes:
      typeof raw.heartbeatIntervalMinutes === 'number' ? raw.heartbeatIntervalMinutes : 30,
    temperature: typeof raw.temperature === 'number' ? raw.temperature : 0.7,
    maxTokens: typeof raw.maxTokens === 'string' ? raw.maxTokens : '',
    sessionRoundLimit:
      typeof raw.sessionRoundLimit === 'number' ? raw.sessionRoundLimit : 100,
    environmentVariables:
      typeof raw.environmentVariables === 'string' ? raw.environmentVariables : '',
    mcpServerIds: Array.isArray(raw.mcpServerIds)
      ? raw.mcpServerIds.filter((id): id is string => typeof id === 'string')
      : [],
    skillIds: Array.isArray(raw.skillIds)
      ? raw.skillIds.filter((id): id is string => typeof id === 'string')
      : [],
    kbIds: Array.isArray(raw.kbIds)
      ? raw.kbIds.filter((id): id is string => typeof id === 'string')
      : [],
    bashEnabled: Boolean(raw.bashEnabled),
    translationLanguages: Array.isArray(raw.translationLanguages)
      ? [
          typeof raw.translationLanguages[0] === 'string' ? raw.translationLanguages[0] : 'zh',
          typeof raw.translationLanguages[1] === 'string' ? raw.translationLanguages[1] : 'en',
        ]
      : ['zh', 'en'],
  }
  if (typeof raw.model === 'string' && raw.model.trim()) out.model = raw.model.trim()
  if (typeof raw.providerId === 'string' && raw.providerId.trim()) {
    out.providerId = raw.providerId.trim()
  }
  return out
}
