import { z } from 'zod'

import {
  AuthChangePasswordInputSchema,
  AuthLoginInputSchema,
  AuthResetPasswordInputSchema,
  AuthSendSmsCodeInputSchema,
  type AuthChangePasswordInput,
  type AuthChangePasswordOutput,
  type AuthLoginInput,
  type AuthProvider,
  type AuthResetPasswordInput,
  type AuthResetPasswordOutput,
  type AuthSendSmsCodeInput,
  type AuthSendSmsCodeOutput,
  type AuthSession,
} from '@toolman/shared'

import { assertAuthLoginAllowed } from './auth-build-profile.service.js'
import { AuthLoginError } from './auth-login.error.js'
import { persistAuthLogin } from './auth-persist.service.js'
import { getFirebaseAuthConfig } from './firebase-auth.config'
import {
  firebaseLookupIdToken,
  firebaseSignInWithEmail,
  mapFirebaseProviderIds,
  type FirebaseAuthResult,
} from './firebase-auth.service'
import { sendCnVerificationCode, verifyCnVerificationLogin } from './authing-otp-auth.service.js'
import { verifyCnEmailPasswordLogin } from './authing-password-auth.service.js'
import { registerCnAccountWithOtp } from './authing-register.service.js'
import { resetCnAccountPassword } from './authing-password-reset.service.js'
import { changeCnAccountPassword } from './authing-change-password.service.js'
import {
  loginWithAuthingDouyinOAuth,
  loginWithAuthingWechatOAuth,
} from './authing-social-oauth.service.js'
import {
  completeWechatPhoneMerge,
} from './tencent-wechat-auth.service.js'
import { isCnAuthAvailable } from './tencent-auth.config.js'
import { finalizeRegisteredLogin } from './auth-profile-sync.service.js'
import { parseCnAuthAccount } from './cn-account-utils.js'
import { AuthSessionRepository } from '@toolman/db'

import { getDatabase } from '../../bootstrap/database.js'
import { getAuthSession } from '../auth-session.service.js'
import { decryptSecret } from '../secret-store.js'

const FIREBASE_PROVIDERS = new Set<AuthProvider>([
  'firebase_email',
  'firebase_google',
  'firebase_apple',
])

const CN_PROVIDERS = new Set<AuthProvider>(['tencent_phone', 'tencent_wechat', 'tencent_douyin'])

const EmailLoginPayloadSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  intent: z.enum(['login', 'register']).optional(),
})

const IdTokenLoginPayloadSchema = z.object({
  idToken: z.string().min(1),
})

const OtpLoginPayloadSchema = z.object({
  account: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
  code: z.string().min(4),
  intent: z.enum(['login', 'register']).optional(),
})

const CnEmailPasswordLoginPayloadSchema = z.object({
  account: z.string().min(1),
  password: z.string().min(6),
  intent: z.literal('login').optional(),
})

const CnRegisterPayloadSchema = z.object({
  account: z.string().min(1),
  code: z.string().min(4),
  password: z.string().min(6),
  confirmPassword: z.string().min(6),
  intent: z.literal('register'),
})

const WechatMergePayloadSchema = z.object({
  mergeToken: z.string().min(1),
  phone: z.string().min(1),
  code: z.string().min(4),
})

function buildBindingLabel(result: FirebaseAuthResult): string | undefined {
  return result.email ?? result.displayName ?? undefined
}

async function authenticateWithFirebase(
  input: AuthLoginInput,
  config: NonNullable<ReturnType<typeof getFirebaseAuthConfig>>,
): Promise<{ result: FirebaseAuthResult; provider: AuthProvider }> {
  if (input.method === 'firebase_email') {
    const payload = EmailLoginPayloadSchema.parse(input.payload ?? {})
    const intent = payload.intent ?? 'login'
    const result = await firebaseSignInWithEmail(config, payload.email, payload.password, intent)
    return { result, provider: 'firebase_email' }
  }

  const payload = IdTokenLoginPayloadSchema.parse(input.payload ?? {})
  const result = await firebaseLookupIdToken(config, payload.idToken)
  const provider = mapFirebaseProviderIds(result.providerIds, input.method)
  if (provider !== input.method) {
    throw new AuthLoginError('登录方式与 Firebase 账户绑定不一致')
  }
  return { result, provider }
}

function persistFirebaseLogin(input: {
  provider: AuthProvider
  result: FirebaseAuthResult
  region: 'intl'
}): AuthSession {
  const expiresInSeconds = Number.parseInt(input.result.expiresIn, 10)
  return persistAuthLogin({
    region: input.region,
    provider: input.provider,
    subjectId: input.result.localId,
    bindingLabel: buildBindingLabel(input.result),
    accessToken: input.result.idToken,
    refreshToken: input.result.refreshToken,
    expiresInSeconds: Number.isFinite(expiresInSeconds) ? expiresInSeconds : undefined,
  })
}

async function loginWithIntl(parsed: AuthLoginInput): Promise<AuthSession> {
  if (!FIREBASE_PROVIDERS.has(parsed.method)) {
    throw new AuthLoginError('不支持的登录方式')
  }

  const config = getFirebaseAuthConfig()
  if (!config) {
    throw new AuthLoginError('Firebase 未配置，请设置 TOOLMAN_FIREBASE_API_KEY 等环境变量')
  }

  const { result, provider } = await authenticateWithFirebase(parsed, config)
  return persistFirebaseLogin({ provider, result, region: 'intl' })
}

async function loginWithCn(parsed: AuthLoginInput): Promise<AuthSession> {
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
    throw new AuthLoginError('国内登录未配置，请设置 TOOLMAN_AUTHING_* 或 TOOLMAN_TENCENT_* 环境变量')
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

export async function loginAuth(input: AuthLoginInput): Promise<AuthSession> {
  const parsed = AuthLoginInputSchema.parse(input)
  assertAuthLoginAllowed(parsed.region, parsed.method)

  let session: AuthSession
  if (parsed.region === 'intl') {
    if (CN_PROVIDERS.has(parsed.method)) {
      throw new AuthLoginError('请切换到国内区域使用手机、邮箱或社交账号登录')
    }
    session = await loginWithIntl(parsed)
  } else {
    if (FIREBASE_PROVIDERS.has(parsed.method)) {
      throw new AuthLoginError('请切换到国际区域使用邮箱或 OAuth 登录')
    }
    session = await loginWithCn(parsed)
  }

  return finalizeRegisteredLogin(session)
}

export async function sendAuthSmsCode(input: AuthSendSmsCodeInput): Promise<AuthSendSmsCodeOutput> {
  const parsed = AuthSendSmsCodeInputSchema.parse(input)
  assertAuthLoginAllowed(parsed.region, 'tencent_phone')
  return sendCnVerificationCode(parsed)
}

export async function resetAuthPassword(input: AuthResetPasswordInput): Promise<AuthResetPasswordOutput> {
  const parsed = AuthResetPasswordInputSchema.parse(input)
  if (parsed.region !== 'cn') {
    throw new AuthLoginError('当前仅支持国内账号重置密码')
  }
  assertAuthLoginAllowed(parsed.region, 'tencent_phone')

  if (!isCnAuthAvailable()) {
    throw new AuthLoginError('国内登录未配置，请设置 TOOLMAN_AUTHING_* 环境变量')
  }

  await resetCnAccountPassword(
    parsed.account,
    parsed.code,
    parsed.password,
    parsed.confirmPassword,
  )
  return { ok: true as const }
}

export async function changeAuthPassword(input: AuthChangePasswordInput): Promise<AuthChangePasswordOutput> {
  const parsed = AuthChangePasswordInputSchema.parse(input)
  if (parsed.region !== 'cn') {
    throw new AuthLoginError('当前仅支持国内账号修改密码')
  }

  const session = getAuthSession()
  if (!session.isLoggedIn) {
    throw new AuthLoginError('请先登录后再修改密码')
  }

  const currentSession = new AuthSessionRepository(getDatabase()).getCurrent()
  const accessToken = decryptSecret(currentSession?.idTokenRef ?? currentSession?.accessTokenRef)
  if (!accessToken) {
    throw new AuthLoginError('当前登录状态已失效，请重新登录后再修改密码')
  }

  await changeCnAccountPassword({
    accessToken,
    oldPassword: parsed.oldPassword,
    newPassword: parsed.newPassword,
    confirmPassword: parsed.confirmPassword,
  })
  return { ok: true as const }
}
