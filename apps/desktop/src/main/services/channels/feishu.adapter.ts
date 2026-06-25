import type { IncomingMessage, ServerResponse } from 'node:http'
import { logStructured } from '../structured-log.service'
import { toErrorMessage } from '@toolman/shared'
import type { ImChannelConfig } from '@toolman/shared'
import type { ChannelAdapter, ChannelAdapterContext, ChannelRuntimeStatus } from './adapter.types'

interface FeishuTokenResponse {
  code?: number
  msg?: string
  tenant_access_token?: string
  expire?: number
}

interface FeishuEventPayload {
  challenge?: string
  schema?: string
  header?: {
    event_type?: string
  }
  event?: {
    message?: {
      chat_id?: string
      message_type?: string
      content?: string
    }
  }
}

function readJsonBody<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8')
        resolve(raw ? (JSON.parse(raw) as T) : ({} as T))
      } catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
  })
}

function parseFeishuText(content: string | undefined): string {
  if (!content) return ''
  try {
    const parsed = JSON.parse(content) as { text?: string }
    return parsed.text?.trim() ?? ''
  } catch {
    return content.trim()
  }
}

async function fetchTenantAccessToken(config: ImChannelConfig): Promise<string> {
  const response = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      app_id: config.appId,
      app_secret: config.appSecret,
    }),
  })

  const data = (await response.json()) as FeishuTokenResponse
  if (!response.ok || data.code !== 0 || !data.tenant_access_token) {
    throw new Error(data.msg ?? '获取飞书 tenant_access_token 失败')
  }
  return data.tenant_access_token
}

export class FeishuChannelAdapter implements ChannelAdapter {
  readonly platform = 'feishu' as const

  private ctx: ChannelAdapterContext | null = null
  private status: ChannelRuntimeStatus = 'stopped'
  private statusMessage?: string
  private lastEventAt?: number
  private tokenCache: { value: string; expiresAt: number } | null = null

  async start(config: ImChannelConfig, ctx: ChannelAdapterContext): Promise<void> {
    this.ctx = ctx
    this.status = 'connecting'
    this.statusMessage = '等待飞书事件回调'

    if (!config.appId.trim() || !config.appSecret.trim()) {
      this.status = 'error'
      this.statusMessage = '请填写应用 ID 与应用密钥'
      return
    }

    try {
      await fetchTenantAccessToken(config)
      this.status = 'connected'
      this.statusMessage = `Webhook: ${ctx.webhookBaseUrl}/feishu/events`
    } catch (error) {
      this.status = 'error'
      this.statusMessage = toErrorMessage(error, '飞书连接失败')
    }
  }

  async stop(): Promise<void> {
    this.status = 'stopped'
    this.statusMessage = undefined
    this.ctx = null
    this.tokenCache = null
  }

  async test(config: ImChannelConfig): Promise<{ ok: boolean; message: string }> {
    if (!config.appId.trim() || !config.appSecret.trim()) {
      return { ok: false, message: '请填写应用 ID 与应用密钥' }
    }
    try {
      await fetchTenantAccessToken(config)
      return { ok: true, message: '飞书凭据验证通过' }
    } catch (error) {
      return {
        ok: false,
        message: toErrorMessage(error, '飞书凭据验证失败'),
      }
    }
  }

  getStatus() {
    return {
      status: this.status,
      message: this.statusMessage,
      lastEventAt: this.lastEventAt,
    }
  }

  async handleHttpRequest(
    req: IncomingMessage,
    res: ServerResponse,
    config: ImChannelConfig,
  ): Promise<boolean> {
    if (req.method !== 'POST') return false

    const payload = await readJsonBody<FeishuEventPayload>(req)

    if (payload.challenge) {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ challenge: payload.challenge }))
      return true
    }

    if (payload.header?.event_type !== 'im.message.receive_v1') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
      return true
    }

    const message = payload.event?.message
    const chatId = message?.chat_id
    const text = parseFeishuText(message?.content)

    if (!chatId || !text || message?.message_type !== 'text') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ ok: true }))
      return true
    }

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true }))

    this.lastEventAt = Date.now()
    void this.handleInbound(config, chatId, text)
    return true
  }

  private async handleInbound(config: ImChannelConfig, chatId: string, text: string): Promise<void> {
    if (!this.ctx) return

    try {
      const reply = await this.ctx.onInboundMessage({
        platform: 'feishu',
        chatId,
        text,
        config,
      })
      if (reply.trim()) {
        await this.sendText(config, chatId, reply)
      }
    } catch (error) {
      const message = toErrorMessage(error, '处理飞书消息失败')
      this.status = 'error'
      this.statusMessage = message
      logStructured('feishu.channel', 'error', `[feishu-channel]`, { detail: error })
    }
  }

  private async getToken(config: ImChannelConfig): Promise<string> {
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now()) {
      return this.tokenCache.value
    }
    const value = await fetchTenantAccessToken(config)
    this.tokenCache = { value, expiresAt: Date.now() + 50 * 60 * 1000 }
    return value
  }

  private async sendText(config: ImChannelConfig, chatId: string, text: string): Promise<void> {
    const token = await this.getToken(config)
    const response = await fetch(
      `https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          receive_id: chatId,
          msg_type: 'text',
          content: JSON.stringify({ text }),
        }),
      },
    )

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`飞书发送失败: ${body}`)
    }
  }
}
