import { app } from 'electron'
import { logStructured } from '../structured-log.service.js'

function isTruthyEnv(value: string | undefined): boolean {
  if (!value) return false
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
}

const PACKAGED_FORBIDDEN_DEV_ENVS = [
  'TOOLMAN_AUTHING_DEV_MODE',
  'TOOLMAN_TENCENT_SMS_DEV_MODE',
  'TENCENT_SMS_DEV_MODE',
  'TOOLMAN_WECHAT_DEV_MODE',
  'WECHAT_DEV_MODE',
  'TOOLMAN_BILLING_MOCK',
] as const

export function isDevModeEnvEnabled(envKeys: readonly string[]): boolean {
  for (const key of envKeys) {
    const value = process.env[key]?.trim()
    if (!isTruthyEnv(value)) continue
    if (app.isPackaged) {
      logStructured('auth', 'error', 'Ignoring forbidden dev env in packaged build', { key })
      return false
    }
    return true
  }
  return false
}

export function assertProductionAuthProfile(): void {
  if (!app.isPackaged) return

  for (const key of PACKAGED_FORBIDDEN_DEV_ENVS) {
    const value = process.env[key]?.trim()
    if (!value) continue
    if (key === 'TOOLMAN_BILLING_MOCK' && value === '0') continue
    if (isTruthyEnv(value)) {
      throw new Error(`Packaged build forbids ${key}=${value}`)
    }
  }
}
