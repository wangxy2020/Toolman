import {
  McpServerDeleteInputSchema,
  McpServerInspectInputSchema,
  McpServerTestInputSchema,
  McpToolsListInputSchema,
} from '@toolman/shared'
import {
  deleteMcpServer,
  getMcpServer,
  invalidateMcpServerCache,
  listMcpServers,
  upsertMcpServer,
} from './mcp-server-config.service'
import {
  inspectMcpServer,
  listMcpServerTools,
  resetMcpClientsForConfigChange,
  testMcpServer,
} from './mcp-client-manager.service'
import { BUILTIN_MCP_TOOL_DEFS } from './tool-registry'

export function listServers() {
  return { items: listMcpServers() }
}

export function upsertServer(input: unknown) {
  const server = upsertMcpServer(input)
  invalidateMcpServerCache()
  resetMcpClientsForConfigChange(server.id)
  return server
}

export function removeServer(input: unknown) {
  const { id } = McpServerDeleteInputSchema.parse(input)
  const deleted = deleteMcpServer(input)
  if (deleted) {
    invalidateMcpServerCache()
    resetMcpClientsForConfigChange(id)
  }
  return { deleted }
}

export async function testServer(input: unknown) {
  const { id } = McpServerTestInputSchema.parse(input)
  return testMcpServer(id)
}

export async function listTools(input: unknown) {
  const { serverIds } = McpToolsListInputSchema.parse(input)
  return listMcpServerTools(serverIds)
}

export async function inspectServer(input: unknown) {
  const { id } = McpServerInspectInputSchema.parse(input)
  const config = getMcpServer(id)
  if (!config) {
    return { tools: [], prompts: [], resources: [] }
  }

  if (config.type === 'builtin') {
    const builtinId = config.builtinId ?? id
    const defs = BUILTIN_MCP_TOOL_DEFS[builtinId] ?? []
    return {
      tools: defs.map((def) => ({
        serverId: id,
        name: def.function.name,
        description: def.function.description,
      })),
      prompts: [],
      resources: [],
    }
  }

  return inspectMcpServer(id)
}
