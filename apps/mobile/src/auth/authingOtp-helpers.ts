import { AuthenticationClient, EmailScene, SceneType } from 'authing-js-sdk'
import { parseAccountInput } from './account-utils'
import {
  canUseAuthingRemoteAuth,
  getMobileAuthingConfig,
  isMobileAuthingDevMode,
} from './authingConfig'

export const OTP_TTL_MS = 2 * 60 * 1000
export const OTP_COOLDOWN_SECONDS = 60

type LocalChallenge = {
  accountKey: string
  code: string
  expiresAt: number
}

export type AuthingUser = {
  id: string
  token?: string | null
  email?: string | null
  phone?: string | null
  username?: string | null
  nickname?: string | null
}

export type AuthingPasswordClient = AuthenticationClient & {
  loginByPhonePassword: (
    phone: string,
    password: string,
    options?: { phoneCountryCode?: string },
  ) => Promise<AuthingUser>
}

let client: AuthenticationClient | null = null
let localChallenge: LocalChallenge | null = null

export function getAuthingClient(): AuthenticationClient {
  const config = getMobileAuthingConfig()
  if (!config) {
    throw new Error('Authing 未配置')
  }
  if (!client) {
    client = new AuthenticationClient({
      appId: config.appId,
      secret: config.appSecret || undefined,
      appHost: config.appHost,
    })
  }
  return client
}

export function phoneDigits(phone: string): string {
  return phone.replace(/^\+86/, '').replace(/\s+/g, '')
}

export function formatAuthingError(error: unknown, fallback: string): string {
  if (error && typeof error === 'object') {
    const message =
      'message' in error && typeof (error as { message?: unknown }).message === 'string'
        ? (error as { message: string }).message.trim()
        : ''
    if (message) {
      if (/用户池不存在|应用不存在/i.test(message)) {
        return 'Authing 配置有误，请检查应用 ID 与认证域名。'
      }
      if (/无权限登录此应用|not\s+allowed\s+to\s+login\s+(to\s+)?this\s+app/i.test(message)) {
        return '该账号已注册，但未被授权登录此 Authing 应用。请到控制台 → 应用 → 访问授权，将默认权限改为「允许所有用户访问」。'
      }
      if (/超过.*(设备|登录|会话)|max.*(device|session)|device.*(limit|exceed)|too many.*(device|session)/i.test(message)) {
        return '该账号已达到最多 3 台设备同时登录，请先在其他设备退出后再试。'
      }
      if (/已注册|already\s*exist/i.test(message)) {
        return '该账号已注册，请切换到「登录」'
      }
      if (/密码|password|credential|账号或密码/i.test(message)) {
        return '账号或密码错误'
      }
      return message
    }
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }
  return fallback
}

export function issueLocalChallenge(accountKey: string): { code: string; retryAfterSeconds: number } {
  const code = String(Math.floor(100000 + Math.random() * 900000))
  localChallenge = {
    accountKey,
    code,
    expiresAt: Date.now() + OTP_TTL_MS,
  }
  return { code, retryAfterSeconds: OTP_COOLDOWN_SECONDS }
}

export function verifyLocalChallenge(
  accountKey: string,
  code: string,
): { ok: true } | { ok: false; message: string } {
  if (!localChallenge || localChallenge.accountKey !== accountKey) {
    return { ok: false, message: '请先获取验证码' }
  }
  if (Date.now() > localChallenge.expiresAt) {
    localChallenge = null
    return { ok: false, message: '验证码已过期（有效期 2 分钟），请重新获取' }
  }
  if (localChallenge.code !== code.trim()) {
    return { ok: false, message: '验证码错误' }
  }
  localChallenge = null
  return { ok: true }
}

export type AuthingOtpIntent = 'login' | 'register' | 'reset'

export function resolveSmsScene(intent: AuthingOtpIntent): SceneType {
  if (intent === 'register') return SceneType.SCENE_TYPE_REGISTER
  if (intent === 'reset') return SceneType.SCENE_TYPE_RESET
  return SceneType.SCENE_TYPE_LOGIN
}

export function resolveEmailScene(intent: AuthingOtpIntent): EmailScene {
  if (intent === 'register') return EmailScene.REGISTER_VERIFY_CODE
  if (intent === 'reset') return EmailScene.ResetPassword
  return EmailScene.LOGIN_VERIFY_CODE
}

export function isAuthingLocalMode(): boolean {
  return isMobileAuthingDevMode() || !canUseAuthingRemoteAuth()
}

export type ParsedAccountOk = Extract<ReturnType<typeof parseAccountInput>, { ok: true }>
