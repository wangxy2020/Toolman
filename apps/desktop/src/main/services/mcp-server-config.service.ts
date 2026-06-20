import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import {
  McpServerConfigSchema,
  McpServerDeleteInputSchema,
  McpServerUpsertInputSchema,
  type McpServerConfig,
} from '@toolman/shared'
import {
  DEFAULT_MCP_SERVER_IDS,
  LOCAL_DB_MCP_SERVER_ID,
  MCP_SERVER_IDS,
  isDefaultEnabledMcpServer,
  matchOfficialMcpPresetId,
  isDuplicateOfficialMcpPreset,
} from '@toolman/shared'
import { isPostgresMcpConfig } from './mcp-postgres-verify.service'

const CONFIG_FILE = 'mcp-servers.json'

const BUILTIN_SERVER_META: Record<
  (typeof MCP_SERVER_IDS)[number],
  { name: string; description: string }
> = {
  filesystem: { name: 'Filesystem', description: '读写本地文件系统（内置）' },
  browser: { name: 'Browser', description: '浏览网页与抓取内容（内置）' },
  github: { name: 'GitHub', description: '访问 GitHub 仓库与 Issue（内置）' },
  sqlite: { name: 'SQLite', description: '查询本地 SQLite 数据库（内置）' },
  dify: { name: 'Dify Knowledge', description: '检索 Dify 知识库（内置）' },
  hub: { name: 'Hub', description: '聚合所有 MCP 工具的统一入口（内置）' },
}

const BUILTIN_DEFAULT_CONFIG: Partial<
  Record<(typeof MCP_SERVER_IDS)[number], Partial<McpServerConfig>>
> = {
  dify: {
    providerUrl: 'https://api.dify.ai/v1',
    env: { DIFY_KEY: '' },
  },
}

function defaultBuiltinServers(): McpServerConfig[] {
  return MCP_SERVER_IDS.map((id) => ({
    id,
    name: BUILTIN_SERVER_META[id].name,
    description: BUILTIN_SERVER_META[id].description,
    type: 'builtin' as const,
    enabled: isDefaultEnabledMcpServer(id),
    builtinId: id,
    ...(BUILTIN_DEFAULT_CONFIG[id] ?? {}),
  }))
}

function defaultLocalDbServer(): McpServerConfig {
  return {
    id: LOCAL_DB_MCP_SERVER_ID,
    name: 'Local-db',
    description: '访问本地 PostgreSQL 数据库',
    type: 'stdio',
    enabled: isDefaultEnabledMcpServer(LOCAL_DB_MCP_SERVER_ID),
    command: 'npx',
    args: [
      '-y',
      '@modelcontextprotocol/server-postgres',
      'postgres://postgres@localhost:5432/postgres',
    ],
    env: {},
    packageSource: 'default',
    longRunning: false,
    timeoutSeconds: 60,
    dbHost: 'localhost',
    dbPort: '5432',
    dbUser: 'postgres',
    dbPassword: '',
    dbName: 'postgres',
  }
}

function defaultFetchServer(): McpServerConfig {
  return {
    id: 'fetch',
    name: 'Fetch',
    description: '官方 fetch MCP，抓取网页 HTML/Markdown/文本/JSON（uvx）',
    type: 'stdio',
    enabled: isDefaultEnabledMcpServer('fetch'),
    command: 'uvx',
    args: ['mcp-server-fetch'],
    env: {},
    packageSource: 'default',
    longRunning: true,
    timeoutSeconds: 60,
  }
}

function defaultMemoryPreset(): McpServerConfig {
  return {
    id: 'memory',
    name: 'Memory',
    description: '官方知识图谱记忆 MCP（npx）',
    type: 'stdio',
    enabled: isDefaultEnabledMcpServer('memory'),
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-memory'],
    env: {},
    packageSource: 'default',
    longRunning: true,
    timeoutSeconds: 60,
  }
}

function defaultPythonPreset(): McpServerConfig {
  return {
    id: 'python',
    name: 'Python',
    description: '官方 Python 执行 MCP（uvx）',
    type: 'stdio',
    enabled: isDefaultEnabledMcpServer('python'),
    command: 'uvx',
    args: ['mcp-python-interpreter'],
    env: {},
    packageSource: 'default',
    longRunning: true,
    timeoutSeconds: 120,
  }
}

function defaultBraveSearchPreset(): McpServerConfig {
  return {
    id: 'brave-search',
    name: 'Brave Search',
    description: 'Brave Search 官方 MCP，需配置 BRAVE_API_KEY',
    type: 'stdio',
    enabled: isDefaultEnabledMcpServer('brave-search'),
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-brave-search'],
    env: { BRAVE_API_KEY: '' },
    packageSource: 'default',
    longRunning: true,
    timeoutSeconds: 60,
  }
}

function defaultDocxMcpServerPreset(): McpServerConfig {
  return {
    id: 'docx-mcp-server',
    name: 'DOCX MCP Server',
    description:
      'Word (.docx) 读写、批注、高亮、修订与排版；本地 stdio（npx docx-mcp-server，需 Node.js 20+）',
    type: 'stdio',
    enabled: isDefaultEnabledMcpServer('docx-mcp-server'),
    command: 'npx',
    args: ['-y', 'docx-mcp-server'],
    env: {},
    packageSource: 'default',
    longRunning: true,
    timeoutSeconds: 120,
  }
}

function defaultSystemMcpServers(): McpServerConfig[] {
  return [
    defaultLocalDbServer(),
    defaultFetchServer(),
    defaultMemoryPreset(),
    defaultPythonPreset(),
    defaultBraveSearchPreset(),
    defaultDocxMcpServerPreset(),
  ]
}

function isSystemDefaultMcpServer(id: string): boolean {
  return DEFAULT_MCP_SERVER_IDS.includes(id as (typeof DEFAULT_MCP_SERVER_IDS)[number])
}

function configPath(): string {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, CONFIG_FILE)
}

function defaultAllServers(): McpServerConfig[] {
  return [...defaultBuiltinServers(), ...defaultSystemMcpServers()]
}

function loadRaw(): McpServerConfig[] {
  const path = configPath()
  if (!existsSync(path)) {
    const defaults = defaultAllServers()
    saveAll(defaults)
    return defaults
  }

  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown
    if (!Array.isArray(parsed)) {
      const defaults = defaultAllServers()
      saveAll(defaults)
      return defaults
    }
    const items = parsed.map((item) => McpServerConfigSchema.parse(item))
    const merged = mergeWithDefaultServers(items)
    if (shouldPersistMergedConfig(items, merged)) {
      saveAll(merged)
    }
    return merged
  } catch {
    const defaults = defaultAllServers()
    saveAll(defaults)
    return defaults
  }
}

function findDuplicatePreset(
  officialId: string,
  byId: Map<string, McpServerConfig>,
): McpServerConfig | undefined {
  for (const server of byId.values()) {
    if (matchOfficialMcpPresetId(server) === officialId) return server
  }
  return undefined
}

function stripDbConnectionFields(config: McpServerConfig): McpServerConfig {
  const { dbHost, dbPort, dbUser, dbPassword, dbName, ...rest } = config
  return rest
}

function launchArgsPolluted(config: McpServerConfig): boolean {
  return (config.args ?? []).some(
    (arg) => arg.includes('server-postgres') || arg.startsWith('postgres://'),
  )
}

function mergeSystemMcpServerPreset(system: McpServerConfig, source: McpServerConfig): McpServerConfig {
  if (isPostgresMcpConfig(system)) {
    return McpServerConfigSchema.parse({
      ...system,
      ...source,
      id: system.id,
      type: system.type,
    })
  }

  const polluted = launchArgsPolluted(source)
  const presetMatch = matchOfficialMcpPresetId(source) === system.id
  const useSourceLaunch =
    !polluted && presetMatch && Boolean(source.command?.trim()) && (source.args?.length ?? 0) > 0

  let merged: McpServerConfig = {
    ...system,
    enabled: source.enabled,
    env: source.env ?? system.env,
    description: source.description ?? system.description,
    name: source.name?.trim() ? source.name : system.name,
    longRunning: source.longRunning ?? system.longRunning,
    timeoutSeconds: source.timeoutSeconds ?? system.timeoutSeconds,
    packageSource: source.packageSource ?? system.packageSource,
    command: useSourceLaunch ? source.command : system.command,
    args: useSourceLaunch ? source.args : system.args,
    id: system.id,
    type: system.type,
  }

  if (system.id === 'python') {
    const args = merged.args ?? []
    const pythonBroken =
      args.includes('mcp-server-python') ||
      launchArgsPolluted(merged) ||
      merged.command !== 'uvx' ||
      !args.includes('mcp-python-interpreter')
    if (pythonBroken) {
      merged = { ...merged, command: 'uvx', args: ['mcp-python-interpreter'] }
    }
  }

  if (system.id === 'docx-mcp-server') {
    const args = merged.args ?? []
    const docxBroken = merged.command !== 'npx' || !args.includes('docx-mcp-server')
    if (docxBroken) {
      merged = { ...merged, command: 'npx', args: ['-y', 'docx-mcp-server'] }
    }
  }

  return McpServerConfigSchema.parse(stripDbConnectionFields(merged))
}

function mergeWithDefaultServers(items: McpServerConfig[]): McpServerConfig[] {
  const byId = new Map(items.map((item) => [item.id, item]))
  const merged: McpServerConfig[] = []

  for (const builtin of defaultBuiltinServers()) {
    merged.push(byId.get(builtin.id) ?? builtin)
    byId.delete(builtin.id)
  }

  for (const system of defaultSystemMcpServers()) {
    const saved = byId.get(system.id)
    const duplicate = saved ? undefined : findDuplicatePreset(system.id, byId)
    const source = saved ?? duplicate

    if (saved?.type === 'builtin') {
      merged.push(system)
    } else if (source) {
      merged.push(
        McpServerConfigSchema.parse(mergeSystemMcpServerPreset(system, source)),
      )
      if (duplicate) byId.delete(duplicate.id)
    } else {
      merged.push(system)
    }
    byId.delete(system.id)
  }

  for (const custom of byId.values()) {
    if (custom.id === 'toolman-office') continue
    if (custom.type === 'builtin') continue
    if (isSystemDefaultMcpServer(custom.id)) {
      const fallback = defaultSystemMcpServers().find((server) => server.id === custom.id)
      if (fallback) {
        merged.push(
          McpServerConfigSchema.parse(mergeSystemMcpServerPreset(fallback, custom)),
        )
      }
      continue
    }
    if (isDuplicateOfficialMcpPreset(custom)) continue
    merged.push(custom)
  }

  return merged
}

function shouldPersistMergedConfig(before: McpServerConfig[], after: McpServerConfig[]): boolean {
  if (before.length !== after.length) return true

  const beforeById = new Map(before.map((server) => [server.id, server]))
  for (const server of after) {
    const prev = beforeById.get(server.id)
    if (!prev) return true
    if (JSON.stringify(prev) !== JSON.stringify(server)) return true
  }

  return false
}

function saveAll(servers: McpServerConfig[]): void {
  writeFileSync(configPath(), JSON.stringify(servers, null, 2), 'utf8')
}

let cache: McpServerConfig[] | null = null

function getServers(): McpServerConfig[] {
  if (!cache) cache = loadRaw()
  return cache
}

function refreshCache(): McpServerConfig[] {
  cache = loadRaw()
  return cache
}

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

export function invalidateMcpServerCache(): void {
  cache = null
}
