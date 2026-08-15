import { AuthenticationClient, EmailScene, SceneType } from 'authing-js-sdk'
import { parseAccountInput } from './account-utils'
import {
  canUseAuthingRemoteAuth,
  getMobileAuthingConfig,
  isMobileAuthingDevMode,
} from './authingConfig'
import {
  establishExternalSession,
  registerWithAccount,
  resetPasswordWithAccount,
  type AuthResult,
} from './localAuth'

const OTP_TTL_MS = 2 * 60 * 1000
const OTP_COOLDOWN_SECONDS = 60

type LocalChallenge = {
  accountKey: string
  code: string
  expiresAt: number
}

type AuthingUser = {
  id: string
  token?: string | null
  email?: string | null
  phone?: string | null
  username?: string | null
  nickname?: string | null
}

type AuthingPasswordClient = AuthenticationClient & {
  loginByPhonePassword: (
    phone: string,
    password: string,
    options?: { phoneCountryCode?: string },
  ) => Promise<AuthingUser>
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

export type AuthingOtpIntent = 'login' | 'register' | 'reset'

function resolveSmsScene(intent: AuthingOtpIntent): SceneType {
  if (intent === 'register') return SceneType.SCENE_TYPE_REGISTER
  if (intent === 'reset') return SceneType.SCENE_TYPE_RESET
  return SceneType.SCENE_TYPE_LOGIN
}

function resolveEmailScene(intent: AuthingOtpIntent): EmailScene {
  if (intent === 'register') return EmailScene.REGISTER_VERIFY_CODE
  if (intent === 'reset') return EmailScene.ResetPassword
  return EmailScene.LOGIN_VERIFY_CODE
}

export async function sendAuthingVerificationCode(
  accountRaw: string,
  intent: AuthingOtpIntent = 'register',
): Promise<SendRegisterCodeResult> {
  const parsed = parseAccountInput(accountRaw, 'cn')
  if (!parsed.ok) return parsed

  if (isMobileAuthingDevMode() || !canUseAuthingRemoteAuth()) {
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
      const result = await auth.sendSmsCode(phoneDigits(parsed.phone), '+86', resolveSmsScene(intent))
      if (result.code != null && result.code !== 200 && result.code !== 0) {
        return {
          ok: false,
          message: formatAuthingError(result, '手机验证码发送失败'),
        }
      }
    } else if (parsed.email) {
      const result = await auth.sendEmail(parsed.email, resolveEmailScene(intent))
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

export async function verifyAuthingPhoneCode(
  phoneRaw: string,
  code: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const parsed = parseAccountInput(phoneRaw, 'cn')
  if (!parsed.ok) return parsed
  if (parsed.accountKind !== 'phone' || !parsed.phone) {
    return { ok: false, message: '请输入有效的 11 位手机号' }
  }
  if (!/^\d{4,8}$/.test(code.trim())) {
    return { ok: false, message: '请输入有效验证码' }
  }
  if (isMobileAuthingDevMode() || !canUseAuthingRemoteAuth()) {
    return verifyLocalChallenge(parsed.accountKey, code)
  }
  try {
    await getClient().loginByPhoneCode(phoneDigits(parsed.phone), code.trim(), {
      phoneCountryCode: '+86',
    })
    return { ok: true }
  } catch (error) {
    return { ok: false, message: formatAuthingError(error, '验证码错误或已过期') }
  }
}

async function sessionFromAuthingUser(
  user: AuthingUser,
  parsed: Extract<ReturnType<typeof parseAccountInput>, { ok: true }>,
  displayName?: string,
): Promise<AuthResult> {
  if (!user.token) {
    return { ok: false, message: 'Authing 未返回 token' }
  }
  return establishExternalSession({
    externalId: user.id,
    email: parsed.accountKind === 'email' ? parsed.email : user.email ?? null,
    phone: parsed.phone || user.phone || null,
    displayName: displayName?.trim() || user.nickname || user.username || null,
    accessToken: user.token,
    provider: 'authing',
    region: 'cn',
  })
}

export async function loginWithAuthingPassword(input: {
  account: string
  password: string
}): Promise<AuthResult> {
  const parsed = parseAccountInput(input.account, 'cn')
  if (!parsed.ok) return parsed
  if (!input.password) return { ok: false, message: '请输入密码' }

  if (isMobileAuthingDevMode() || !canUseAuthingRemoteAuth()) {
    return { ok: false, message: 'Authing 未配置' }
  }

  try {
    const auth = getClient()
    let user: AuthingUser
    if (parsed.accountKind === 'email' && parsed.email) {
      user = await auth.loginByEmail(parsed.email, input.password)
    } else if (parsed.phone) {
      user = await (auth as AuthingPasswordClient).loginByPhonePassword(phoneDigits(parsed.phone), input.password, {
        phoneCountryCode: '+86',
      })
    } else {
      return { ok: false, message: '请输入手机号或邮箱' }
    }
    return sessionFromAuthingUser(user, parsed)
  } catch (error) {
    return { ok: false, message: formatAuthingError(error, '登录失败，请重试') }
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

  if (isMobileAuthingDevMode() || !canUseAuthingRemoteAuth()) {
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
    let user: AuthingUser
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

    return sessionFromAuthingUser(user, parsed, input.displayName)
  } catch (error) {
    return { ok: false, message: formatAuthingError(error, '注册失败，请重试') }
  }
}

export async function resetPasswordWithVerificationCode(input: {
  account: string
  code: string
  password: string
  confirmPassword: string
}): Promise<{ ok: true } | { ok: false; message: string }> {
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

  if (isMobileAuthingDevMode() || !canUseAuthingRemoteAuth()) {
    const verified = verifyLocalChallenge(parsed.accountKey, input.code)
    if (!verified.ok) return verified
    return resetPasswordWithAccount({
      account: input.account,
      newPassword: input.password,
      confirmPassword: input.confirmPassword,
      region: 'cn',
    })
  }

  try {
    const auth = getClient()
    if (parsed.accountKind === 'email' && parsed.email) {
      await auth.resetPasswordByEmailCode(parsed.email, input.code.trim(), input.password)
    } else if (parsed.phone) {
      await auth.resetPasswordByPhoneCode(
        phoneDigits(parsed.phone),
        input.code.trim(),
        input.password,
        '+86',
      )
    } else {
      return { ok: false, message: '请输入手机号或邮箱' }
    }
    return { ok: true }
  } catch (error) {
    return { ok: false, message: formatAuthingError(error, '重置密码失败，请重试') }
  }
}
