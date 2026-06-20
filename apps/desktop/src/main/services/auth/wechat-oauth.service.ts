import { AuthLoginError } from './auth-login.error.js'
import { getWechatOpenConfig, isWechatDevMode } from './wechat-auth.config.js'

export interface WechatAuthIdentity {
  subjectId: string
  openId: string
  unionId: string | null
  accessToken: string
  refreshToken: string | null
  expiresIn: number
  nickname: string
  avatarUrl: string | null
}

interface WechatTokenResponse {
  access_token?: string
  expires_in?: number
  refresh_token?: string
  openid?: string
  unionid?: string
  errcode?: number
  errmsg?: string
}

interface WechatUserInfoResponse {
  nickname?: string
  headimgurl?: string
  errcode?: number
  errmsg?: string
}

function buildDevWechatIdentity(): WechatAuthIdentity {
  return {
    subjectId: 'dev-wechat-union-001',
    openId: 'dev-wechat-open-001',
    unionId: 'dev-wechat-union-001',
    accessToken: 'dev-wechat-access-token',
    refreshToken: null,
    expiresIn: 7200,
    nickname: '微信开发用户',
    avatarUrl: null,
  }
}

export function buildWechatAuthorizeUrl(input: {
  appId: string
  redirectUri: string
  state: string
}): string {
  const params = new URLSearchParams({
    appid: input.appId,
    redirect_uri: input.redirectUri,
    response_type: 'code',
    scope: 'snsapi_login',
    state: input.state,
  })
  return `https://open.weixin.qq.com/connect/qrconnect?${params.toString()}#wechat_redirect`
}

async function fetchWechatJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  const data = (await response.json()) as T
  return data
}

export async function exchangeWechatCode(code: string): Promise<WechatAuthIdentity> {
  if (isWechatDevMode() && !getWechatOpenConfig()) {
    return buildDevWechatIdentity()
  }

  const config = getWechatOpenConfig()
  if (!config) {
    throw new AuthLoginError('微信登录未配置，请设置 TOOLMAN_WECHAT_OPEN_APP_ID 等环境变量')
  }

  const tokenParams = new URLSearchParams({
    appid: config.appId,
    secret: config.appSecret,
    code,
    grant_type: 'authorization_code',
  })

  const tokenData = await fetchWechatJson<WechatTokenResponse>(
    `https://api.weixin.qq.com/sns/oauth2/access_token?${tokenParams.toString()}`,
  )

  if (tokenData.errcode || !tokenData.access_token || !tokenData.openid) {
    throw new AuthLoginError(tokenData.errmsg ?? '微信授权失败')
  }

  const userParams = new URLSearchParams({
    access_token: tokenData.access_token,
    openid: tokenData.openid,
  })
  const userInfo = await fetchWechatJson<WechatUserInfoResponse>(
    `https://api.weixin.qq.com/sns/userinfo?${userParams.toString()}`,
  )

  if (userInfo.errcode) {
    throw new AuthLoginError(userInfo.errmsg ?? '获取微信用户信息失败')
  }

  const subjectId = tokenData.unionid ?? tokenData.openid
  return {
    subjectId,
    openId: tokenData.openid,
    unionId: tokenData.unionid ?? null,
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token ?? null,
    expiresIn: tokenData.expires_in ?? 7200,
    nickname: userInfo.nickname ?? '微信用户',
    avatarUrl: userInfo.headimgurl ?? null,
  }
}

export async function resolveWechatAuthIdentity(): Promise<WechatAuthIdentity> {
  if (isWechatDevMode() && !getWechatOpenConfig()) {
    return buildDevWechatIdentity()
  }
  throw new AuthLoginError('微信 OAuth 回调缺失')
}
