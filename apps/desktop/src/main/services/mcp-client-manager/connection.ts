import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { toErrorMessage } from '@toolman/shared'
import { getMcpServer } from '../mcp-server-config.service'
import { resolveMcpServerRuntimeConfig } from '../mcp-runtime-config.service'
import {
  isPostgresMcpConfig,
  verifyPostgresMcpDatabase,
} from '../mcp-postgres-verify.service'
import {
  activeClients,
  connecting,
  isConnectableType,
  BUILTIN_TOOL_COUNTS,
} from './types'
import {
  configFingerprint,
  createMcpClient,
  createPlaceholderTransport,
} from './transport'

export async function connectMcpServer(serverId: string) {
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

export function getMcpClientState(serverId: string) {
  return activeClients.get(serverId) ?? null
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
