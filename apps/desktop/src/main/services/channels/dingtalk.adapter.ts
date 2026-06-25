import type { IncomingMessage, ServerResponse } from 'node:http'
import { logStructured } from '../structured-log.service'
import { toErrorMessage } from '@toolman/shared'
import type { ImChannelConfig } from '@toolman/shared'
import type { ChannelAdapter, ChannelAdapterContext, ChannelRuntimeStatus } from './adapter.types'

interface DingTalkAccessTokenResponse {
  accessToken?: string
  expireIn?: number
}

interface DingTalkConnectionResponse {
  endpoint?: string
  ticket?: string
}

interface DingTalkBotMessage {
  msgtype?: string
  text?: { content?: string }
  conversationId?: string
  conversationType?: string
  senderStaffId?: string
  senderNick?: string
  sessionWebhook?: string
  sessionWebhookExpiredTime?: number
}

interface DingTalkStreamFrame {
  specVersion?: string
  type?: string
  headers?: Record<string, string>
  data?: string
}

async function fetchAccessToken(appKey: string, appSecret: string): Promise<string> {
  const response = await fetch('https://api.dingtalk.com/v1.0/oauth2/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ appKey, appSecret }),
  })

  const data = (await response.json()) as DingTalkAccessTokenResponse
  if (!response.ok || !data.accessToken) {
    throw new Error('获取钉钉 access token 失败，请检查 AppKey 与 AppSecret')
  }
  return data.accessToken
}

async function openStreamConnection(
  accessToken: string,
  clientId: string,
  clientSecret: string,
): Promise<DingTalkConnectionResponse> {
  const response = await fetch('https://api.dingtalk.com/v1.0/gateway/connections/open', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-acs-dingtalk-access-token': accessToken,
    },
    body: JSON.stringify({
      clientId,
      clientSecret,
      subscriptions: [{ type: 'CALLBACK', topic: '/v1.0/im/bot/messages/get' }],
      localConnection: true,
    }),
  })

  const data = (await response.json()) as DingTalkConnectionResponse & { message?: string }
  if (!response.ok || !data.endpoint || !data.ticket) {
    throw new Error(data.message ?? '打开钉钉 Stream 连接失败，请确认已启用 Stream 模式机器人')
  }
  return data
}

export class DingtalkChannelAdapter implements ChannelAdapter {
  readonly platform = 'dingtalk' as const

  private ctx: ChannelAdapterContext | null = null
  private config: ImChannelConfig | null = null
  private status: ChannelRuntimeStatus = 'stopped'
  private statusMessage?: string
  private lastEventAt?: number
  private ws: WebSocket | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private stopped = true

  async start(config: ImChannelConfig, ctx: ChannelAdapterContext): Promise<void> {
    this.ctx = ctx
    this.config = config
    this.stopped = false
    this.status = 'connecting'
    this.statusMessage = '正在连接钉钉 Stream'

    const appKey = config.appId.trim()
    const appSecret = config.appSecret.trim()
    if (!appKey || !appSecret) {
      this.status = 'error'
      this.statusMessage = '请填写 AppKey 与应用密钥'
      return
    }

    await this.connectStream(appKey, appSecret)
  }

  async stop(): Promise<void> {
    this.stopped = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
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
    const appKey = config.appId.trim()
    const appSecret = config.appSecret.trim()
    if (!appKey || !appSecret) {
      return { ok: false, message: '请填写 AppKey 与应用密钥' }
    }

    try {
      const accessToken = await fetchAccessToken(appKey, appSecret)
      await openStreamConnection(accessToken, appKey, appSecret)
      return { ok: true, message: '钉钉凭据验证通过（Stream 模式）' }
    } catch (error) {
      return {
        ok: false,
        message: toErrorMessage(error, '钉钉凭据验证失败'),
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

  private async connectStream(appKey: string, appSecret: string): Promise<void> {
    if (this.stopped) return

    if (this.ws) {
      this.ws.close()
      this.ws = null
    }

    try {
      const accessToken = await fetchAccessToken(appKey, appSecret)
      const connection = await openStreamConnection(accessToken, appKey, appSecret)
      const endpoint = connection.endpoint!.includes('?')
        ? `${connection.endpoint}&ticket=${connection.ticket}`
        : `${connection.endpoint}?ticket=${connection.ticket}`

      const ws = new WebSocket(endpoint)
      this.ws = ws

      ws.addEventListener('open', () => {
        this.status = 'connected'
        this.statusMessage = '钉钉 Stream 已连接'
      })

      ws.addEventListener('message', (event) => {
        void this.handleStreamMessage(String(event.data))
      })

      ws.addEventListener('close', () => {
        this.ws = null
        if (this.stopped) return
        this.status = 'connecting'
        this.statusMessage = '钉钉 Stream 已断开，正在重连…'
        this.scheduleReconnect(appKey, appSecret)
      })

      ws.addEventListener('error', () => {
        if (!this.stopped) {
          this.status = 'error'
          this.statusMessage = '钉钉 Stream 连接错误'
        }
      })
    } catch (error) {
      this.status = 'error'
      this.statusMessage = toErrorMessage(error, '钉钉连接失败')
      if (!this.stopped) {
        this.scheduleReconnect(appKey, appSecret)
      }
    }
  }

  private scheduleReconnect(appKey: string, appSecret: string): void {
    if (this.reconnectTimer || this.stopped) return
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      void this.connectStream(appKey, appSecret)
    }, 5000)
  }

  private async handleStreamMessage(raw: string): Promise<void> {
    let frame: DingTalkStreamFrame
    try {
      frame = JSON.parse(raw) as DingTalkStreamFrame
    } catch {
      return
    }

    if (frame.type !== 'CALLBACK' || !frame.data) return

    let message: DingTalkBotMessage
    try {
      message = JSON.parse(frame.data) as DingTalkBotMessage
    } catch {
      return
    }

    if (message.msgtype !== 'text') return
    const text = message.text?.content?.trim()
    if (!text) return

    const chatId = message.conversationId ?? message.senderStaffId
    if (!chatId) return

    const config = this.config
    const ctx = this.ctx
    if (!config || !ctx) return

    this.lastEventAt = Date.now()

    try {
      const reply = await ctx.onInboundMessage({
        platform: 'dingtalk',
        chatId,
        text,
        config,
      })
      if (reply.trim()) {
        await this.sendReply(message, reply)
      }
    } catch (error) {
      logStructured('dingtalk.channel', 'error', `[dingtalk-channel]`, { detail: error })
      this.status = 'error'
      this.statusMessage = toErrorMessage(error, '钉钉消息处理失败')
    }
  }

  private async sendReply(message: DingTalkBotMessage, text: string): Promise<void> {
    if (message.sessionWebhook) {
      const response = await fetch(message.sessionWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          msgtype: 'text',
          text: { content: text },
        }),
      })
      if (!response.ok) {
        const body = await response.text()
        throw new Error(`钉钉回复失败: ${body}`)
      }
      return
    }

    const config = this.config
    if (!config) return

    const appKey = config.appId.trim()
    const appSecret = config.appSecret.trim()
    const accessToken = await fetchAccessToken(appKey, appSecret)
    const chatId = message.conversationId ?? message.senderStaffId
    if (!chatId) return

    const response = await fetch(
      'https://api.dingtalk.com/v1.0/robot/oToMessages/batchSend',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-acs-dingtalk-access-token': accessToken,
        },
        body: JSON.stringify({
          robotCode: appKey,
          userIds: [message.senderStaffId].filter(Boolean),
          msgKey: 'sampleText',
          msgParam: JSON.stringify({ content: text }),
        }),
      },
    )

    if (!response.ok) {
      const body = await response.text()
      throw new Error(`钉钉发送失败: ${body}`)
    }
  }
}
