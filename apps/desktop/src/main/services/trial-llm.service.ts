import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import {
  TRIAL_DEEPSEEK_BASE_URL,
  TRIAL_DEEPSEEK_MODEL,
  evaluateTrialQuota,
  hasUserConfiguredApiKey,
  normalizeTrialQuota,
  readTrialDeepSeekApiKey,
  recordTrialAttempt,
  recordTrialSuccess,
  TRIAL_LLM_UNCONFIGURED_MESSAGE,
  type TrialQuotaState,
} from '@toolman/shared'
import { getP2pDeviceInfo } from './p2p/p2p-device-identity.service'

type StoredQuota = Record<string, TrialQuotaState>

export function isCloudProviderWithoutUserKey(config: {
  type: string
  apiKey?: string | null
}): boolean {
  if (config.type === 'ollama') return false
  return !hasUserConfiguredApiKey(config.apiKey)
}

function quotaFilePath(): string {
  return join(app.getPath('userData'), 'trial-llm-quota.json')
}

function trialSubjectId(): string {
  try {
    const info = getP2pDeviceInfo()
    return info.identityId || info.deviceId
  } catch {
    return 'desktop'
  }
}

function readStore(): StoredQuota {
  const path = quotaFilePath()
  if (!existsSync(path)) return {}
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as StoredQuota
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeStore(store: StoredQuota): void {
  const path = quotaFilePath()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(store))
}

export function claimDesktopTrialLlm(now = Date.now()):
  | { ok: true; apiKey: string; baseUrl: string; model: string }
  | { ok: false; message: string } {
  const apiKey = readTrialDeepSeekApiKey()
  if (!apiKey) return { ok: false, message: TRIAL_LLM_UNCONFIGURED_MESSAGE }
  const subject = trialSubjectId()
  const store = readStore()
  const decision = evaluateTrialQuota(store[subject], now)
  if (!decision.ok) return { ok: false, message: decision.message }
  store[subject] = recordTrialAttempt(decision.state, now)
  writeStore(store)
  return {
    ok: true,
    apiKey,
    baseUrl: TRIAL_DEEPSEEK_BASE_URL,
    model: TRIAL_DEEPSEEK_MODEL,
  }
}

export function recordDesktopTrialLlmUsage(tokens: number, now = Date.now()): void {
  const subject = trialSubjectId()
  const store = readStore()
  store[subject] = recordTrialSuccess(normalizeTrialQuota(store[subject], now), tokens, now)
  writeStore(store)
}
