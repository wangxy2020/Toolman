import { EmailScene, SceneType } from 'authing-js-sdk'
import { logStructured } from '../structured-log.service'
import { formatAuthDevSmsLog, type AuthSendSmsCodeInput, type AuthSendSmsCodeOutput } from '@toolman/shared'

import {
  OTP_CODE_TTL_SECONDS,
  OTP_RESEND_COOLDOWN_SECONDS,
} from './auth-otp.constants.js'
import { AuthLoginError, readAuthServiceErrorMessage } from './auth-login.error.js'
import {
  getDevSmsHint,
  issueSmsChallenge,
} from './auth-sms-challenge.service.js'
import { getAuthingClient } from './authing-client.service.js'
import { getAuthingConfig, getAuthingOtpTtlSeconds, isAuthingConfigured, isAuthingDevMode } from './authing-auth.config.js'
import { formatAuthingServiceError } from './authing-error-utils.js'
import { ensureAuthingOtpTemplateTtl } from './authing-otp-template.service.js'
import {
  assertAuthingRegisterAccountAvailable,
} from './authing-user-exists.service.js'
import {
  maskCnAuthAccount,
  parseCnAuthAccount,
  type CnAuthAccountChannel,
  type ParsedCnAuthAccount,
} from './cn-account-utils.js'
import { sendPhoneSmsCode } from './tencent-phone-auth.service.js'

function getOtpTtlSeconds(): number {
  return getAuthingOtpTtlSeconds(OTP_CODE_TTL_SECONDS)
}

function buildOtpSendResult(
  account: ParsedCnAuthAccount,
  retryAfterSeconds: number,
): AuthSendSmsCodeOutput {
  return {
    account: account.normalized,
    channel: account.channel,
    maskedAccount: maskCnAuthAccount(account),
    retryAfterSeconds,
    expiresInSeconds: getOtpTtlSeconds(),
  }
}

type AuthenticationClientLike = ReturnType<typeof getAuthingClient> & {
  httpClient: {
    request: (input: { method: string; url: string; data: Record<string, unknown> }) => Promise<{
      code?: number | null
      message?: string | null
    }>
  }
}

function resolveAccountInput(input: AuthSendSmsCodeInput): ParsedCnAuthAccount {
  const raw = input.account?.trim() || input.phone?.trim() || ''
  return parseCnAuthAccount(raw)
}

function phoneCountryCode(phone: string): string {
  return phone.startsWith('+86') ? '+86' : '+86'
}

function phoneDigits(phone: string): string {
  return phone.replace(/^\+86/, '')
}

export type AuthingOtpIntent = 'login' | 'register' | 'reset'

export function resolveAuthingEmailScene(intent?: AuthingOtpIntent): EmailScene {
  if (intent === 'register') return EmailScene.REGISTER_VERIFY_CODE
  if (intent === 'reset') return EmailScene.ResetPassword
  return EmailScene.LOGIN_VERIFY_CODE
}

export function resolveAuthingSmsScene(intent?: AuthingOtpIntent): SceneType {
  if (intent === 'register') return SceneType.SCENE_TYPE_REGISTER
  if (intent === 'reset') return SceneType.SCENE_TYPE_RESET
  return SceneType.SCENE_TYPE_LOGIN
}

function channelLabel(channel: CnAuthAccountChannel): string {
  return channel === 'email' ? '邮箱' : '手机'
}

function assertAuthingCommonMessage(
  result: { code?: number | null; message?: string | null },
  channel: CnAuthAccountChannel,
): void {
  if (result.code == null || result.code === 200 || result.code === 0) {
    return
  }

  throw new AuthLoginError(
    formatAuthingServiceError(result.message?.trim(), `${channelLabel(channel)}验证码发送失败`),
  )
}

function formatOtpSendError(error: unknown, channel: CnAuthAccountChannel): string {
  const message = readAuthServiceErrorMessage(error)
  return formatAuthingServiceError(message, `${channelLabel(channel)}验证码发送失败，请稍后重试`)
}

async function sendAuthingVerificationCode(
  input: AuthSendSmsCodeInput,
  account: ParsedCnAuthAccount,
): Promise<void> {
  await ensureAuthingOtpTemplateTtl()

  const config = getAuthingConfig()
  if (!config) {
    throw new AuthLoginError('Authing 未配置')
  }

  const client = getAuthingClient() as AuthenticationClientLike
  const ttlSeconds = getOtpTtlSeconds()
  const requestedIntent = input.intent ?? 'login'
  if (requestedIntent === 'register') {
    await assertAuthingRegisterAccountAvailable(account, 'register')
  }

  try {
    if (account.channel === 'phone' && account.phone) {
      const api = `${config.appHost}/api/v2/sms/send`
      const result = await client.httpClient.request({
        method: 'POST',
        url: api,
        data: {
          phone: phoneDigits(account.phone),
          phoneCountryCode: phoneCountryCode(account.phone),
          scene: resolveAuthingSmsScene(requestedIntent),
          expiresIn: ttlSeconds,
        },
      })
      assertAuthingCommonMessage(result, 'phone')
      return
    }

    if (account.email) {
      const result = await client.sendEmail(account.email, resolveAuthingEmailScene(requestedIntent))
      assertAuthingCommonMessage(result, 'email')
    }
  } catch (error) {
    if (error instanceof AuthLoginError) {
      throw error
    }
    throw new AuthLoginError(formatOtpSendError(error, account.channel))
  }
}

export async function sendCnVerificationCode(input: AuthSendSmsCodeInput): Promise<AuthSendSmsCodeOutput> {
  if (input.region !== 'cn') {
    throw new AuthLoginError('当前仅支持国内手机或邮箱验证码')
  }

  const account = resolveAccountInput(input)

  if (isAuthingConfigured() && !isAuthingDevMode()) {
    await sendAuthingVerificationCode(input, account)
    return buildOtpSendResult(account, OTP_RESEND_COOLDOWN_SECONDS)
  }

  if (isAuthingDevMode()) {
    const { code, retryAfterSeconds } = issueSmsChallenge(account.normalized)
    logStructured('auth', 'info', formatAuthDevSmsLog(account.normalized, code))
    return {
      ...buildOtpSendResult(account, retryAfterSeconds),
      devHint: getDevSmsHint(),
    }
  }

  return sendPhoneSmsCode({ ...input, phone: account.phone ?? account.normalized }).then((result) => ({
    ...result,
    account: result.account ?? result.phone ?? account.normalized,
    channel: 'phone' as const,
    maskedAccount: result.maskedAccount ?? result.maskedPhone ?? maskCnAuthAccount(account),
    expiresInSeconds: getOtpTtlSeconds(),
  }))
}
