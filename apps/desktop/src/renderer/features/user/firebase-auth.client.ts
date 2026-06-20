import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import {
  getAuth,
  GoogleAuthProvider,
  OAuthProvider,
  getRedirectResult,
  signInWithPopup,
  signInWithRedirect,
  type Auth,
} from 'firebase/auth'

import type { AuthProvider } from '@toolman/shared'

import { getFirebaseWebConfig } from './auth-api.client'

const OAUTH_PROVIDER_STORAGE_KEY = 'toolman:firebase-oauth-provider'

let firebaseApp: FirebaseApp | null = null
let firebaseAuth: Auth | null = null

function isElectronRenderer(): boolean {
  return typeof window !== 'undefined' && typeof window.api !== 'undefined'
}

function buildCredentialProvider(provider: AuthProvider) {
  if (provider === 'firebase_google') {
    return new GoogleAuthProvider()
  }

  const appleProvider = new OAuthProvider('apple.com')
  appleProvider.addScope('email')
  appleProvider.addScope('name')
  return appleProvider
}

async function ensureFirebaseAuth(): Promise<Auth> {
  const config = await getFirebaseWebConfig()
  if (!config.configured) {
    throw new Error('Firebase 未配置，请设置 TOOLMAN_FIREBASE_* 环境变量')
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

export function formatFirebaseAuthError(error: unknown): string {
  const code =
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code?: unknown }).code === 'string'
      ? (error as { code: string }).code
      : null

  switch (code) {
    case 'auth/configuration-not-found':
      return [
        'Firebase 身份验证尚未就绪。',
        '请在 Firebase 控制台完成以下步骤：',
        '1. 打开 Authentication → 登录方法，先启用任意一种登录方式；',
        '2. 启用 Google 登录；',
        '3. 在「设置 → 授权域名」中添加 localhost。',
      ].join('\n')
    case 'auth/unauthorized-domain':
      return '当前域名未授权。请在 Firebase 控制台 → Authentication → 设置 → 授权域名 中添加 localhost。'
    case 'auth/operation-not-supported-in-this-environment':
      return '当前环境不支持该登录方式，请更新 Toolman 后重试。'
    case 'auth/popup-closed-by-user':
      return '已取消 Google 登录。'
    case 'auth/popup-blocked':
      return '登录窗口被拦截，请允许弹窗后重试。'
    default:
      break
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message
  }

  return 'Firebase 登录失败，请稍后重试。'
}

export async function isFirebaseAuthConfigured(): Promise<boolean> {
  const config = await getFirebaseWebConfig()
  return config.configured
}

export async function consumeFirebaseRedirectLogin(): Promise<{
  provider: AuthProvider
  idToken: string
} | null> {
  if (!isElectronRenderer()) return null

  const auth = await ensureFirebaseAuth()
  const result = await getRedirectResult(auth)
  if (!result?.user) return null

  const storedProvider = sessionStorage.getItem(OAUTH_PROVIDER_STORAGE_KEY)
  sessionStorage.removeItem(OAUTH_PROVIDER_STORAGE_KEY)

  const provider =
    storedProvider === 'firebase_google' || storedProvider === 'firebase_apple'
      ? storedProvider
      : 'firebase_google'

  return {
    provider,
    idToken: await result.user.getIdToken(),
  }
}

export async function signInWithFirebaseOAuth(provider: AuthProvider): Promise<string> {
  if (provider !== 'firebase_google' && provider !== 'firebase_apple') {
    throw new Error('不支持的 OAuth 登录方式')
  }

  const auth = await ensureFirebaseAuth()
  const credentialProvider = buildCredentialProvider(provider)

  if (isElectronRenderer()) {
    sessionStorage.setItem(OAUTH_PROVIDER_STORAGE_KEY, provider)
    await signInWithRedirect(auth, credentialProvider)
    throw new Error('正在跳转到授权页面…')
  }

  const result = await signInWithPopup(auth, credentialProvider)
  return result.user.getIdToken()
}
