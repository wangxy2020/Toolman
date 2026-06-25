import type { McpServerConfig } from './ipc/mcp.js'

type PresetProbe = Pick<McpServerConfig, 'id' | 'type' | 'command' | 'args'>

/** 官方 MCP 服务器卡片中的 preset ID（不含 local-db） */
export const OFFICIAL_MCP_PRESET_IDS = [
  'fetch',
  'memory',
  'python',
  'brave-search',
  'docx-mcp-server',
  'excel-mcp-server',
] as const

export type OfficialMcpPresetId = (typeof OFFICIAL_MCP_PRESET_IDS)[number]

export function matchOfficialMcpPresetId(server: PresetProbe): OfficialMcpPresetId | null {
  if (server.type !== 'stdio') return null

  const args = server.args ?? []
  const joined = args.join(' ')

  if (server.command === 'uvx' && args.includes('mcp-server-fetch')) return 'fetch'
  if (server.command === 'uvx' && (args.includes('mcp-python-interpreter') || args.includes('mcp-server-python'))) {
    return 'python'
  }
  if (server.command === 'npx' && joined.includes('@modelcontextprotocol/server-memory')) {
    return 'memory'
  }
  if (server.command === 'npx' && joined.includes('@modelcontextprotocol/server-brave-search')) {
    return 'brave-search'
  }
  if (server.command === 'npx' && args.includes('docx-mcp-server')) {
    return 'docx-mcp-server'
  }
  if (server.id === 'excel-mcp-server') {
    return 'excel-mcp-server'
  }
  if (server.command === 'node' && args.some((arg) => arg.includes('excelServer.js'))) {
    return 'excel-mcp-server'
  }

  return null
}

/** 自定义区中与官方 preset 重复的条目（例如手动添加的 Fetch uvx） */
export function isDuplicateOfficialMcpPreset(server: PresetProbe): boolean {
  const presetId = matchOfficialMcpPresetId(server)
  return presetId !== null && server.id !== presetId
}
