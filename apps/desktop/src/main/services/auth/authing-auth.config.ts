import { isDevModeEnvEnabled } from './auth-dev-guard.js'

export interface AuthingConfig {
  appId: string
  /** User pool ID for Management API; falls back to appId when unset. */
  userPoolId: string
  /** Application secret (AuthenticationClient). */
  appSecret: string
  /** User pool secret for Management API; falls back to appSecret when unset. */
  userPoolSecret: string
  appHost: string
  wechatProvider: string
  douyinProvider: string
  oauthCallbackPort: number
}

function readEnv(keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]?.trim()
    if (value) return value
  }
  return undefined
}

function readPositiveIntEnv(keys: readonly string[], fallback: number): number {
  for (const key of keys) {
    const raw = process.env[key]?.trim()
    if (!raw) continue
    const parsed = Number.parseInt(raw, 10)
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed
    }
  }
  return fallback
}

export function getAuthingOtpTtlSeconds(fallbackSeconds: number): number {
  return readPositiveIntEnv(['TOOLMAN_AUTHING_OTP_TTL_SECONDS', 'TOOLMAN_OTP_TTL_SECONDS'], fallbackSeconds)
}

export function isAuthingDevMode(): boolean {
  return isDevModeEnvEnabled(['TOOLMAN_AUTHING_DEV_MODE'])
}

export function getAuthingConfig(): AuthingConfig | null {
  const appId = readEnv(['TOOLMAN_AUTHING_APP_ID', 'AUTHING_APP_ID'])
  const userPoolId = readEnv(['TOOLMAN_AUTHING_USER_POOL_ID', 'AUTHING_USER_POOL_ID'])
  const appSecret = readEnv(['TOOLMAN_AUTHING_APP_SECRET', 'AUTHING_APP_SECRET'])
  const userPoolSecret = readEnv([
    'TOOLMAN_AUTHING_USER_POOL_SECRET',
    'AUTHING_USER_POOL_SECRET',
    'TOOLMAN_AUTHING_APP_SECRET',
    'AUTHING_APP_SECRET',
  ])
  const appHost = readEnv(['TOOLMAN_AUTHING_APP_HOST', 'AUTHING_APP_HOST'])

  if (!appId || !appHost) {
    return null
  }

  const portRaw = readEnv(['TOOLMAN_AUTHING_OAUTH_CALLBACK_PORT'])
  const oauthCallbackPort = portRaw ? Number.parseInt(portRaw, 10) : 42873
  const resolvedUserPoolId = userPoolId ?? appId

  return {
    appId,
    userPoolId: resolvedUserPoolId,
    appSecret: appSecret ?? '',
    userPoolSecret: userPoolSecret ?? '',
    appHost: appHost.replace(/\/$/, ''),
    wechatProvider: readEnv(['TOOLMAN_AUTHING_WECHAT_PROVIDER']) ?? 'wechat:pc',
    douyinProvider: readEnv(['TOOLMAN_AUTHING_DOUYIN_PROVIDER']) ?? 'douyin',
    oauthCallbackPort: Number.isFinite(oauthCallbackPort) ? oauthCallbackPort : 42873,
  }
}

export function isAuthingConfigured(): boolean {
  return Boolean(getAuthingConfig()) || isAuthingDevMode()
}

export function getAuthingOAuthRedirectUri(port = getAuthingConfig()?.oauthCallbackPort ?? 42873): string {
  return `http://127.0.0.1:${port}/authing/callback`
}

export function getAuthingWebConfig():
  | {
      configured: true
      devMode: boolean
      otpConfigured: boolean
      wechatConfigured: boolean
      douyinConfigured: boolean
    }
  | { configured: false } {
  const config = getAuthingConfig()
  const devMode = isAuthingDevMode()

  if (!config && !devMode) {
    return { configured: false }
  }

  return {
    configured: true,
    devMode,
    otpConfigured: Boolean(config) || devMode,
    wechatConfigured: Boolean(config) || devMode,
    douyinConfigured: Boolean(config) || devMode,
  }
}
