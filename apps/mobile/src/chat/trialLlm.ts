import { Platform } from 'react-native'
import {
  TRIAL_LLM_OFFLINE_MESSAGE,
  evaluateTrialQuota,
  hasUserConfiguredApiKey,
  recordTrialAttempt,
  recordTrialSuccess,
} from '@toolman/shared'
import type { ModelConfig } from '../state/MobileAppContext'
import { isHostedPublicWebPage } from '../sync/localNetworkFetch'
import { getOrCreateDeviceId } from '../storage/secure'
import { loadTrialQuota, saveTrialQuota } from '../storage/trialLlmQuota'
import { sanitizeApiKey } from './apiHeaders'

export const HOSTED_TRIAL_LLM_PROXY_URL = 'https://www.toolman.work/api/llm/chat'

export function shouldUseTrialLlm(config: Pick<ModelConfig, 'apiKey'>): boolean {
  return !hasUserConfiguredApiKey(sanitizeApiKey(config.apiKey ?? ''))
}

export function resolveTrialLlmProxyUrl(): string {
  if (Platform.OS === 'web') return '/api/llm/chat'
  return HOSTED_TRIAL_LLM_PROXY_URL
}

/** Local Expo web can stream through the API route; hosted Vercel Node is JSON-only. */
export function trialLlmPrefersStream(): boolean {
  return Platform.OS === 'web' && !isHostedPublicWebPage()
}

export async function claimTrialLlmRequest(now = Date.now()): Promise<
  { ok: true; deviceId: string } | { ok: false; message: string }
> {
  const quota = await loadTrialQuota(now)
  const decision = evaluateTrialQuota(quota, now)
  if (!decision.ok) return { ok: false, message: decision.message }
  await saveTrialQuota(recordTrialAttempt(decision.state, now))
  return { ok: true, deviceId: await getOrCreateDeviceId() }
}

export async function recordTrialLlmSuccess(tokens: number, now = Date.now()): Promise<void> {
  const quota = await loadTrialQuota(now)
  await saveTrialQuota(recordTrialSuccess(quota, tokens, now))
}

export function formatTrialFetchError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(message)) {
    return TRIAL_LLM_OFFLINE_MESSAGE
  }
  return message
}

export function readTrialProxyError(raw: string, status: number): string {
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string } | string; message?: string }
    const err = parsed.error
    const detail = typeof err === 'string' ? err : err?.message || parsed.message
    if (detail?.trim()) return detail.trim()
  } catch {
    // ignore
  }
  const snippet = raw.trim().slice(0, 200)
  return snippet ? `试用请求失败 (${status}) ${snippet}` : `试用请求失败 (${status})`
}
