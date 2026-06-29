import { getMcpServer } from '../mcp-server-config.service'
import { activeClients, isConnectableType } from './types'
import { connectMcpServer, ensureMcpServersConnected } from './connection'

export async function inspectMcpServer(serverId: string) {
  const config = getMcpServer(serverId)
  if (!config || !isConnectableType(config.type)) {
    return { tools: [], prompts: [], resources: [] }
  }

  try {
    const active = await connectMcpServer(serverId)
    const [toolsResult, promptsResult, resourcesResult] = await Promise.all([
      active.client.listTools(),
      active.client.listPrompts().catch(() => ({ prompts: [] as Array<{ name: string; description?: string }> })),
      active.client.listResources().catch(() => ({ resources: [] as Array<{ name: string; uri: string; description?: string }> })),
    ])

    return {
      tools: toolsResult.tools.map((tool) => ({
        serverId,
        name: tool.name,
        description: tool.description,
      })),
      prompts: promptsResult.prompts.map((prompt) => ({
        name: prompt.name,
        description: prompt.description,
      })),
      resources: resourcesResult.resources.map((resource) => ({
        name: resource.name,
        uri: resource.uri,
        description: resource.description,
      })),
    }
  } catch {
    return { tools: [], prompts: [], resources: [] }
  }
}

export async function listMcpServerTools(serverIds: string[]) {
  await ensureMcpServersConnected(serverIds)
  const items: Array<{ serverId: string; name: string; description?: string }> = []

  for (const serverId of serverIds) {
    const config = getMcpServer(serverId)
    if (!config?.enabled || !isConnectableType(config.type)) continue

    const active = activeClients.get(serverId)
    if (!active?.connected) continue
    const result = await active.client.listTools()
    for (const tool of result.tools) {
      items.push({
        serverId,
        name: tool.name,
        description: tool.description,
      })
    }
  }

  return { items }
}

function formatToolResult(result: unknown): string {
  const payload =
    result && typeof result === 'object'
      ? (result as { content?: Array<{ type: string; text?: string }>; isError?: boolean })
      : {}
  const chunks: string[] = []
  for (const block of payload.content ?? []) {
    if (block.type === 'text' && block.text) {
      chunks.push(block.text)
    } else if (block.type === 'resource' || block.type === 'image') {
      chunks.push(`[${block.type} content omitted]`)
    }
  }

  const text = chunks.join('\n').trim()
  if (payload.isError) {
    return text ? `Error: ${text}` : 'Error: 工具执行失败'
  }
  return text || '(无输出)'
}

export async function callMcpServerTool(
  serverId: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<string> {
  const active = await connectMcpServer(serverId)
  if (!active.connected) {
    throw new Error(active.lastError ?? `MCP 服务器 ${serverId} 未连接`)
  }

  const result = await active.client.callTool({
    name: toolName,
    arguments: args,
  })

  return formatToolResult(result)
}
