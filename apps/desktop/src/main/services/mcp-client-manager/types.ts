import type { McpServerConfig } from '@toolman/shared'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

export type McpTransport = StdioClientTransport | SSEClientTransport | StreamableHTTPClientTransport

export interface ActiveMcpClient {
  config: McpServerConfig
  client: Client
  transport: McpTransport
  connected: boolean
  toolCount: number
  serverName?: string
  serverVersion?: string
  lastError?: string
}

export const activeClients = new Map<string, ActiveMcpClient>()
export const connecting = new Map<string, Promise<ActiveMcpClient>>()

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
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

export function isConnectableType(type: McpServerConfig['type'] | undefined): boolean {
  return type === 'stdio' || type === 'sse' || type === 'streamableHttp'
}

export const BUILTIN_TOOL_COUNTS: Record<string, number> = {
  filesystem: 7,
  browser: 5,
  github: 1,
  sqlite: 2,
  dify: 2,
  hub: 2,
}
