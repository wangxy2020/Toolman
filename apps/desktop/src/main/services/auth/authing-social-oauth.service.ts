import { createServer, type Server } from 'node:http'
import { randomUUID } from 'node:crypto'

import { shell } from 'electron'

import { AuthLoginError } from './auth-login.error.js'
import {
  getAuthingConfig,
  getAuthingOAuthRedirectUri,
  isAuthingConfigured,
  isAuthingDevMode,
} from './authing-auth.config.js'
import { persistAuthLogin } from './auth-persist.service.js'
import { loginWithWechatOAuth as loginWithLegacyWechatOAuth, loginWithWechatIdentity } from './tencent-wechat-auth.service.js'
import { resolveWechatAuthIdentity } from './wechat-oauth.service.js'
import type { AuthSession } from '@toolman/shared'

export interface AuthingSocialIdentity {
  subjectId: string
  nickname: string
  accessToken: string
  refreshToken?: string
  expiresIn?: number
  provider: 'tencent_wechat' | 'tencent_douyin'
}

const OAUTH_TIMEOUT_MS = 5 * 60 * 1000

const pendingStates = new Map<string, { expiresAt: number }>()
let callbackServer: Server | null = null
let oauthInFlight = false
let activeOAuthHandlers: {
  resolve: (identity: AuthingSocialIdentity) => void
  reject: (error: Error) => void
} | null = null

function cleanupStates(): void {
  const now = Date.now()
  for (const [state, entry] of pendingStates.entries()) {
    if (entry.expiresAt <= now) {
      pendingStates.delete(state)
    }
  }
}

function registerState(state: string): void {
  cleanupStates()
  pendingStates.set(state, { expiresAt: Date.now() + OAUTH_TIMEOUT_MS })
}

function assertValidState(state: string): void {
  cleanupStates()
  if (!pendingStates.has(state)) {
    throw new AuthLoginError('授权状态无效或已过期')
  }
  pendingStates.delete(state)
}

function parseAuthingCallbackUrl(requestUrl: URL): AuthingSocialIdentity {
  const code = requestUrl.searchParams.get('code')
  const message = requestUrl.searchParams.get('message')
  const dataRaw = requestUrl.searchParams.get('data')

  if (code && code !== '200') {
    throw new AuthLoginError(message || 'Authing 授权失败')
  }

  if (dataRaw) {
    try {
      const data = JSON.parse(decodeURIComponent(dataRaw)) as {
        id?: string
        token?: string
        idToken?: string
        nickname?: string
        username?: string
        refreshToken?: string
        expiresIn?: number
      }
      const accessToken = data.token ?? data.idToken
      if (!data.id || !accessToken) {
        throw new AuthLoginError('Authing 授权返回数据不完整')
      }
      return {
        subjectId: data.id,
        nickname: data.nickname ?? data.username ?? 'Authing 用户',
        accessToken,
        refreshToken: data.refreshToken,
        expiresIn: data.expiresIn,
        provider: 'tencent_wechat',
      }
    } catch (error) {
      if (error instanceof AuthLoginError) throw error
      throw new AuthLoginError('Authing 授权响应解析失败')
    }
  }

  const token = requestUrl.searchParams.get('token') ?? requestUrl.searchParams.get('id_token')
  const userId = requestUrl.searchParams.get('userId') ?? requestUrl.searchParams.get('id')
  if (token && userId) {
    return {
      subjectId: userId,
      nickname: requestUrl.searchParams.get('nickname') ?? 'Authing 用户',
      accessToken: token,
      provider: 'tencent_wechat',
    }
  }

  throw new AuthLoginError(message || 'Authing 授权失败')
}

function buildAuthingSocialAuthorizeUrl(provider: string, redirectUri: string, state: string): string {
  const config = getAuthingConfig()
  if (!config) {
    throw new AuthLoginError('Authing 未配置')
  }

  const query = new URLSearchParams({
    app_id: config.appId,
    redirect_uri: redirectUri,
    state,
    from_guard: '1',
    uuid: randomUUID(),
    protocol: 'oidc',
  })

  return `${config.appHost}/connections/social/${provider}?${query.toString()}`
}

async function ensureCallbackServer(port: number): Promise<void> {
  if (callbackServer) return

  callbackServer = createServer((request, response) => {
    void (async () => {
      try {
        const redirectUri = getAuthingOAuthRedirectUri(port)
        const callbackUrl = new URL(redirectUri)
        const requestUrl = new URL(request.url ?? '/', redirectUri)

        if (requestUrl.pathname !== callbackUrl.pathname) {
          response.writeHead(404)
          response.end('Not Found')
          return
        }

        const state = requestUrl.searchParams.get('state')
        if (state) {
          assertValidState(state)
        }

        const identity = parseAuthingCallbackUrl(requestUrl)
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        response.end('<html><body>授权成功，请返回 Toolman。</body></html>')
        activeOAuthHandlers?.resolve(identity)
      } catch (error) {
        response.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' })
        response.end('<html><body>授权失败，请返回 Toolman 重试。</body></html>')
        activeOAuthHandlers?.reject(
          error instanceof Error ? error : new AuthLoginError('Authing 授权失败'),
        )
      }
    })()
  })

  await new Promise<void>((resolve, reject) => {
    callbackServer!.listen(port, '127.0.0.1', () => resolve())
    callbackServer!.on('error', reject)
  })
}

async function runAuthingSocialOAuth(
  providerKey: 'wechat' | 'douyin',
  authProvider: AuthingSocialIdentity['provider'],
): Promise<AuthingSocialIdentity> {
  if (oauthInFlight) {
    throw new AuthLoginError('已有授权流程进行中，请稍后再试')
  }

  const config = getAuthingConfig()
  if (!config) {
    throw new AuthLoginError('Authing 未配置，请设置 TOOLMAN_AUTHING_* 环境变量')
  }

  oauthInFlight = true

  try {
    await ensureCallbackServer(config.oauthCallbackPort)
    const state = randomUUID()
    registerState(state)
    const redirectUri = getAuthingOAuthRedirectUri(config.oauthCallbackPort)
    const provider = providerKey === 'wechat' ? config.wechatProvider : config.douyinProvider
    const authUrl = buildAuthingSocialAuthorizeUrl(provider, redirectUri, state)

    const identity = await new Promise<AuthingSocialIdentity>((resolve, reject) => {
      let settled = false
      const finishResolve = (value: AuthingSocialIdentity) => {
        if (settled) return
        settled = true
        oauthInFlight = false
        activeOAuthHandlers = null
        resolve({ ...value, provider: authProvider })
      }
      const finishReject = (error: Error) => {
        if (settled) return
        settled = true
        oauthInFlight = false
        activeOAuthHandlers = null
        reject(error)
      }

      activeOAuthHandlers = { resolve: finishResolve, reject: finishReject }
      void shell.openExternal(authUrl)
      setTimeout(() => {
        finishReject(new AuthLoginError('授权超时，请重试'))
      }, OAUTH_TIMEOUT_MS)
    })

    return identity
  } catch (error) {
    oauthInFlight = false
    activeOAuthHandlers = null
    throw error instanceof AuthLoginError ? error : new AuthLoginError('Authing 授权失败')
  }
}

export async function loginWithAuthingWechatOAuth(): Promise<AuthSession> {
  if (isAuthingDevMode() && !getAuthingConfig()) {
    return loginWithWechatIdentity(await resolveWechatAuthIdentity())
  }

  if (!isAuthingConfigured()) {
    return loginWithLegacyWechatOAuth()
  }

  const identity = await runAuthingSocialOAuth('wechat', 'tencent_wechat')
  return loginWithWechatIdentity({
    subjectId: identity.subjectId,
    nickname: identity.nickname,
    openId: identity.subjectId,
    unionId: null,
    accessToken: identity.accessToken,
    refreshToken: identity.refreshToken ?? null,
    expiresIn: identity.expiresIn ?? 7200,
    avatarUrl: null,
  })
}

export async function loginWithAuthingDouyinOAuth(): Promise<AuthSession> {
  if (isAuthingDevMode() && !getAuthingConfig()) {
    return persistAuthLogin({
      region: 'cn',
      provider: 'tencent_douyin',
      subjectId: `douyin-dev-${randomUUID()}`,
      bindingLabel: '抖音开发用户',
      accessToken: randomUUID(),
      expiresInSeconds: 7 * 24 * 3600,
    })
  }

  if (!isAuthingConfigured()) {
    throw new AuthLoginError('抖音登录需配置 Authing（TOOLMAN_AUTHING_*）')
  }

  const identity = await runAuthingSocialOAuth('douyin', 'tencent_douyin')
  return persistAuthLogin({
    region: 'cn',
    provider: 'tencent_douyin',
    subjectId: identity.subjectId,
    bindingLabel: identity.nickname,
    bindingMetadata: { label: identity.nickname },
    accessToken: identity.accessToken,
    refreshToken: identity.refreshToken,
    expiresInSeconds: identity.expiresIn ?? 7 * 24 * 3600,
  })
}

export async function shutdownAuthingOAuthServer(): Promise<void> {
  if (!callbackServer) return
  await new Promise<void>((resolve) => {
    callbackServer?.close(() => resolve())
  })
  callbackServer = null
}

export function resetAuthingOAuthStateForTests(): void {
  pendingStates.clear()
  oauthInFlight = false
  activeOAuthHandlers = null
}
