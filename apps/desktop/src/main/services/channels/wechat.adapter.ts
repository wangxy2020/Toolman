import type { IncomingMessage, ServerResponse } from 'node:http'
import { toErrorMessage } from '@toolman/shared'
import type { ImChannelConfig } from '@toolman/shared'
import type { ChannelAdapter, ChannelAdapterContext, ChannelRuntimeStatus } from './adapter.types'
import { readXmlTag, WechatWorkCrypto } from './wechat-work-crypto'

interface WechatTokenResponse {
  errcode?: number
  errmsg?: string
  access_token?: string
  expires_in?: number
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function parseQuery(req: IncomingMessage): URLSearchParams {
  const url = new URL(req.url ?? '/', 'http://localhost')
  return url.searchParams
}

async function fetchAccessToken(corpId: string, corpSecret: string): Promise<string> {
  const url = new URL('https://qyapi.weixin.qq.com/cgi-bin/gettoken')
  url.searchParams.set('corpid', corpId)
  url.searchParams.set('corpsecret', corpSecret)

  const response = await fetch(url)
  const data = (await response.json()) as WechatTokenResponse
  if (!response.ok || data.errcode !== 0 || !data.access_token) {
    throw new Error(data.errmsg ?? '获取企业微信 access_token 失败')
  }
  return data.access_token
}

export class WechatChannelAdapter implements ChannelAdapter {
  readonly platform = 'wechat' as const

  private ctx: ChannelAdapterContext | null = null
  private status: ChannelRuntimeStatus = 'stopped'
  private statusMessage?: string
  private lastEventAt?: number
  private tokenCache: { value: string; expiresAt: number } | null = null

  async start(config: ImChannelConfig, ctx: ChannelAdapterContext): Promise<void> {
    this.ctx = ctx
    this.status = 'connecting'
    this.statusMessage = '等待企业微信事件回调'

    const corpId = config.appId.trim()
    const corpSecret = config.appSecret.trim()
    if (!corpId || !corpSecret) {
      this.status = 'error'
      this.statusMessage = '请填写 CorpID 与应用密钥'
      return
    }

    try {
      await fetchAccessToken(corpId, corpSecret)
      this.status = 'connected'
      this.statusMessage = `Webhook: ${ctx.webhookBaseUrl}/wechat/events`
    } catch (error) {
      this.status = 'error'
      this.statusMessage = toErrorMessage(error, '企业微信连接失败')
    }
  }

  async stop(): Promise<void> {
    this.status = 'stopped'
    this.statusMessage = undefined
    this.ctx = null
    this.tokenCache = null
  }

  async test(config: ImChannelConfig): Promise<{ ok: boolean; message: string }> {
    const corpId = config.appId.trim()
    const corpSecret = config.appSecret.trim()
    if (!corpId || !corpSecret) {
      return { ok: false, message: '请填写 CorpID 与应用密钥' }
    }

    try {
      await fetchAccessToken(corpId, corpSecret)
      return { ok: true, message: '企业微信凭据验证通过' }
    } catch (error) {
      return {
        ok: false,
        message: toErrorMessage(error, '企业微信凭据验证失败'),
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
    const query = parseQuery(req)
    const msgSignature = query.get('msg_signature') ?? ''
    const timestamp = query.get('timestamp') ?? ''
    const nonce = query.get('nonce') ?? ''
    const echostr = query.get('echostr') ?? ''

    if (req.method === 'GET' && echostr) {
      return this.handleUrlVerification(
        res,
        config,
        msgSignature,
        timestamp,
        nonce,
        echostr,
      )
    }

    if (req.method !== 'POST') return false

    const rawBody = await readBody(req)
    const encrypt = readXmlTag(rawBody, 'Encrypt') || rawBody.trim()
    const xml = this.decryptIncoming(
      config,
      msgSignature,
      timestamp,
      nonce,
      encrypt || rawBody,
    )

    const msgType = readXmlTag(xml, 'MsgType')
    const chatId = readXmlTag(xml, 'FromUserName')
    const text = readXmlTag(xml, 'Content')

    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('success')

    if (msgType !== 'text' || !chatId || !text) {
      return true
    }

    this.lastEventAt = Date.now()
    void this.handleInbound(config, chatId, text)
    return true
  }

  private handleUrlVerification(
    res: ServerResponse,
    config: ImChannelConfig,
    msgSignature: string,
    timestamp: string,
    nonce: string,
    echostr: string,
  ): boolean {
    try {
      const crypto = this.createCrypto(config)
      const plain = crypto ? crypto.verifyUrl(msgSignature, timestamp, nonce, echostr) : echostr
      res.writeHead(200, { 'Content-Type': 'text/plain' })
      res.end(plain)
      return true
    } catch (error) {
      res.writeHead(403, { 'Content-Type': 'text/plain' })
      res.end(toErrorMessage(error, 'forbidden'))
      return true
    }
  }

  private decryptIncoming(
    config: ImChannelConfig,
    msgSignature: string,
    timestamp: string,
    nonce: string,
    payload: string,
  ): string {
    const crypto = this.createCrypto(config)
    if (!crypto) return payload
    const encrypt = readXmlTag(payload, 'Encrypt') || payload
    return crypto.decryptMessage(msgSignature, timestamp, nonce, encrypt)
  }

  private createCrypto(config: ImChannelConfig): WechatWorkCrypto | null {
    const token = config.verificationToken.trim()
    const encodingAesKey = config.encryptKey.trim()
    const corpId = config.appId.trim()
    if (!token || !encodingAesKey || !corpId) return null
    return new WechatWorkCrypto(token, encodingAesKey, corpId)
  }

  private async handleInbound(
    config: ImChannelConfig,
    chatId: string,
    text: string,
  ): Promise<void> {
    if (!this.ctx) return

    try {
      const reply = await this.ctx.onInboundMessage({
        platform: 'wechat',
        chatId,
        text,
        config,
      })
      if (reply.trim()) {
        await this.sendText(config, chatId, reply)
      }
    } catch (error) {
      const message = toErrorMessage(error, '处理企业微信消息失败')
      this.status = 'error'
      this.statusMessage = message
      console.error('[wechat-channel]', error)
    }
  }

  private async getToken(config: ImChannelConfig): Promise<string> {
    if (this.tokenCache && this.tokenCache.expiresAt > Date.now()) {
      return this.tokenCache.value
    }
    const value = await fetchAccessToken(config.appId.trim(), config.appSecret.trim())
    this.tokenCache = { value, expiresAt: Date.now() + 50 * 60 * 1000 }
    return value
  }

  private async sendText(config: ImChannelConfig, chatId: string, text: string): Promise<void> {
    const agentId = Number(config.domain.trim())
    if (!Number.isFinite(agentId) || agentId <= 0) {
      throw new Error('请在「域名」字段填写企业微信应用 AgentId')
    }

    const token = await this.getToken(config)
    const response = await fetch(
      `https://qyapi.weixin.qq.com/cgi-bin/message/send?access_token=${token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          touser: chatId,
          msgtype: 'text',
          agentid: agentId,
          text: { content: text },
        }),
      },
    )

    const data = (await response.json()) as WechatTokenResponse
    if (!response.ok || data.errcode !== 0) {
      throw new Error(data.errmsg ?? '企业微信发送失败')
    }
  }
}
