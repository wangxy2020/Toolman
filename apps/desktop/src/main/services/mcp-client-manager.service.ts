import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { toErrorMessage } from '@toolman/shared'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { McpServerConfig } from '@toolman/shared'
import { getMcpServer } from './mcp-server-config.service'
import { resolveMcpServerRuntimeConfig } from './mcp-runtime-config.service'
import { resolveMcpNodeCommand, resolveMcpNodeEnv } from './mcp-node-runtime'
import {
  isPostgresMcpConfig,
  postgresMcpConfigFingerprint,
  verifyPostgresMcpDatabase,
} from './mcp-postgres-verify.service'

type McpTransport = StdioClientTransport | SSEClientTransport | StreamableHTTPClientTransport

interface ActiveMcpClient {
  config: McpServerConfig
  client: Client
  transport: McpTransport
  connected: boolean
  toolCount: number
  serverName?: string
  serverVersion?: string
  lastError?: string
}

const activeClients = new Map<string, ActiveMcpClient>()
const connecting = new Map<string, Promise<ActiveMcpClient>>()

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} 连接超时`)), ms)
    promise
      .then((value) => {
        clearTimeout(timer)
        resolve(value)
      })
      .catch((error) => {
        clearTimeout(timer)
        reject(error)
      })
  })
}

function configFingerprint(config: McpServerConfig): string {
  if (isPostgresMcpConfig(config)) {
    return postgresMcpConfigFingerprint(config)
  }
  return JSON.stringify({
    type: config.type,
    command: config.command,
    args: config.args,
    env: config.env,
    cwd: config.cwd,
    url: config.url,
  })
}

function createPlaceholderTransport(config: McpServerConfig): McpTransport {
  if (config.type === 'stdio') {
    return new StdioClientTransport({ command: 'false', args: [] })
  }
  const url = config.url?.trim() || 'http://127.0.0.1:0/mcp'
  if (config.type === 'streamableHttp') {
    return new StreamableHTTPClientTransport(new URL(url))
  }
  return new SSEClientTransport(new URL(url))
}

async function createTransport(config: McpServerConfig): Promise<McpTransport> {
  if (config.type === 'stdio') {
    if (!config.command?.trim()) {
      throw new Error('stdio MCP 服务器缺少 command')
    }
    const command =
      config.command === 'node' ? resolveMcpNodeCommand() : config.command
    return new StdioClientTransport({
      command,
      args: config.args ?? [],
      env: {
        ...resolveMcpNodeEnv(
          Object.fromEntries(
            Object.entries(process.env).filter(
              (entry): entry is [string, string] => entry[1] != null,
            ),
          ),
        ),
        ...config.env,
      },
      cwd: config.cwd,
      stderr: 'pipe',
    })
  }

  if (!config.url?.trim()) {
    throw new Error(`${config.type} MCP 服务器缺少 url`)
  }

  const url = new URL(config.url)
  const headers = config.env ?? {}
  const requestInit: RequestInit = {
    headers,
  }

  if (config.type === 'streamableHttp') {
    return new StreamableHTTPClientTransport(url, { requestInit })
  }

  if (config.type === 'sse') {
    return new SSEClientTransport(url, { requestInit })
  }

  throw new Error(`不支持的 MCP 传输类型: ${config.type}`)
}

async function createMcpClient(config: McpServerConfig): Promise<ActiveMcpClient> {
  const client = new Client({ name: 'toolman', version: '0.1.0' })
  const transport = await createTransport(config)

  await withTimeout(
    client.connect(transport),
    (config.timeoutSeconds ?? 15) * 1000,
    config.name,
  )

  const toolsResult = await client.listTools()
  const version = client.getServerVersion()

  const active: ActiveMcpClient = {
    config,
    client,
    transport,
    connected: true,
    toolCount: toolsResult.tools.length,
    serverName: version?.name,
    serverVersion: version?.version,
  }

  if (isPostgresMcpConfig(config)) {
    await verifyPostgresMcpDatabase(client, config)
  }

  return active
}

function isConnectableType(type: McpServerConfig['type'] | undefined): boolean {
  return type === 'stdio' || type === 'sse' || type === 'streamableHttp'
}

export async function connectMcpServer(serverId: string): Promise<ActiveMcpClient> {
  const rawConfig = getMcpServer(serverId)
  if (!rawConfig) {
    throw new Error(`MCP 服务器 ${serverId} 不存在`)
  }
  const config = await resolveMcpServerRuntimeConfig(rawConfig)
  if (!config.enabled) {
    throw new Error(`MCP 服务器 ${config.name} 未启用`)
  }
  if (!isConnectableType(config.type)) {
    throw new Error(`MCP 服务器 ${config.name} 不是可连接的远程类型`)
  }

  const existing = activeClients.get(serverId)
  if (existing?.connected) {
    if (configFingerprint(existing.config) !== configFingerprint(config)) {
      await disconnectMcpServer(serverId)
    } else {
      if (isPostgresMcpConfig(config)) {
        try {
          await verifyPostgresMcpDatabase(existing.client, config)
        } catch (error) {
          await disconnectMcpServer(serverId)
          const message = toErrorMessage(error, '数据库连接失败')
          throw new Error(message)
        }
      }
      return existing
    }
  }

  const inflight = connecting.get(serverId)
  if (inflight) return inflight

  const promise = createMcpClient(config)
    .then((active) => {
      activeClients.set(serverId, active)
      connecting.delete(serverId)
      return active
    })
    .catch((error) => {
      connecting.delete(serverId)
      const message = toErrorMessage(error, '连接失败')
      activeClients.set(serverId, {
        config,
        client: new Client({ name: 'toolman', version: '0.1.0' }),
        transport: createPlaceholderTransport(config),
        connected: false,
        toolCount: 0,
        lastError: message,
      })
      throw error
    })

  connecting.set(serverId, promise)
  return promise
}

export async function ensureMcpServersConnected(serverIds: string[]): Promise<void> {
  const remoteIds = serverIds.filter((id) => {
    const config = getMcpServer(id)
    return config?.enabled && isConnectableType(config.type)
  })

  await Promise.all(
    remoteIds.map(async (id) => {
      try {
        await connectMcpServer(id)
      } catch {
        // leave disconnected state for status reporting
      }
    }),
  )
}

export function getMcpClientState(serverId: string): ActiveMcpClient | null {
  return activeClients.get(serverId) ?? null
}

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

export async function testMcpServer(serverId: string) {
  const config = getMcpServer(serverId)
  if (!config) {
    return { success: false, error: '服务器不存在' }
  }

  if (config.type === 'builtin') {
    const builtinId = config.builtinId ?? config.id
    const toolCount = BUILTIN_TOOL_COUNTS[builtinId] ?? 0
    return { success: true, toolCount, serverName: config.name }
  }

  try {
    await disconnectMcpServer(serverId)
    const active = await connectMcpServer(serverId)
    const version = active.client.getServerVersion()
    return {
      success: true,
      toolCount: active.toolCount,
      serverName: version?.name ?? active.serverName,
      serverVersion: version?.version ?? active.serverVersion,
    }
  } catch (error) {
    return {
      success: false,
      error: toErrorMessage(error, '连接失败'),
    }
  }
}

const BUILTIN_TOOL_COUNTS: Record<string, number> = {
  filesystem: 7,
  browser: 5,
  github: 1,
  sqlite: 2,
  dify: 2,
  hub: 2,
}

export async function disconnectMcpServer(serverId: string): Promise<void> {
  const active = activeClients.get(serverId)
  if (!active) return

  try {
    await active.client.close()
  } catch {
    // ignore close errors
  }

  activeClients.delete(serverId)
  connecting.delete(serverId)
}

export async function disconnectAllMcpServers(): Promise<void> {
  const ids = [...activeClients.keys()]
  await Promise.all(ids.map((id) => disconnectMcpServer(id)))
}

export function resetMcpClientsForConfigChange(serverId?: string): void {
  if (serverId) {
    void disconnectMcpServer(serverId)
    return
  }
  void disconnectAllMcpServers()
}

/** @deprecated use inspectMcpServer */
export const inspectStdioMcpServer = inspectMcpServer
