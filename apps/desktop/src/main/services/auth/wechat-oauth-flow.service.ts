import { createServer, type Server } from 'node:http'
import { randomUUID } from 'node:crypto'

import { shell } from 'electron'

import { AuthLoginError } from './auth-login.error.js'
import {
  buildWechatAuthorizeUrl,
  exchangeWechatCode,
  resolveWechatAuthIdentity,
  type WechatAuthIdentity,
} from './wechat-oauth.service.js'
import { getWechatOpenConfig, getWechatRedirectUri, isWechatDevMode } from './wechat-auth.config.js'

const OAUTH_TIMEOUT_MS = 5 * 60 * 1000

const pendingStates = new Map<string, { expiresAt: number }>()
let callbackServer: Server | null = null
let oauthInFlight = false
let activeOAuthHandlers: {
  resolve: (identity: WechatAuthIdentity) => void
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
    throw new AuthLoginError('微信授权状态无效或已过期')
  }
  pendingStates.delete(state)
}

async function ensureCallbackServer(): Promise<void> {
  if (callbackServer) return

  const redirectUri = getWechatRedirectUri()
  const callbackUrl = new URL(redirectUri)

  callbackServer = createServer((request, response) => {
    void (async () => {
      try {
        const requestUrl = new URL(request.url ?? '/', redirectUri)
        if (requestUrl.pathname !== callbackUrl.pathname) {
          response.writeHead(404)
          response.end('Not Found')
          return
        }

        const code = requestUrl.searchParams.get('code')
        const state = requestUrl.searchParams.get('state')
        if (!code || !state) {
          response.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
          response.end('<html><body>授权失败：缺少 code。</body></html>')
          activeOAuthHandlers?.reject(new AuthLoginError('微信授权失败'))
          return
        }

        assertValidState(state)
        const identity = await exchangeWechatCode(code)
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        response.end('<html><body>微信授权成功，请返回 Toolman。</body></html>')
        activeOAuthHandlers?.resolve(identity)
      } catch (error) {
        response.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' })
        response.end('<html><body>微信授权失败，请返回 Toolman 重试。</body></html>')
        activeOAuthHandlers?.reject(
          error instanceof Error ? error : new AuthLoginError('微信授权失败'),
        )
      }
    })()
  })

  await new Promise<void>((resolve, reject) => {
    callbackServer!.listen(Number(callbackUrl.port), callbackUrl.hostname, () => resolve())
    callbackServer!.on('error', reject)
  })
}

export async function runWechatOAuthFlow(): Promise<WechatAuthIdentity> {
  if (oauthInFlight) {
    throw new AuthLoginError('已有微信授权流程进行中，请稍后再试')
  }

  if (isWechatDevMode() && !getWechatOpenConfig()) {
    return resolveWechatAuthIdentity()
  }

  const config = getWechatOpenConfig()
  if (!config) {
    throw new AuthLoginError('微信登录未配置，请设置 TOOLMAN_WECHAT_OPEN_APP_ID 等环境变量')
  }

  oauthInFlight = true

  try {
    await ensureCallbackServer()
    const state = randomUUID()
    registerState(state)
    const authUrl = buildWechatAuthorizeUrl({
      appId: config.appId,
      redirectUri: config.redirectUri,
      state,
    })

    return await new Promise<WechatAuthIdentity>((resolve, reject) => {
      let settled = false
      const finishResolve = (identity: WechatAuthIdentity) => {
        if (settled) return
        settled = true
        oauthInFlight = false
        activeOAuthHandlers = null
        resolve(identity)
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
        finishReject(new AuthLoginError('微信授权超时，请重试'))
      }, OAUTH_TIMEOUT_MS)
    })
  } catch (error) {
    oauthInFlight = false
    activeOAuthHandlers = null
    throw error instanceof AuthLoginError ? error : new AuthLoginError('微信授权失败')
  }
}

export async function shutdownWechatOAuthServer(): Promise<void> {
  if (!callbackServer) return
  await new Promise<void>((resolve) => {
    callbackServer?.close(() => resolve())
  })
  callbackServer = null
}

export function resetWechatOAuthStateForTests(): void {
  pendingStates.clear()
  oauthInFlight = false
  activeOAuthHandlers = null
}
