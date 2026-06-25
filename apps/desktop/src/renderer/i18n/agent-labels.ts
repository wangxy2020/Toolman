import type { PermissionMode } from '../features/chat/agent-settings-constants'
import {
  MCP_SERVERS,
  PREAUTH_TOOLS,
  type PermissionMode as PM,
} from '../features/chat/agent-settings-constants'
import type { TranslateFn } from './I18nProvider'

export function getPermissionModes(t: TranslateFn) {
  const ids: PermissionMode[] = ['normal', 'plan', 'auto-edit', 'full-auto']
  return ids.map((id) => ({
    id,
    title: t(`agent.permissionModes.${id}.title`),
    description: t(`agent.permissionModes.${id}.description`),
    warning: id === 'full-auto' ? t(`agent.permissionModes.${id}.warning`) : undefined,
  }))
}

export function getMcpServers(t: TranslateFn) {
  return MCP_SERVERS.map((server) => ({
    ...server,
    description: t(`agent.tools.mcpDescriptions.${server.id}`),
  }))
}

export function getPreauthTools(t: TranslateFn) {
  return PREAUTH_TOOLS.map((tool) => ({
    ...tool,
    description: t('agent.tools.preauth.bashDescription'),
    tagOff: t('agent.tools.preauth.tagOff'),
    tagOn: t('agent.tools.preauth.tagOn'),
  }))
}

export function getAgentSettingsTabs(t: TranslateFn): { id: string; label: string }[] {
  return [
    { id: 'basic', label: t('agent.tabs.basic') },
    { id: 'prompt', label: t('agent.tabs.prompt') },
    { id: 'permission', label: t('agent.tabs.permission') },
    { id: 'tools', label: t('agent.tabs.tools') },
    { id: 'skills', label: t('agent.tabs.skills') },
    { id: 'knowledge', label: t('agent.tabs.knowledge') },
    { id: 'advanced', label: t('agent.tabs.advanced') },
  ]
}

export type { PM as PermissionMode }
