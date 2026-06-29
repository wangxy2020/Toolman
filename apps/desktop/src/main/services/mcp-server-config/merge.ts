import { McpServerConfigSchema, type McpServerConfig } from '@toolman/shared'
import {
  matchOfficialMcpPresetId,
  isDuplicateOfficialMcpPreset,
} from '@toolman/shared'
import { isPostgresMcpConfig } from '../mcp-postgres-verify.service'
import { repairDocxMcpLaunch, isLegacyDocxMcpLaunch } from '../mcp-docx-launch-repair'
import { resolveExcelMcpServerEntryPath } from '../excel-mcp-paths'
import { resolveMcpNodeCommand } from '../mcp-node-runtime'
import { defaultBuiltinServers, defaultSystemMcpServers, isSystemDefaultMcpServer } from './defaults'

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
  const { dbHost: _dbHost, dbPort: _dbPort, dbUser: _dbUser, dbPassword: _dbPassword, dbName: _dbName, ...rest } = config
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
  const docxLegacySource = system.id === 'docx-mcp-server' && isLegacyDocxMcpLaunch(source)
  const useSourceLaunch =
    !polluted &&
    presetMatch &&
    !docxLegacySource &&
    Boolean(source.command?.trim()) &&
    (source.args?.length ?? 0) > 0

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
    merged = repairDocxMcpLaunch(merged)
  }

  if (system.id === 'excel-mcp-server') {
    const entryPath = resolveExcelMcpServerEntryPath()
    const args = merged.args ?? []
    const excelBroken =
      args.length === 0 || !args.some((arg) => arg.includes('excelServer.js'))
    if (excelBroken && entryPath) {
      merged = { ...merged, command: resolveMcpNodeCommand(), args: [entryPath] }
    }
  }

  return McpServerConfigSchema.parse(stripDbConnectionFields(merged))
}

export function mergeWithDefaultServers(items: McpServerConfig[]): McpServerConfig[] {
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

  return merged.map(repairDocxMcpLaunch)
}
