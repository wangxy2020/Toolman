import type { AuthProvider } from '@toolman/shared'

import type { FirebaseAuthConfig } from './firebase-auth.config.js'

export interface FirebaseAuthResult {
  localId: string
  email: string | null
  displayName: string | null
  idToken: string
  refreshToken: string | null
  expiresIn: string
  providerIds: string[]
}

import { AuthLoginError } from './auth-login.error.js'

export class FirebaseAuthError extends AuthLoginError {
  constructor(message: string, code?: string) {
    super(message, code)
    this.name = 'FirebaseAuthError'
  }
}

interface IdentityToolkitError {
  error?: {
    message?: string
    code?: number
  }
}

function mapFirebaseErrorMessage(message: string): string {
  if (message.includes('EMAIL_EXISTS')) return '该邮箱已注册，请直接登录'
  if (message.includes('INVALID_PASSWORD')) return '邮箱或密码错误'
  if (message.includes('INVALID_LOGIN_CREDENTIALS')) return '邮箱或密码错误'
  if (message.includes('EMAIL_NOT_FOUND')) return '邮箱或密码错误'
  if (message.includes('WEAK_PASSWORD')) return '密码强度不足，请至少 6 位'
  if (message.includes('TOO_MANY_ATTEMPTS_TRY_LATER')) return '尝试次数过多，请稍后再试'
  if (message.includes('INVALID_ID_TOKEN')) return '登录凭证无效或已过期，请重试'
  if (message.includes('INVALID_EMAIL')) return '邮箱格式不正确'
  if (message.includes('MISSING_EMAIL')) return '请输入邮箱'
  return message
}

async function postIdentityToolkit<T>(
  config: FirebaseAuthConfig,
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const url = `https://identitytoolkit.googleapis.com/v1/${path}?key=${encodeURIComponent(config.apiKey)}`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const data = (await response.json()) as IdentityToolkitError & T
  if (!response.ok) {
    const rawMessage = data.error?.message ?? 'Firebase 请求失败'
    throw new FirebaseAuthError(mapFirebaseErrorMessage(rawMessage), String(data.error?.code ?? response.status))
  }

  return data
}

function extractProviderIds(
  providerUserInfo: Array<{ providerId?: string }> | undefined,
): string[] {
  return providerUserInfo?.map((item) => item.providerId).filter((id): id is string => Boolean(id)) ?? []
}

export function mapFirebaseProviderIds(providerIds: string[], fallback: AuthProvider): AuthProvider {
  if (providerIds.includes('google.com')) return 'firebase_google'
  if (providerIds.includes('apple.com')) return 'firebase_apple'
  if (providerIds.includes('password')) return 'firebase_email'
  return fallback
}

export async function firebaseSignInWithEmail(
  config: FirebaseAuthConfig,
  email: string,
  password: string,
  intent: 'login' | 'register',
): Promise<FirebaseAuthResult> {
  const path = intent === 'register' ? 'accounts:signUp' : 'accounts:signInWithPassword'
  const data = await postIdentityToolkit<{
    localId: string
    email?: string
    displayName?: string
    idToken: string
    refreshToken?: string
    expiresIn: string
  }>(config, path, {
    email,
    password,
    returnSecureToken: true,
  })

  return {
    localId: data.localId,
    email: data.email ?? email,
    displayName: data.displayName ?? null,
    idToken: data.idToken,
    refreshToken: data.refreshToken ?? null,
    expiresIn: data.expiresIn,
    providerIds: ['password'],
  }
}

export async function firebaseLookupIdToken(
  config: FirebaseAuthConfig,
  idToken: string,
): Promise<FirebaseAuthResult> {
  const data = await postIdentityToolkit<{
    users: Array<{
      localId: string
      email?: string
      displayName?: string
      providerUserInfo?: Array<{ providerId?: string }>
    }>
  }>(config, 'accounts:lookup', { idToken })

  const user = data.users?.[0]
  if (!user) {
    throw new FirebaseAuthError('无效的身份令牌')
  }

  const providerIds = extractProviderIds(user.providerUserInfo)
  return {
    localId: user.localId,
    email: user.email ?? null,
    displayName: user.displayName ?? null,
    idToken,
    refreshToken: null,
    expiresIn: '3600',
    providerIds,
  }
}

export async function firebaseDeleteUser(config: FirebaseAuthConfig, idToken: string): Promise<void> {
  await postIdentityToolkit(config, 'accounts:delete', { idToken })
}

export async function firebaseSendPasswordResetEmail(
  config: FirebaseAuthConfig,
  email: string,
): Promise<void> {
  await postIdentityToolkit(config, 'accounts:sendOobCode', {
    requestType: 'PASSWORD_RESET',
    email: email.trim(),
  })
}

export async function firebaseChangeEmailPassword(
  config: FirebaseAuthConfig,
  email: string,
  oldPassword: string,
  newPassword: string,
): Promise<FirebaseAuthResult> {
  const signIn = await firebaseSignInWithEmail(config, email.trim(), oldPassword, 'login')
  const data = await postIdentityToolkit<{
    localId: string
    email?: string
    idToken: string
    refreshToken?: string
    expiresIn: string
  }>(config, 'accounts:update', {
    idToken: signIn.idToken,
    password: newPassword,
    returnSecureToken: true,
  })

  return {
    localId: data.localId,
    email: data.email ?? email.trim(),
    displayName: signIn.displayName,
    idToken: data.idToken,
    refreshToken: data.refreshToken ?? signIn.refreshToken,
    expiresIn: data.expiresIn,
    providerIds: ['password'],
  }
}
