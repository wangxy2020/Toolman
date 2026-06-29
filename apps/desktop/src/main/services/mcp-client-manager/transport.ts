import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import type { McpServerConfig } from '@toolman/shared'
import { resolveMcpNodeCommand, resolveMcpNodeEnv } from '../mcp-node-runtime'
import { buildSandboxedInheritedEnv } from '../bash-env.util'
import {
  isPostgresMcpConfig,
  postgresMcpConfigFingerprint,
  verifyPostgresMcpDatabase,
} from '../mcp-postgres-verify.service'
import type { ActiveMcpClient, McpTransport } from './types'
import { withTimeout } from './types'

export function configFingerprint(config: McpServerConfig): string {
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

export function createPlaceholderTransport(config: McpServerConfig): McpTransport {
  if (config.type === 'stdio') {
    return new StdioClientTransport({ command: 'false', args: [] })
  }
  const url = config.url?.trim() || 'http://127.0.0.1:0/mcp'
  if (config.type === 'streamableHttp') {
    return new StreamableHTTPClientTransport(new URL(url))
  }
  return new SSEClientTransport(new URL(url))
}

export async function createTransport(config: McpServerConfig): Promise<McpTransport> {
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
        ...resolveMcpNodeEnv(buildSandboxedInheritedEnv(process.env)),
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

export async function createMcpClient(config: McpServerConfig): Promise<ActiveMcpClient> {
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
