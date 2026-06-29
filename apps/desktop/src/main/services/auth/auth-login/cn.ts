import type { AuthLoginInput, AuthSession } from '@toolman/shared'
import { AuthLoginError } from '../auth-login.error.js'
import { formatAuthProviderNotConfiguredMessage } from '../auth-config-message.js'
import { persistAuthLogin } from '../auth-persist.service.js'
import { verifyCnVerificationLogin } from '../authing-otp-auth.service.js'
import { verifyCnEmailPasswordLogin } from '../authing-password-auth.service.js'
import { registerCnAccountWithOtp } from '../authing-register.service.js'
import {
  loginWithAuthingDouyinOAuth,
  loginWithAuthingWechatOAuth,
} from '../authing-social-oauth.service.js'
import { completeWechatPhoneMerge } from '../tencent-wechat-auth.service.js'
import { isCnAuthAvailable } from '../tencent-auth.config.js'
import { parseCnAuthAccount } from '../cn-account-utils.js'
import {
  CnEmailPasswordLoginPayloadSchema,
  CnRegisterPayloadSchema,
  OtpLoginPayloadSchema,
  WechatMergePayloadSchema,
} from './schemas.js'

export async function loginWithCn(parsed: AuthLoginInput): Promise<AuthSession> {
  if (parsed.method === 'tencent_wechat') {
    if (parsed.payload && 'mergeToken' in (parsed.payload as Record<string, unknown>)) {
      const payload = WechatMergePayloadSchema.parse(parsed.payload)
      return completeWechatPhoneMerge(payload)
    }
    return loginWithAuthingWechatOAuth()
  }

  if (parsed.method === 'tencent_douyin') {
    return loginWithAuthingDouyinOAuth()
  }

  if (parsed.method !== 'tencent_phone') {
    throw new AuthLoginError('不支持的国内登录方式')
  }

  if (!isCnAuthAvailable()) {
    throw new AuthLoginError(formatAuthProviderNotConfiguredMessage('cn'))
  }

  const rawPayload = parsed.payload ?? {}
  const intent = (rawPayload as { intent?: string }).intent ?? 'login'

  if (intent === 'register') {
    const registerPayload = CnRegisterPayloadSchema.parse(rawPayload)
    const parsedAccount = parseCnAuthAccount(registerPayload.account.trim())
    const registerResult = await registerCnAccountWithOtp(
      parsedAccount,
      registerPayload.code,
      registerPayload.password,
      registerPayload.confirmPassword,
    )

    return persistAuthLogin({
      region: 'cn',
      provider: 'tencent_phone',
      subjectId: registerResult.subjectId,
      bindingLabel: registerResult.label,
      bindingMetadata:
        parsedAccount.channel === 'email'
          ? { email: parsedAccount.email, label: registerResult.label }
          : { phone: registerResult.phone, label: registerResult.label },
      accessToken: registerResult.sessionToken,
      expiresInSeconds: 7 * 24 * 3600,
    })
  }

  const accountInput =
    typeof rawPayload.account === 'string'
      ? rawPayload.account.trim()
      : typeof rawPayload.phone === 'string'
        ? rawPayload.phone.trim()
        : ''
  const parsedAccount = parseCnAuthAccount(accountInput)

  if (parsedAccount.channel === 'email') {
    const payload = CnEmailPasswordLoginPayloadSchema.parse(rawPayload)
    const passwordResult = await verifyCnEmailPasswordLogin(parsedAccount, payload.password)

    return persistAuthLogin({
      region: 'cn',
      provider: 'tencent_phone',
      subjectId: passwordResult.subjectId,
      bindingLabel: passwordResult.label,
      bindingMetadata: { email: parsedAccount.email, label: passwordResult.label },
      accessToken: passwordResult.sessionToken,
      expiresInSeconds: 7 * 24 * 3600,
    })
  }

  const payload = OtpLoginPayloadSchema.parse(rawPayload)
  const otpResult = await verifyCnVerificationLogin(
    accountInput,
    payload.code,
    'login',
  )

  return persistAuthLogin({
    region: 'cn',
    provider: 'tencent_phone',
    subjectId: otpResult.subjectId,
    bindingLabel: otpResult.label,
    bindingMetadata: { phone: otpResult.phone, label: otpResult.label },
    accessToken: otpResult.sessionToken,
    expiresInSeconds: 7 * 24 * 3600,
  })
}
