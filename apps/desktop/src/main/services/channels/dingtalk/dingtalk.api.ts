interface DingTalkAccessTokenResponse {
  accessToken?: string
  expireIn?: number
}

interface DingTalkConnectionResponse {
  endpoint?: string
  ticket?: string
}

export interface DingTalkBotMessage {
  msgtype?: string
  text?: { content?: string }
  conversationId?: string
  conversationType?: string
  senderStaffId?: string
  senderNick?: string
  sessionWebhook?: string
  sessionWebhookExpiredTime?: number
}

export interface DingTalkStreamFrame {
  specVersion?: string
  type?: string
  headers?: Record<string, string>
  data?: string
}

export async function fetchDingTalkAccessToken(appKey: string, appSecret: string): Promise<string> {
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

export async function openDingTalkStreamConnection(
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
