import {
  AuthChangePasswordInputSchema,
  AuthLoginInputSchema,
  AuthResetPasswordInputSchema,
  AuthSendSmsCodeInputSchema,
  type AuthChangePasswordInput,
  type AuthChangePasswordOutput,
  type AuthLoginInput,
  type AuthResetPasswordInput,
  type AuthResetPasswordOutput,
  type AuthSendSmsCodeInput,
  type AuthSendSmsCodeOutput,
  type AuthSession,
} from '@toolman/shared'
import { AuthSessionRepository } from '@toolman/db'

import { assertAuthLoginAllowed } from '../auth-build-profile.service.js'
import { formatAuthProviderNotConfiguredMessage } from '../auth-config-message.js'
import { AuthLoginError } from '../auth-login.error.js'
import { refreshAuthSessionTokens } from '../auth-persist.service.js'
import { getFirebaseAuthConfig } from '../firebase-auth.config'
import {
  firebaseChangeEmailPassword,
  firebaseSendPasswordResetEmail,
} from '../firebase-auth.service'
import { assertMatchingPasswords, assertValidPasswordLength } from '../authing-password-utils.js'
import { sendCnVerificationCode } from '../authing-otp-auth.service.js'
import { resetCnAccountPassword } from '../authing-password-reset.service.js'
import { changeCnAccountPassword } from '../authing-change-password.service.js'
import { isCnAuthAvailable } from '../tencent-auth.config.js'
import { finalizeRegisteredLogin } from '../auth-profile-sync.service.js'
import { getDatabase } from '../../../bootstrap/database.js'
import { getAuthSession } from '../../auth-session.service.js'
import { decryptSecret } from '../../secret-store.js'
import { CN_PROVIDERS, FIREBASE_PROVIDERS } from './schemas.js'
import { loginWithIntl } from './firebase.js'
import { loginWithCn } from './cn.js'

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

  if (parsed.region === 'intl') {
    assertAuthLoginAllowed('intl', 'firebase_email')
    const config = getFirebaseAuthConfig()
    if (!config) {
      throw new AuthLoginError(formatAuthProviderNotConfiguredMessage('firebase'))
    }

    await firebaseSendPasswordResetEmail(config, parsed.account)
    return {
      ok: true as const,
      message: '密码重置邮件已发送，请查收邮箱并完成重置。',
    }
  }

  assertAuthLoginAllowed(parsed.region, 'tencent_phone')

  if (!isCnAuthAvailable()) {
    throw new AuthLoginError(formatAuthProviderNotConfiguredMessage('cn'))
  }

  await resetCnAccountPassword(
    parsed.account,
    parsed.code,
    parsed.password,
    parsed.confirmPassword,
  )
  return { ok: true as const }
}

function resolveFirebaseEmailFromSession(session: AuthSession): string {
  const emailBinding = session.bindings.find((binding) => binding.provider === 'firebase_email')
  if (!emailBinding) {
    throw new AuthLoginError('当前账户未使用邮箱密码登录，无法修改密码')
  }

  if (emailBinding.label?.includes('@')) {
    return emailBinding.label
  }

  throw new AuthLoginError('无法识别当前绑定的邮箱地址')
}

export async function changeAuthPassword(input: AuthChangePasswordInput): Promise<AuthChangePasswordOutput> {
  const parsed = AuthChangePasswordInputSchema.parse(input)
  assertValidPasswordLength(parsed.newPassword)
  assertMatchingPasswords(parsed.newPassword, parsed.confirmPassword)

  const session = getAuthSession()
  if (!session.isLoggedIn) {
    throw new AuthLoginError('请先登录后再修改密码')
  }

  if (parsed.region === 'intl') {
    assertAuthLoginAllowed('intl', 'firebase_email')
    const config = getFirebaseAuthConfig()
    if (!config) {
      throw new AuthLoginError(formatAuthProviderNotConfiguredMessage('firebase'))
    }

    const email = resolveFirebaseEmailFromSession(session)
    const result = await firebaseChangeEmailPassword(
      config,
      email,
      parsed.oldPassword,
      parsed.newPassword,
    )

    const emailBinding = session.bindings.find((binding) => binding.provider === 'firebase_email')
    if (emailBinding && result.localId !== emailBinding.subjectId) {
      throw new AuthLoginError('邮箱或密码错误')
    }

    const expiresInSeconds = Number.parseInt(result.expiresIn, 10)
    refreshAuthSessionTokens({
      accessToken: result.idToken,
      refreshToken: result.refreshToken,
      expiresInSeconds: Number.isFinite(expiresInSeconds) ? expiresInSeconds : undefined,
    })
    return { ok: true as const }
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
