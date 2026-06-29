import type { ToolDefinition } from '@toolman/model-gateway'
import { getMcpServer } from '../mcp-server-config.service'
import { ensureMcpServersConnected, getMcpClientState } from '../mcp-client-manager.service'
import { encodeMcpToolName } from '../mcp-tool-utils'
import { BUILTIN_MCP_TOOL_DEFS } from './builtin-mcp-defs'
import {
  AUTONOMOUS_TASK_TOOL_DEFS,
  LOCAL_KNOWLEDGE_TOOL_DEFS,
  MEMORY_TOOL_DEFS,
  NOTES_TOOL_DEFS,
  PREAUTH_TOOL_DEFS,
} from './optional-tool-defs'
import type { ResolveToolOptions } from './types'

function normalizeToolParameters(schema?: Record<string, unknown>): Record<string, unknown> {
  if (!schema || typeof schema !== 'object') {
    return { type: 'object', properties: {} }
  }
  if (schema.type === 'object') {
    return schema
  }
  return {
    type: 'object',
    properties: (schema.properties as Record<string, unknown> | undefined) ?? {},
    required: schema.required,
  }
}

function mcpToolToDefinition(
  serverId: string,
  serverName: string,
  tool: { name: string; description?: string; inputSchema?: Record<string, unknown> },
): ToolDefinition {
  return {
    type: 'function',
    function: {
      name: encodeMcpToolName(serverId, tool.name),
      description: `[${serverName}] ${tool.description ?? tool.name}`,
      parameters: normalizeToolParameters(tool.inputSchema),
    },
  }
}

function isRemoteMcpType(type: string | undefined): boolean {
  return type === 'stdio' || type === 'sse' || type === 'streamableHttp'
}

function appendUniqueTools(
  tools: ToolDefinition[],
  seen: Set<string>,
  defs: ToolDefinition[],
): void {
  for (const tool of defs) {
    if (seen.has(tool.function.name)) continue
    seen.add(tool.function.name)
    tools.push(tool)
  }
}

export async function resolveToolDefinitions(
  mcpServerIds: string[],
  options?: ResolveToolOptions,
): Promise<ToolDefinition[]> {
  const tools: ToolDefinition[] = [...PREAUTH_TOOL_DEFS]
  const seen = new Set(tools.map((tool) => tool.function.name))

  await ensureMcpServersConnected(mcpServerIds)

  for (const serverId of mcpServerIds) {
    const config = getMcpServer(serverId)
    if (!config?.enabled) continue

    if (config.type === 'builtin') {
      const builtinId = config.builtinId ?? serverId
      appendUniqueTools(tools, seen, BUILTIN_MCP_TOOL_DEFS[builtinId] ?? [])
      continue
    }

    if (!isRemoteMcpType(config.type)) continue

    const active = getMcpClientState(serverId)
    if (!active?.connected) continue

    const result = await active.client.listTools()
    for (const tool of result.tools) {
      const encodedName = encodeMcpToolName(serverId, tool.name)
      if (seen.has(encodedName)) continue
      seen.add(encodedName)
      tools.push(mcpToolToDefinition(serverId, config.name, tool))
    }
  }

  if (options?.memoryEnabled) {
    appendUniqueTools(tools, seen, MEMORY_TOOL_DEFS)
  }

  if (options?.localKnowledgeEnabled) {
    appendUniqueTools(tools, seen, LOCAL_KNOWLEDGE_TOOL_DEFS)
  }

  if (options?.notesEnabled !== false) {
    appendUniqueTools(tools, seen, NOTES_TOOL_DEFS)
  }

  if (options?.autonomousMode) {
    appendUniqueTools(tools, seen, AUTONOMOUS_TASK_TOOL_DEFS)
  }

  return tools
}

export async function hasConfiguredTools(
  mcpServerIds: string[],
  options?: ResolveToolOptions,
): Promise<boolean> {
  const tools = await resolveToolDefinitions(mcpServerIds, options)
  return tools.length > PREAUTH_TOOL_DEFS.length
}
