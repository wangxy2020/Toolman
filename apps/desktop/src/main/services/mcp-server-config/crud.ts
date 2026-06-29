import {
  McpServerConfigSchema,
  McpServerDeleteInputSchema,
  McpServerUpsertInputSchema,
  MCP_SERVER_IDS,
  type McpServerConfig,
} from '@toolman/shared'
import { isSystemDefaultMcpServer } from './defaults'
import { getServers, refreshCache, saveAll } from './persistence'

/** 启动时合并系统预置 MCP，确保旧配置升级后可见 */
export function bootstrapMcpPresets(): McpServerConfig[] {
  return refreshCache()
}

export function listMcpServers(): McpServerConfig[] {
  return getServers()
}

export function getMcpServer(id: string): McpServerConfig | null {
  return getServers().find((server) => server.id === id) ?? null
}

export function isMcpServerEnabled(id: string): boolean {
  const server = getMcpServer(id)
  return server?.enabled ?? false
}

export function filterEnabledMcpServerIds(serverIds: string[]): string[] {
  return serverIds.filter((id) => isMcpServerEnabled(id))
}

export function upsertMcpServer(input: unknown): McpServerConfig {
  const data = McpServerUpsertInputSchema.parse(input)
  const servers = [...getServers()]
  const index = servers.findIndex((server) => server.id === data.id)

  if (data.type === 'builtin') {
    const existing = servers.find((server) => server.id === data.id)
    if (!existing || existing.type !== 'builtin') {
      throw new Error('无法将自定义服务器设为内置类型')
    }
    const next = McpServerConfigSchema.parse({
      ...existing,
      enabled: data.enabled,
      name: data.name || existing.name,
      description: data.description ?? existing.description,
      timeoutSeconds: data.timeoutSeconds,
      longRunning: data.longRunning,
      provider: data.provider,
      providerUrl: data.providerUrl ?? existing.providerUrl,
      logoUrl: data.logoUrl,
      env: data.env ?? existing.env,
      args: data.args ?? existing.args,
      dbHost: data.dbHost,
      dbPort: data.dbPort,
      dbUser: data.dbUser,
      dbPassword: data.dbPassword,
      dbName: data.dbName,
      tags: data.tags,
    })
    servers[index] = next
    saveAll(servers)
    refreshCache()
    return next
  }

  if (!data.command?.trim()) {
    throw new Error('MCP 服务器需要配置 command')
  }

  const next = McpServerConfigSchema.parse(data)
  if (index >= 0) {
    if (servers[index].type === 'builtin') {
      throw new Error('无法覆盖内置 MCP 服务器')
    }
    servers[index] = next
  } else {
    if (MCP_SERVER_IDS.includes(next.id as (typeof MCP_SERVER_IDS)[number])) {
      throw new Error('该 ID 为内置服务器保留')
    }
    if (isSystemDefaultMcpServer(next.id)) {
      throw new Error('该 ID 为系统默认服务器保留')
    }
    servers.push(next)
  }

  saveAll(servers)
  refreshCache()
  return next
}

export function deleteMcpServer(input: unknown): boolean {
  const { id } = McpServerDeleteInputSchema.parse(input)
  const servers = getServers()
  const target = servers.find((server) => server.id === id)
  if (!target) return false
  if (target.type === 'builtin' || isSystemDefaultMcpServer(id)) {
    throw new Error('系统默认 MCP 服务器不可删除')
  }

  const next = servers.filter((server) => server.id !== id)
  saveAll(next)
  refreshCache()
  return true
}
