import type { IncomingMessage, ServerResponse } from 'node:http'
import { logStructured } from '../structured-log.service'
import { toErrorMessage } from '@toolman/shared'
import type { ImChannelConfig } from '@toolman/shared'
import type { ChannelAdapter, ChannelAdapterContext, ChannelRuntimeStatus } from './adapter.types'

interface DiscordHelloPayload {
  op: number
  t?: string
  d?: {
    heartbeat_interval?: number
    session_id?: string
    id?: string
    content?: string
    channel_id?: string
    author?: { bot?: boolean }
  }
}

export class DiscordChannelAdapter implements ChannelAdapter {
  readonly platform = 'discord' as const

  private ctx: ChannelAdapterContext | null = null
  private config: ImChannelConfig | null = null
  private status: ChannelRuntimeStatus = 'stopped'
  private statusMessage?: string
  private lastEventAt?: number
  private ws: WebSocket | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private sequence: number | null = null

  async start(config: ImChannelConfig, ctx: ChannelAdapterContext): Promise<void> {
    this.ctx = ctx
    this.config = config
    this.status = 'connecting'
    this.statusMessage = '正在连接 Discord Gateway'

    const token = config.appSecret.trim()
    if (!token) {
      this.status = 'error'
      this.statusMessage = '请填写 Bot Token（应用密钥）'
      return
    }

    await this.connectGateway(token)
  }

  async stop(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.status = 'stopped'
    this.statusMessage = undefined
    this.ctx = null
    this.config = null
  }

  async test(config: ImChannelConfig): Promise<{ ok: boolean; message: string }> {
    const token = config.appSecret.trim()
    if (!token) return { ok: false, message: '请填写 Bot Token（应用密钥）' }

    try {
      const response = await fetch('https://discord.com/api/v10/users/@me', {
        headers: { Authorization: `Bot ${token}` },
      })
      if (!response.ok) {
        return { ok: false, message: 'Discord Bot Token 无效' }
      }
      const data = (await response.json()) as { username?: string }
      return { ok: true, message: `Discord Bot 验证通过：${data.username ?? 'bot'}` }
    } catch (error) {
      return {
        ok: false,
        message: toErrorMessage(error, 'Discord 验证失败'),
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

  async handleHttpRequest(_req: IncomingMessage, _res: ServerResponse): Promise<boolean> {
    return false
  }

  private async connectGateway(token: string): Promise<void> {
    await this.stopInternal()

    const ws = new WebSocket('wss://gateway.discord.gg/?v=10&encoding=json')
    this.ws = ws

    ws.addEventListener('open', () => {
      this.status = 'connecting'
      this.statusMessage = 'Discord Gateway 握手中'
    })

    ws.addEventListener('message', (event) => {
      void this.handleGatewayMessage(token, String(event.data))
    })

    ws.addEventListener('close', () => {
      if (this.status !== 'stopped') {
        this.status = 'error'
        this.statusMessage = 'Discord Gateway 已断开'
      }
    })

    ws.addEventListener('error', () => {
      this.status = 'error'
      this.statusMessage = 'Discord Gateway 连接错误'
    })
  }

  private async stopInternal(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  private async handleGatewayMessage(token: string, raw: string): Promise<void> {
    const payload = JSON.parse(raw) as DiscordHelloPayload

    if (payload.op === 10) {
      const interval = payload.d?.heartbeat_interval ?? 41250
      this.heartbeatTimer = setInterval(() => {
        this.ws?.send(JSON.stringify({ op: 1, d: this.sequence }))
      }, interval)

      this.ws?.send(
        JSON.stringify({
          op: 2,
          d: {
            token: `Bot ${token}`,
            intents: 1 << 15,
            properties: {
              os: process.platform,
              browser: 'toolman',
              device: 'toolman',
            },
          },
        }),
      )
      return
    }

    if (payload.op === 0 && payload.t === 'READY') {
      this.status = 'connected'
      this.statusMessage = 'Discord Gateway 已连接'
      return
    }

    if (payload.op === 0 && payload.t === 'MESSAGE_CREATE') {
      const message = payload.d
      if (!message?.channel_id || !message.content || message.author?.bot) return

      this.lastEventAt = Date.now()
      const config = this.config
      const ctx = this.ctx
      if (!config || !ctx) return

      void (async () => {
        try {
          const reply = await ctx.onInboundMessage({
            platform: 'discord',
            chatId: message.channel_id!,
            text: message.content!,
            config,
          })
          if (reply.trim()) {
            await this.sendText(token, message.channel_id!, reply)
          }
        } catch (error) {
          logStructured('discord.channel', 'error', `[discord-channel]`, { detail: error })
          this.status = 'error'
          this.statusMessage = toErrorMessage(error, 'Discord 消息处理失败')
        }
      })()
    }

    if (typeof payload.d === 'object' && payload.d && 'id' in payload.d && payload.t) {
      const maybeSeq = Number((payload as { s?: number }).s)
      if (!Number.isNaN(maybeSeq)) this.sequence = maybeSeq
    }
  }

  private async sendText(token: string, channelId: string, text: string): Promise<void> {
    const chunks = splitDiscordMessage(text)
    for (const chunk of chunks) {
      const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bot ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: chunk }),
      })
      if (!response.ok) {
        const body = await response.text()
        throw new Error(`Discord 发送失败: ${body}`)
      }
    }
  }
}

function splitDiscordMessage(text: string, maxLen = 1900): string[] {
  if (text.length <= maxLen) return [text]
  const chunks: string[] = []
  let rest = text
  while (rest.length > maxLen) {
    chunks.push(rest.slice(0, maxLen))
    rest = rest.slice(maxLen)
  }
  if (rest) chunks.push(rest)
  return chunks
}
