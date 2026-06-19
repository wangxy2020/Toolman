import { BUILTIN_MCP_TOOL_DEFS } from './tool-registry'
import { getMcpServer } from './mcp-server-config.service'
import { listMcpServerTools } from './mcp-client-manager.service'
import { encodeMcpToolName } from './mcp-tool-utils'
import type { ToolExecutionContext } from './tool-executor.service'

interface HubToolEntry {
  id: string
  serverId: string
  serverName: string
  toolName: string
  description?: string
}

async function collectHubTools(mcpServerIds: string[]): Promise<HubToolEntry[]> {
  const entries: HubToolEntry[] = []

  for (const serverId of mcpServerIds) {
    if (serverId === 'hub') continue
    const config = getMcpServer(serverId)
    if (!config?.enabled) continue

    if (config.type === 'builtin') {
      const builtinId = config.builtinId ?? serverId
      for (const tool of BUILTIN_MCP_TOOL_DEFS[builtinId] ?? []) {
        entries.push({
          id: tool.function.name,
          serverId,
          serverName: config.name,
          toolName: tool.function.name,
          description: tool.function.description,
        })
      }
      continue
    }

    if (config.type === 'stdio' || config.type === 'sse' || config.type === 'streamableHttp') {
      // remote tools collected below
    }
  }

  const remote = await listMcpServerTools(mcpServerIds.filter((id) => id !== 'hub'))
  for (const item of remote.items) {
    const config = getMcpServer(item.serverId)
    entries.push({
      id: encodeMcpToolName(item.serverId, item.name),
      serverId: item.serverId,
      serverName: config?.name ?? item.serverId,
      toolName: item.name,
      description: item.description,
    })
  }

  return entries.sort((a, b) => a.id.localeCompare(b.id))
}

export async function hubList(
  args: Record<string, unknown>,
  mcpServerIds: string[],
): Promise<string> {
  const limit = Math.min(Math.max(Number(args.limit) || 30, 1), 100)
  const offset = Math.max(Number(args.offset) || 0, 0)

  const tools = await collectHubTools(mcpServerIds)
  const slice = tools.slice(offset, offset + limit)

  if (slice.length === 0) return '当前没有可用的 MCP 工具。'

  const lines = slice.map(
    (tool) =>
      `- ${tool.id} (${tool.serverName}/${tool.toolName})${tool.description ? `: ${tool.description}` : ''}`,
  )

  const header = `共 ${tools.length} 个工具，显示 ${offset + 1}-${offset + slice.length}:`
  return `${header}\n\n${lines.join('\n')}`
}

export async function hubInvoke(
  args: Record<string, unknown>,
  context: ToolExecutionContext,
  mcpServerIds: string[],
): Promise<string> {
  const name = String(args.name ?? '').trim()
  if (!name) throw new Error('缺少 name')

  const tools = await collectHubTools(mcpServerIds)
  const tool =
    tools.find((item) => item.id === name) ??
    tools.find((item) => item.toolName === name) ??
    tools.find((item) => `${item.serverId}__${item.toolName}` === name)

  if (!tool) {
    throw new Error(`未找到工具: ${name}，请先调用 hub_list 查看可用工具`)
  }

  const params =
    args.params && typeof args.params === 'object'
      ? (args.params as Record<string, unknown>)
      : {}

  const { executeToolCall } = await import('./tool-executor.service')
  return executeToolCall(tool.id, JSON.stringify(params), {
    ...context,
    mcpServerIds,
  })
}
