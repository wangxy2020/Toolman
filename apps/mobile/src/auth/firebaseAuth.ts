import { Platform } from 'react-native'
import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import {
  getAuth,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
  type Auth,
} from 'firebase/auth'
import { getMobileFirebaseConfig } from './firebaseConfig'
import {
  establishExternalSession,
  type AuthResult,
} from './localAuth'

type FirebaseProvider = 'firebase_email' | 'firebase_google' | 'firebase_apple'

interface IdentityToolkitError {
  error?: { message?: string; code?: number }
}

let firebaseApp: FirebaseApp | null = null
let firebaseAuth: Auth | null = null

function mapFirebaseErrorMessage(message: string): string {
  if (message.includes('EMAIL_EXISTS')) return '该邮箱已注册，请直接登录'
  if (message.includes('INVALID_PASSWORD')) return '邮箱或密码错误'
  if (message.includes('INVALID_LOGIN_CREDENTIALS')) return '邮箱或密码错误'
  if (message.includes('EMAIL_NOT_FOUND')) return '邮箱或密码错误'
  if (message.includes('WEAK_PASSWORD')) return '密码强度不足，请至少 6 位'
  if (message.includes('TOO_MANY_ATTEMPTS_TRY_LATER')) return '尝试次数过多，请稍后再试'
  if (message.includes('INVALID_EMAIL')) return '邮箱格式不正确'
  if (message.includes('MISSING_EMAIL')) return '请输入邮箱'
  if (message.includes('USER_DISABLED')) return '该账号已被禁用'
  return message
}

export function formatFirebaseClientError(error: unknown): string {
  const code =
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code?: unknown }).code === 'string'
      ? (error as { code: string }).code
      : null

  switch (code) {
    case 'auth/configuration-not-found':
      return 'Firebase 身份验证尚未就绪，请在控制台启用 Google / Apple 登录。'
    case 'auth/unauthorized-domain':
      return '当前域名未授权。请在 Firebase 控制台 → Authentication → 授权域名 中添加本机域名。'
    case 'auth/popup-closed-by-user':
      return '已取消登录。'
    case 'auth/popup-blocked':
      return '登录窗口被拦截，请允许弹窗后重试。'
    case 'auth/operation-not-supported-in-this-environment':
      return '当前环境不支持该登录方式，请使用浏览器打开移动端页面。'
    default:
      break
  }

  if (error instanceof Error && error.message.trim()) {
    return mapFirebaseErrorMessage(error.message)
  }
  return 'Firebase 登录失败，请稍后重试。'
}

async function postIdentityToolkit<T>(
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const config = getMobileFirebaseConfig()
  if (!config) {
    throw new Error('国际登录未配置')
  }
  const url = `https://identitytoolkit.googleapis.com/v1/${path}?key=${encodeURIComponent(config.apiKey)}`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = (await response.json()) as IdentityToolkitError & T
  if (!response.ok) {
    const raw = data.error?.message ?? 'Firebase 请求失败'
    throw new Error(mapFirebaseErrorMessage(raw))
  }
  return data
}

async function ensureFirebaseAuth(): Promise<Auth> {
  const config = getMobileFirebaseConfig()
  if (!config) {
    throw new Error('国际登录未配置')
  }
  if (!firebaseApp) {
    firebaseApp =
      getApps()[0] ??
      initializeApp({
        apiKey: config.apiKey,
        authDomain: config.authDomain,
        projectId: config.projectId,
        ...(config.appId ? { appId: config.appId } : {}),
      })
    firebaseAuth = getAuth(firebaseApp)
  }
  return firebaseAuth!
}

async function sessionFromFirebaseUser(input: {
  localId: string
  email: string | null
  displayName: string | null
  idToken: string
  provider: FirebaseProvider
}): Promise<AuthResult> {
  return establishExternalSession({
    externalId: input.localId,
    email: input.email,
    displayName: input.displayName,
    accessToken: input.idToken,
    provider: input.provider,
    region: 'intl',
  })
}

export async function firebaseEmailAuth(input: {
  email: string
  password: string
  intent: 'login' | 'register'
  displayName?: string
}): Promise<AuthResult> {
  const email = input.email.trim()
  if (!email.includes('@')) {
    return { ok: false, message: '请输入邮箱' }
  }
  if (input.password.length < 6) {
    return { ok: false, message: '密码至少 6 位' }
  }

  try {
    const path = input.intent === 'register' ? 'accounts:signUp' : 'accounts:signInWithPassword'
    const data = await postIdentityToolkit<{
      localId: string
      email?: string
      displayName?: string
      idToken: string
    }>(path, {
      email,
      password: input.password,
      returnSecureToken: true,
    })

    return sessionFromFirebaseUser({
      localId: data.localId,
      email: data.email ?? email,
      displayName:
        data.displayName ??
        (input.displayName?.trim() || email.split('@')[0] || 'Toolman 用户'),
      idToken: data.idToken,
      provider: 'firebase_email',
    })
  } catch (error) {
    return { ok: false, message: formatFirebaseClientError(error) }
  }
}

export async function firebaseSendPasswordReset(email: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const trimmed = email.trim()
  if (!trimmed.includes('@')) {
    return { ok: false, message: '请输入注册邮箱' }
  }
  try {
    await postIdentityToolkit('accounts:sendOobCode', {
      requestType: 'PASSWORD_RESET',
      email: trimmed,
    })
    return { ok: true }
  } catch (error) {
    return { ok: false, message: formatFirebaseClientError(error) }
  }
}

export async function firebaseOAuthLogin(
  provider: 'firebase_google' | 'firebase_apple',
): Promise<AuthResult> {
  if (Platform.OS !== 'web') {
    return {
      ok: false,
      message: 'Google / Apple 登录请在浏览器中打开移动端页面后使用。',
    }
  }

  try {
    const auth = await ensureFirebaseAuth()
    const credentialProvider =
      provider === 'firebase_google'
        ? new GoogleAuthProvider()
        : (() => {
            const apple = new OAuthProvider('apple.com')
            apple.addScope('email')
            apple.addScope('name')
            return apple
          })()
    const result = await signInWithPopup(auth, credentialProvider)
    const idToken = await result.user.getIdToken()
    return sessionFromFirebaseUser({
      localId: result.user.uid,
      email: result.user.email,
      displayName: result.user.displayName,
      idToken,
      provider,
    })
  } catch (error) {
    return { ok: false, message: formatFirebaseClientError(error) }
  }
}
