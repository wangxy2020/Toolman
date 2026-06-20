import { z } from 'zod'

import {
  AuthLoginInputSchema,
  AuthSendSmsCodeInputSchema,
  type AuthLoginInput,
  type AuthProvider,
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
import {
  sendPhoneSmsCode,
  verifyPhoneSmsLogin,
} from './tencent-phone-auth.service.js'
import {
  completeWechatPhoneMerge,
  loginWithWechatOAuth,
} from './tencent-wechat-auth.service.js'
import { isTencentPhoneAuthAvailable } from './tencent-auth.config.js'
import { finalizeRegisteredLogin } from './auth-profile-sync.service.js'

const FIREBASE_PROVIDERS = new Set<AuthProvider>([
  'firebase_email',
  'firebase_google',
  'firebase_apple',
])

const CN_PROVIDERS = new Set<AuthProvider>(['tencent_phone', 'tencent_wechat'])

const EmailLoginPayloadSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  intent: z.enum(['login', 'register']).optional(),
})

const IdTokenLoginPayloadSchema = z.object({
  idToken: z.string().min(1),
})

const PhoneLoginPayloadSchema = z.object({
  phone: z.string().min(1),
  code: z.string().min(4),
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
    return loginWithWechatOAuth()
  }

  if (parsed.method !== 'tencent_phone') {
    throw new AuthLoginError('不支持的国内登录方式')
  }

  if (!isTencentPhoneAuthAvailable()) {
    throw new AuthLoginError('腾讯云短信未配置，请设置 TOOLMAN_TENCENT_* 环境变量')
  }

  const payload = PhoneLoginPayloadSchema.parse(parsed.payload ?? {})
  const phoneResult = verifyPhoneSmsLogin(payload.phone, payload.code)

  return persistAuthLogin({
    region: 'cn',
    provider: 'tencent_phone',
    subjectId: phoneResult.subjectId,
    bindingLabel: phoneResult.label,
    bindingMetadata: { phone: phoneResult.phone, label: phoneResult.label },
    accessToken: phoneResult.sessionToken,
    expiresInSeconds: 7 * 24 * 3600,
  })
}

export async function loginAuth(input: AuthLoginInput): Promise<AuthSession> {
  const parsed = AuthLoginInputSchema.parse(input)
  assertAuthLoginAllowed(parsed.region, parsed.method)

  let session: AuthSession
  if (parsed.region === 'intl') {
    if (CN_PROVIDERS.has(parsed.method)) {
      throw new AuthLoginError('请切换到国内区域使用手机号或微信登录')
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
  return sendPhoneSmsCode(parsed)
}
