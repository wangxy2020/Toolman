import type { McpServerConfig } from '@toolman/shared'
import { matchOfficialMcpPresetId } from '@toolman/shared'

import { resolveDocxMcpServerEntryPath } from './docx-mcp-paths'
import { resolveMcpNodeCommand } from './mcp-node-runtime'

export function isBundledDocxMcpLaunch(config: Pick<McpServerConfig, 'type' | 'command' | 'args'>): boolean {
  if (config.type !== 'stdio') return false
  const args = config.args ?? []
  return args.some((arg) => arg.includes('docxServer.js'))
}

export function isLegacyDocxMcpLaunch(config: Pick<McpServerConfig, 'type' | 'command' | 'args'>): boolean {
  if (config.type !== 'stdio') return false
  const command = config.command?.trim() ?? ''
  const args = config.args ?? []

  if (!command || args.length === 0) return true
  if (command === 'npx' && args.some((arg) => arg.includes('docx-mcp-server'))) return true
  if (command === 'node' && !isBundledDocxMcpLaunch(config)) return true
  return false
}

export function shouldRepairDocxMcpLaunch(config: McpServerConfig): boolean {
  if (config.id === 'docx-mcp-server') return isLegacyDocxMcpLaunch(config)
  return matchOfficialMcpPresetId(config) === 'docx-mcp-server' && isLegacyDocxMcpLaunch(config)
}

export function repairDocxMcpLaunch(config: McpServerConfig): McpServerConfig {
  if (!shouldRepairDocxMcpLaunch(config)) {
    return config
  }

  const entryPath = resolveDocxMcpServerEntryPath()
  if (!entryPath) {
    return config
  }

  return {
    ...config,
    name: config.name?.trim() ? config.name : 'Toolman DOCX MCP',
    command: resolveMcpNodeCommand(),
    args: [entryPath],
    type: 'stdio',
  }
}
