import { AuthenticationClient, EmailScene, SceneType } from 'authing-js-sdk'
import { parseAccountInput } from './account-utils'
import {
  canUseAuthingRemoteOtp,
  getMobileAuthingConfig,
  isMobileAuthingDevMode,
} from './authingConfig'
import { establishExternalSession, registerWithAccount, type AuthResult } from './localAuth'

const OTP_TTL_MS = 2 * 60 * 1000
const OTP_COOLDOWN_SECONDS = 60

type LocalChallenge = {
  accountKey: string
  code: string
  expiresAt: number
}

let client: AuthenticationClient | null = null
let localChallenge: LocalChallenge | null = null

function getClient(): AuthenticationClient {
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

function phoneDigits(phone: string): string {
  return phone.replace(/^\+86/, '').replace(/\s+/g, '')
}

function formatAuthingError(error: unknown, fallback: string): string {
  if (error && typeof error === 'object') {
    const message =
      'message' in error && typeof (error as { message?: unknown }).message === 'string'
        ? (error as { message: string }).message.trim()
        : ''
    if (message) {
      if (/用户池不存在|应用不存在/i.test(message)) {
        return 'Authing 配置有误，请检查应用 ID 与认证域名。'
      }
      if (/已注册|already\s*exist/i.test(message)) {
        return '该账号已注册，请切换到「登录」'
      }
      return message
    }
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }
  return fallback
}

function issueLocalChallenge(accountKey: string): { code: string; retryAfterSeconds: number } {
  const code = String(Math.floor(100000 + Math.random() * 900000))
  localChallenge = {
    accountKey,
    code,
    expiresAt: Date.now() + OTP_TTL_MS,
  }
  return { code, retryAfterSeconds: OTP_COOLDOWN_SECONDS }
}

function verifyLocalChallenge(accountKey: string, code: string): { ok: true } | { ok: false; message: string } {
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

export type SendRegisterCodeResult =
  | {
      ok: true
      channel: 'email' | 'phone'
      retryAfterSeconds: number
      expiresInSeconds: number
      devHint?: string
    }
  | { ok: false; message: string }

export async function sendRegisterVerificationCode(accountRaw: string): Promise<SendRegisterCodeResult> {
  const parsed = parseAccountInput(accountRaw, 'cn')
  if (!parsed.ok) return parsed

  if (isMobileAuthingDevMode() || !canUseAuthingRemoteOtp()) {
    const { code, retryAfterSeconds } = issueLocalChallenge(parsed.accountKey)
    return {
      ok: true,
      channel: parsed.accountKind,
      retryAfterSeconds,
      expiresInSeconds: OTP_TTL_MS / 1000,
      devHint: `开发验证码：${code}（2 分钟内有效）`,
    }
  }

  try {
    const auth = getClient()
    if (parsed.accountKind === 'phone' && parsed.phone) {
      const result = await auth.sendSmsCode(phoneDigits(parsed.phone), '+86', SceneType.SCENE_TYPE_REGISTER)
      if (result.code != null && result.code !== 200 && result.code !== 0) {
        return {
          ok: false,
          message: formatAuthingError(result, '手机验证码发送失败'),
        }
      }
    } else if (parsed.email) {
      const result = await auth.sendEmail(parsed.email, EmailScene.REGISTER_VERIFY_CODE)
      if (result.code != null && result.code !== 200 && result.code !== 0) {
        return {
          ok: false,
          message: formatAuthingError(result, '邮箱验证码发送失败'),
        }
      }
    } else {
      return { ok: false, message: '请输入手机号或邮箱' }
    }

    return {
      ok: true,
      channel: parsed.accountKind,
      retryAfterSeconds: OTP_COOLDOWN_SECONDS,
      expiresInSeconds: OTP_TTL_MS / 1000,
    }
  } catch (error) {
    return { ok: false, message: formatAuthingError(error, '验证码发送失败，请稍后重试') }
  }
}

export async function registerWithVerificationCode(input: {
  account: string
  code: string
  password: string
  confirmPassword: string
  displayName?: string
}): Promise<AuthResult> {
  const parsed = parseAccountInput(input.account, 'cn')
  if (!parsed.ok) return parsed
  if (!/^\d{4,8}$/.test(input.code.trim())) {
    return { ok: false, message: '请输入有效验证码' }
  }
  if (input.password.length < 6) {
    return { ok: false, message: '密码至少 6 位' }
  }
  if (input.confirmPassword !== input.password) {
    return { ok: false, message: '两次输入的密码不一致' }
  }

  if (isMobileAuthingDevMode() || !canUseAuthingRemoteOtp()) {
    const verified = verifyLocalChallenge(parsed.accountKey, input.code)
    if (!verified.ok) return verified
    return registerWithAccount({
      account: input.account,
      password: input.password,
      confirmPassword: input.confirmPassword,
      displayName: input.displayName ?? '',
      region: 'cn',
    })
  }

  try {
    const auth = getClient()
    let user: { id: string; token?: string | null; email?: string | null; phone?: string | null }
    if (parsed.accountKind === 'email' && parsed.email) {
      user = await auth.registerByEmailCode(parsed.email, input.code.trim(), undefined, {
        generateToken: true,
      })
    } else if (parsed.phone) {
      user = await auth.registerByPhoneCode(phoneDigits(parsed.phone), input.code.trim(), undefined, undefined, {
        phoneCountryCode: '+86',
        generateToken: true,
      })
    } else {
      return { ok: false, message: '请输入手机号或邮箱' }
    }

    if (!user.token) {
      return { ok: false, message: 'Authing 注册未返回 token' }
    }

    auth.setCurrentUser(user as never)
    await auth.updatePassword(input.password)

    return establishExternalSession({
      externalId: user.id,
      email: parsed.accountKind === 'email' ? parsed.email : user.email ?? null,
      displayName: input.displayName?.trim() || null,
      accessToken: user.token,
      provider: 'authing',
      region: 'cn',
    })
  } catch (error) {
    return { ok: false, message: formatAuthingError(error, '注册失败，请重试') }
  }
}
