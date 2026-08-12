import type { MobileModuleId } from '../module-ids'

/** Modules that host an independent agent (shared model, separate sessions). */
export const AGENT_CHAT_SCOPES = ['agent', 'classroom', 'projects'] as const

export type AgentChatScope = (typeof AGENT_CHAT_SCOPES)[number]

export function isAgentChatScope(id: MobileModuleId): id is AgentChatScope {
  return (AGENT_CHAT_SCOPES as readonly string[]).includes(id)
}

export function resolveAgentChatScope(module: MobileModuleId): AgentChatScope {
  return isAgentChatScope(module) ? module : 'agent'
}

export const AGENT_SCOPE_LABEL: Record<AgentChatScope, string> = {
  agent: '智能体',
  classroom: '课堂',
  projects: '项目',
}
