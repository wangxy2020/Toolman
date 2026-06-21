import { randomUUID } from 'node:crypto'

import { formatAuthDevSmsLog, type AuthSendSmsCodeInput, type AuthSendSmsCodeOutput } from '@toolman/shared'

import { OTP_CODE_TTL_SECONDS } from './auth-otp.constants.js'
import { AuthLoginError } from './auth-login.error.js'
import {
  getDevSmsHint,
  issueSmsChallenge,
  verifySmsChallenge,
} from './auth-sms-challenge.service.js'
import { maskPhone, normalizeCnPhone } from './phone-utils.js'
import {
  getTencentSmsConfig,
  isTencentPhoneAuthAvailable,
  isTencentSmsDevMode,
} from './tencent-auth.config.js'
import { sendTencentSmsCode } from './tencent-sms.service.js'

export interface TencentPhoneAuthResult {
  phone: string
  subjectId: string
  sessionToken: string
  label: string
}

export async function sendPhoneSmsCode(input: AuthSendSmsCodeInput): Promise<AuthSendSmsCodeOutput> {
  if (input.region !== 'cn') {
    throw new AuthLoginError('当前仅支持国内手机号验证码')
  }

  if (!isTencentPhoneAuthAvailable()) {
    throw new AuthLoginError('腾讯云短信未配置，请设置 TOOLMAN_TENCENT_* 环境变量')
  }

  const phone = normalizeCnPhone(input.phone ?? input.account ?? '')
  const { code, retryAfterSeconds } = issueSmsChallenge(phone)

  const smsConfig = getTencentSmsConfig()
  if (smsConfig) {
    await sendTencentSmsCode(smsConfig, phone, code)
  } else if (isTencentSmsDevMode()) {
    console.log(formatAuthDevSmsLog(phone, code))
  }

  return {
    account: phone,
    channel: 'phone' as const,
    maskedAccount: maskPhone(phone),
    phone,
    maskedPhone: maskPhone(phone),
    retryAfterSeconds,
    expiresInSeconds: OTP_CODE_TTL_SECONDS,
    devHint: getDevSmsHint(),
  }
}

export function verifyPhoneSmsLogin(phoneInput: string, codeInput: string): TencentPhoneAuthResult {
  const phone = normalizeCnPhone(phoneInput)
  const code = codeInput.trim()
  if (!/^\d{4,8}$/.test(code)) {
    throw new AuthLoginError('请输入有效验证码')
  }

  verifySmsChallenge(phone, code)

  return {
    phone,
    subjectId: phone,
    sessionToken: randomUUID(),
    label: maskPhone(phone),
  }
}
