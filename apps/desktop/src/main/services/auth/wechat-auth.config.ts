import { isDevModeEnvEnabled } from './auth-dev-guard.js'

export interface WechatOpenConfig {
  appId: string
  appSecret: string
  redirectUri: string
}

const ENV_KEYS = {
  appId: ['TOOLMAN_WECHAT_OPEN_APP_ID', 'WECHAT_OPEN_APP_ID'],
  appSecret: ['TOOLMAN_WECHAT_OPEN_APP_SECRET', 'WECHAT_OPEN_APP_SECRET'],
  redirectUri: ['TOOLMAN_WECHAT_REDIRECT_URI', 'WECHAT_REDIRECT_URI'],
  redirectPort: ['TOOLMAN_WECHAT_REDIRECT_PORT', 'WECHAT_REDIRECT_PORT'],
} as const

function readEnv(keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]?.trim()
    if (value) return value
  }
  return undefined
}

export function isWechatDevMode(): boolean {
  return isDevModeEnvEnabled(['TOOLMAN_WECHAT_DEV_MODE', 'WECHAT_DEV_MODE'])
}

export function getWechatRedirectUri(): string {
  const configured = readEnv(ENV_KEYS.redirectUri)
  if (configured) return configured
  const port = readEnv(ENV_KEYS.redirectPort) ?? '47823'
  return `http://127.0.0.1:${port}/auth/wechat/callback`
}

export function getWechatOpenConfig(): WechatOpenConfig | null {
  const appId = readEnv(ENV_KEYS.appId)
  const appSecret = readEnv(ENV_KEYS.appSecret)
  if (!appId || !appSecret) return null
  return {
    appId,
    appSecret,
    redirectUri: getWechatRedirectUri(),
  }
}

export function isWechatAuthAvailable(): boolean {
  return Boolean(getWechatOpenConfig()) || isWechatDevMode()
}
