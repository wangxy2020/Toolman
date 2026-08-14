/** Authing app config for mobile CN OTP (same tenant as desktop). */

export type MobileAuthingConfig = {
  appId: string
  appHost: string
  appSecret?: string
}

const FALLBACK: MobileAuthingConfig = {
  appId: '6a7ae3aacfbc80164864c644',
  appHost: 'https://toolman.authing.cn',
}

function readEnv(keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]?.trim()
    if (value) return value
  }
  return undefined
}

export function getMobileAuthingConfig(): MobileAuthingConfig | null {
  const appId =
    readEnv(['EXPO_PUBLIC_AUTHING_APP_ID', 'TOOLMAN_AUTHING_APP_ID']) ?? FALLBACK.appId
  const appHost = (
    readEnv(['EXPO_PUBLIC_AUTHING_APP_HOST', 'TOOLMAN_AUTHING_APP_HOST']) ?? FALLBACK.appHost
  ).replace(/\/$/, '')
  const appSecret = readEnv(['EXPO_PUBLIC_AUTHING_APP_SECRET', 'TOOLMAN_AUTHING_APP_SECRET'])

  if (!appId || !appHost) return null
  return { appId, appHost, ...(appSecret ? { appSecret } : {}) }
}

export function isMobileAuthingDevMode(): boolean {
  const raw =
    readEnv(['EXPO_PUBLIC_AUTHING_DEV_MODE', 'TOOLMAN_AUTHING_DEV_MODE']) ?? ''
  return raw === '1' || raw.toLowerCase() === 'true'
}

/** Same Authing tenant as desktop CN login (appId + host; secret optional). */
export function canUseAuthingRemoteAuth(): boolean {
  const config = getMobileAuthingConfig()
  return Boolean(config?.appId && config.appHost) && !isMobileAuthingDevMode()
}
