import {
  DEFAULT_MCP_SERVER_IDS,
  MCP_SETTINGS_CATEGORIES,
  isDuplicateOfficialMcpPreset,
  type McpServerConfig,
} from '@toolman/shared'
import {
  getMcpCategoryDescription,
  getMcpCategoryTitle,
} from '../../i18n/settings-labels'
import type { TranslateFn } from '../../i18n/useI18n'
import { MCP_SERVERS } from '../chat/agent-settings-constants'
import { applyPackageSource } from './mcp-server-edit-utils'
import { withPostgresDefaults } from './mcp-db-connection'

export function finalizeConfig(config: McpServerConfig): McpServerConfig {
  if (config.type === 'builtin') return config
  return applyPackageSource(withPostgresDefaults(config))
}

export function isSystemDefaultServer(id: string): boolean {
  return DEFAULT_MCP_SERVER_IDS.includes(id as (typeof DEFAULT_MCP_SERVER_IDS)[number])
}

export function canPersist(config: McpServerConfig, creating: boolean): boolean {
  if (!config.name.trim()) return false
  if (config.type === 'builtin') return true
  if (!config.command?.trim()) return false
  if (creating && !config.id.trim()) return false
  return true
}

export type McpSettingsCategoryGroup = {
  id: string
  title: string
  description: string
  serverIds: readonly string[]
  servers: McpServerConfig[]
}

function resolveCategoryServer(id: string, servers: McpServerConfig[]): McpServerConfig | null {
  const existing = servers.find((server) => server.id === id)
  if (existing) return existing

  const meta = MCP_SERVERS.find((server) => server.id === id)
  if (!meta) return null

  return {
    id: meta.id,
    name: meta.name,
    description: meta.description,
    type: 'stdio',
    enabled: false,
  }
}

function sortServersByName(servers: McpServerConfig[]): McpServerConfig[] {
  return [...servers].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'))
}

export function groupServers(servers: McpServerConfig[], t: TranslateFn): McpSettingsCategoryGroup[] {
  const knownIds = new Set<string>(
    MCP_SETTINGS_CATEGORIES.flatMap((category) => category.serverIds),
  )

  const categorized: McpSettingsCategoryGroup[] = MCP_SETTINGS_CATEGORIES.map((category) => ({
    id: category.id,
    title: getMcpCategoryTitle(category.id, t),
    description: getMcpCategoryDescription(category.id, t),
    serverIds: category.serverIds,
    servers: sortServersByName(
      category.serverIds
        .map((id) => resolveCategoryServer(id, servers))
        .filter((server): server is McpServerConfig => Boolean(server)),
    ),
  }))

  const customServers = sortServersByName(
    servers.filter(
      (server) => !knownIds.has(server.id) && !isDuplicateOfficialMcpPreset(server),
    ),
  )
  categorized.push({
    id: 'custom',
    title: getMcpCategoryTitle('custom', t),
    description: getMcpCategoryDescription('custom', t),
    serverIds: [],
    servers: customServers,
  })

  return categorized
}
