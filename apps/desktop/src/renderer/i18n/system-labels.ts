import type { TranslateFn } from './I18nProvider'
import { isDefaultSessionTitle } from '@toolman/shared'

const BUILTIN_ASSISTANT_NAMES = new Set(['通用智能体'])
const BUILTIN_NOTEBOOK_NAMES = new Set(['默认笔记本'])
const BUILTIN_GROUP_NAMES = new Set(['默认群组'])

export function translateAssistantName(name: string, t: TranslateFn): string {
  if (BUILTIN_ASSISTANT_NAMES.has(name)) return t('system.defaultAssistant')
  return name
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
  if (isDefaultSessionTitle(title)) return t('system.defaultSessionTitle')
  return title
}

export function translateKnowledgeFolderName(name: string, t: TranslateFn): string {
  const defaults = new Set(['默认文件夹', '默认网络文件夹', '默认本地文件'])
  if (defaults.has(name)) return t('sidebar.knowledge.defaultFolder')
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
