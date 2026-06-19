import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { ChannelPlatformId, ImChannelConfig } from '@toolman/shared'
import { CHANNEL_PLATFORMS } from '@toolman/shared'
import {
  getImChannelConfig,
  getWebhookPort,
  listEnabledImChannelConfigs,
} from '../channel-config.service'
import { handleInboundChannelMessage } from '../channel-agent.service'
import type { ChannelAdapter } from './adapter.types'
import { FeishuChannelAdapter } from './feishu.adapter'
import { DiscordChannelAdapter } from './discord.adapter'
import { DingtalkChannelAdapter } from './dingtalk.adapter'
import { WechatChannelAdapter } from './wechat.adapter'
import { createUnsupportedAdapters } from './unsupported.adapter'

const adapters = new Map<ChannelPlatformId, ChannelAdapter>([
  ['feishu', new FeishuChannelAdapter()],
  ['discord', new DiscordChannelAdapter()],
  ['dingtalk', new DingtalkChannelAdapter()],
  ['wechat', new WechatChannelAdapter()],
  ...createUnsupportedAdapters().map((adapter) => [adapter.platform, adapter] as const),
])

let httpServer: Server | null = null
let started = false

function getWebhookBaseUrl(port: number): string {
  return `http://127.0.0.1:${port}/channels`
}

function writeJson(res: ServerResponse, statusCode: number, body: unknown): void {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

async function routeHttpRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', getWebhookBaseUrl(getWebhookPort()))
  const segments = url.pathname.split('/').filter(Boolean)

  if (segments[0] !== 'channels') {
    writeJson(res, 404, { error: 'Not found' })
    return
  }

  const platform = segments[1] as ChannelPlatformId | undefined
  if (!platform) {
    writeJson(res, 200, {
      ok: true,
      platforms: CHANNEL_PLATFORMS.map((item) => item.id),
    })
    return
  }

  const config = getImChannelConfig(platform)
  if (!config?.enabled) {
    writeJson(res, 503, { error: 'Channel disabled' })
    return
  }

  const adapter = adapters.get(platform)
  if (!adapter?.handleHttpRequest) {
    writeJson(res, 501, { error: 'Platform does not support HTTP webhook' })
    return
  }

  const handled = await adapter.handleHttpRequest(req, res, config)
  if (!handled) {
    writeJson(res, 404, { error: 'Route not found' })
  }
}

async function startAdapter(platform: ChannelPlatformId, config: ImChannelConfig): Promise<void> {
  const adapter = adapters.get(platform)
  if (!adapter) return

  const port = getWebhookPort()
  const webhookBaseUrl = getWebhookBaseUrl(port)

  await adapter.start(config, {
    webhookBaseUrl,
    onInboundMessage: async ({ chatId, text, config: inboundConfig }) => {
      return handleInboundChannelMessage({
        platform,
        chatId,
        text,
        assistantId: inboundConfig.assistantId,
        allowedChatIds: inboundConfig.allowedChatIds,
      })
    },
    updateStatus: () => {
      // status tracked inside adapter
    },
  })
}

async function stopAdapter(platform: ChannelPlatformId): Promise<void> {
  const adapter = adapters.get(platform)
  if (!adapter) return
  await adapter.stop()
}

function ensureHttpServer(): void {
  if (httpServer) return

  httpServer = createServer((req, res) => {
    void routeHttpRequest(req, res).catch((error) => {
      console.error('[channel-http]', error)
      writeJson(res, 500, { error: 'Internal server error' })
    })
  })

  httpServer.on('error', (error) => {
    console.error('[channel-http] server error:', error)
  })
}

export async function startChannelManager(): Promise<void> {
  if (started) {
    await reloadChannelManager()
    return
  }

  ensureHttpServer()
  const port = getWebhookPort()

  await new Promise<void>((resolve, reject) => {
    if (!httpServer) return reject(new Error('HTTP server not initialized'))
    httpServer.listen(port, '127.0.0.1', () => resolve())
    httpServer.once('error', reject)
  })

  started = true
  await reloadChannelManager()
}

export async function reloadChannelManager(): Promise<void> {
  for (const platform of adapters.keys()) {
    await stopAdapter(platform)
  }

  const enabled = listEnabledImChannelConfigs()
  for (const config of enabled) {
    if (!config.assistantId.trim()) continue
    await startAdapter(config.platform, config)
  }
}

export async function stopChannelManager(): Promise<void> {
  for (const platform of adapters.keys()) {
    await stopAdapter(platform)
  }

  if (httpServer) {
    await new Promise<void>((resolve) => {
      httpServer?.close(() => resolve())
    })
    httpServer = null
  }

  started = false
}

export function getChannelWebhookInfo() {
  const port = getWebhookPort()
  const baseUrl = getWebhookBaseUrl(port)
  return {
    port,
    baseUrl,
    paths: Object.fromEntries(
      CHANNEL_PLATFORMS.map((platform) => [platform.id, `${baseUrl}/${platform.id}/events`]),
    ),
  }
}

export function listChannelRuntimeStatuses() {
  return CHANNEL_PLATFORMS.map((platform) => {
    const adapter = adapters.get(platform.id)
    const status = adapter?.getStatus() ?? { status: 'stopped' as const }
    return {
      platform: platform.id,
      status: status.status,
      message: status.message,
      lastEventAt: status.lastEventAt,
    }
  })
}

export async function testChannelConnection(platform: ChannelPlatformId) {
  const config = getImChannelConfig(platform) ?? {
    platform,
    enabled: false,
    name: platform,
    assistantId: '',
    appId: '',
    appSecret: '',
    encryptKey: '',
    verificationToken: '',
    domain: '',
    allowedChatIds: '',
  }

  const adapter = adapters.get(platform)
  if (!adapter) {
    return { ok: false, message: '未知平台' }
  }

  return adapter.test(config)
}

export function getChannelWebhookBaseUrl(): string {
  return getWebhookBaseUrl(getWebhookPort())
}
