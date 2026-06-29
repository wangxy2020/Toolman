import type { TranslateFn } from './I18nProvider'
import { isDefaultSessionTitle } from '@toolman/shared'

const BUILTIN_ASSISTANT_NAMES = new Set(['通用智能体'])
const BUILTIN_NOTEBOOK_NAMES = new Set(['默认笔记本'])
const BUILTIN_GROUP_NAMES = new Set(['默认群组'])
const BUILTIN_ASSISTANT_DESCRIPTIONS = new Set(['默认 AI 对话智能体'])
const BUILTIN_SYSTEM_PROMPTS = new Set([
  '你是一个有帮助的 AI 助手。',
  '群组共享智能体代理',
])
const BUILTIN_KB_DESCRIPTIONS = new Set(['默认文件夹知识库', '默认文件夹存储'])
const BUILTIN_SESSION_TITLE_ALIASES = new Set(['未命名话题', '共享话题'])
const GROUP_FORMATTED_NAME_RE = /^\[([^\]]+)\]\s+(.+)$/
const GROUP_FALLBACK_PREFIX = '[群组] '

export function translateAssistantName(name: string, t: TranslateFn): string {
  if (BUILTIN_ASSISTANT_NAMES.has(name)) return t('system.defaultAssistant')
  return translateGroupFormattedAgentName(name, t)
}

export function translateNotebookName(name: string, t: TranslateFn): string {
  if (BUILTIN_NOTEBOOK_NAMES.has(name)) return t('system.defaultNotebook')
  return name
}

export function translateGroupName(name: string, t: TranslateFn): string {
  if (BUILTIN_GROUP_NAMES.has(name)) return t('system.defaultGroup')
  return name
}

export function translateSessionTitle(title: string, t: TranslateFn): string {
  if (isDefaultSessionTitle(title) || BUILTIN_SESSION_TITLE_ALIASES.has(title)) {
    if (title === '共享话题') return t('system.sessionShared')
    if (title === '未命名话题') return t('system.sessionUnnamed')
    return t('system.defaultSessionTitle')
  }
  return title
}

export function translateKnowledgeFolderName(name: string, t: TranslateFn): string {
  const defaults = new Set(['默认文件夹', '默认网络文件夹', '默认本地文件'])
  if (defaults.has(name)) return t('sidebar.knowledge.defaultFolder')
  return name
}

export function translateKnowledgeBaseDescription(description: string, t: TranslateFn): string {
  const trimmed = description.trim()
  if (trimmed === '默认文件夹知识库') return t('knowledgePage.settings.defaultFolderKbDescription')
  if (trimmed === '默认文件夹存储') return t('knowledgePage.settings.defaultFolderStorageDescription')
  if (BUILTIN_KB_DESCRIPTIONS.has(trimmed)) return trimmed
  return description
}

export function translateSystemPrompt(prompt: string, t: TranslateFn): string {
  const trimmed = prompt.trim()
  if (trimmed === '群组共享智能体代理') return t('agent.groupProxySystemPrompt')
  if (BUILTIN_SYSTEM_PROMPTS.has(trimmed)) return t('agent.defaultSystemPrompt')
  return prompt
}

export function translateAssistantDescription(description: string, t: TranslateFn): string {
  if (BUILTIN_ASSISTANT_DESCRIPTIONS.has(description.trim())) {
    return t('agent.defaultAssistantDescription')
  }
  return description
}

export function translateGroupFormattedAgentName(name: string, t: TranslateFn): string {
  const trimmed = name.trim()
  if (trimmed.startsWith(GROUP_FALLBACK_PREFIX)) {
    const agentName = trimmed.slice(GROUP_FALLBACK_PREFIX.length)
    return `${t('system.groupNameBracket')} ${translateBuiltinAssistantName(agentName, t)}`
  }

  const match = GROUP_FORMATTED_NAME_RE.exec(trimmed)
  if (!match) {
    return translateBuiltinAssistantName(trimmed, t)
  }

  const [, groupName, agentName] = match
  return `[${translateGroupName(groupName, t)}] ${translateBuiltinAssistantName(agentName, t)}`
}

function translateBuiltinAssistantName(name: string, t: TranslateFn): string {
  if (BUILTIN_ASSISTANT_NAMES.has(name)) return t('system.defaultAssistant')
  return name
}

type P2pWanReadinessLike = {
  ready: boolean
  reason?: string
  reasonCode?: 'turn_not_configured' | 'turn_missing_credentials'
}

export function translateP2pWanReadinessReason(
  readiness: P2pWanReadinessLike,
  t: TranslateFn,
  options?: {
    turnNotConfiguredKey?: string
    missingCredentialsKey?: string
    fallbackKey?: string
  },
): string {
  if (readiness.ready) return ''
  if (readiness.reasonCode === 'turn_missing_credentials') {
    return t(options?.missingCredentialsKey ?? 'settings.diagnostics.wan.missingCredentials')
  }
  if (readiness.reasonCode === 'turn_not_configured') {
    return t(options?.turnNotConfiguredKey ?? 'settings.diagnostics.wan.notConfigured')
  }
  return t(options?.fallbackKey ?? 'settings.diagnostics.wan.defaultReason')
}
