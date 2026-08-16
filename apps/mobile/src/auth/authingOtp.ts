import { parseAccountInput } from './account-utils'
import {
  formatAuthingError,
  getAuthingClient,
  isAuthingLocalMode,
  issueLocalChallenge,
  OTP_COOLDOWN_SECONDS,
  OTP_TTL_MS,
  phoneDigits,
  resolveEmailScene,
  resolveSmsScene,
  verifyLocalChallenge,
  type AuthingOtpIntent,
} from './authingOtp-helpers'

export type { AuthingOtpIntent } from './authingOtp-helpers'
export {
  loginWithAuthingPassword,
  registerWithVerificationCode,
  resetPasswordWithVerificationCode,
} from './authingOtp-auth'

export type SendRegisterCodeResult =
  | {
      ok: true
      channel: 'email' | 'phone'
      retryAfterSeconds: number
      expiresInSeconds: number
      devHint?: string
    }
  | { ok: false; message: string }

export async function sendAuthingVerificationCode(
  accountRaw: string,
  intent: AuthingOtpIntent = 'register',
): Promise<SendRegisterCodeResult> {
  const parsed = parseAccountInput(accountRaw, 'cn')
  if (!parsed.ok) return parsed

  if (isAuthingLocalMode()) {
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
    const auth = getAuthingClient()
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
  if (isAuthingLocalMode()) {
    return verifyLocalChallenge(parsed.accountKey, code)
  }
  try {
    await getAuthingClient().loginByPhoneCode(phoneDigits(parsed.phone), code.trim(), {
      phoneCountryCode: '+86',
    })
    return { ok: true }
  } catch (error) {
    return { ok: false, message: formatAuthingError(error, '验证码错误或已过期') }
  }
}
