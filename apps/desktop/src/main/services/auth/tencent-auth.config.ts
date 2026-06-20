import { getWechatOpenConfig, isWechatAuthAvailable, isWechatDevMode } from './wechat-auth.config.js'

export interface TencentSmsConfig {
  secretId: string
  secretKey: string
  smsSdkAppId: string
  signName: string
  templateId: string
  region: string
}

const ENV_KEYS = {
  secretId: ['TOOLMAN_TENCENT_SECRET_ID', 'TENCENT_SECRET_ID'],
  secretKey: ['TOOLMAN_TENCENT_SECRET_KEY', 'TENCENT_SECRET_KEY'],
  smsSdkAppId: ['TOOLMAN_TENCENT_SMS_SDK_APP_ID', 'TENCENT_SMS_SDK_APP_ID'],
  signName: ['TOOLMAN_TENCENT_SMS_SIGN_NAME', 'TENCENT_SMS_SIGN_NAME'],
  templateId: ['TOOLMAN_TENCENT_SMS_TEMPLATE_ID', 'TENCENT_SMS_TEMPLATE_ID'],
  region: ['TOOLMAN_TENCENT_SMS_REGION', 'TENCENT_SMS_REGION'],
} as const

function readEnv(keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]?.trim()
    if (value) return value
  }
  return undefined
}

function isTruthyEnv(value: string | undefined): boolean {
  if (!value) return false
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
}

export function isTencentSmsDevMode(): boolean {
  return isTruthyEnv(process.env.TOOLMAN_TENCENT_SMS_DEV_MODE ?? process.env.TENCENT_SMS_DEV_MODE)
}

export function getTencentSmsConfig(): TencentSmsConfig | null {
  const secretId = readEnv(ENV_KEYS.secretId)
  const secretKey = readEnv(ENV_KEYS.secretKey)
  const smsSdkAppId = readEnv(ENV_KEYS.smsSdkAppId)
  const signName = readEnv(ENV_KEYS.signName)
  const templateId = readEnv(ENV_KEYS.templateId)

  if (!secretId || !secretKey || !smsSdkAppId || !signName || !templateId) {
    return null
  }

  return {
    secretId,
    secretKey,
    smsSdkAppId,
    signName,
    templateId,
    region: readEnv(ENV_KEYS.region) ?? 'ap-guangzhou',
  }
}

export function getTencentWebConfig():
  | {
      configured: true
      smsDevMode: boolean
      wechatDevMode: boolean
      wechatConfigured: boolean
      phoneConfigured: boolean
    }
  | { configured: false } {
  const smsAvailable = Boolean(getTencentSmsConfig() || isTencentSmsDevMode())
  const wechatAvailable = isWechatAuthAvailable()
  if (smsAvailable || wechatAvailable) {
    return {
      configured: true,
      smsDevMode: isTencentSmsDevMode() || !getTencentSmsConfig(),
      wechatDevMode: isWechatDevMode() || !getWechatOpenConfig(),
      wechatConfigured: wechatAvailable,
      phoneConfigured: smsAvailable,
    }
  }
  return { configured: false }
}

export function isTencentPhoneAuthAvailable(): boolean {
  return Boolean(getTencentSmsConfig() || isTencentSmsDevMode())
}
