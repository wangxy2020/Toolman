/** Guest / no-key trial channel. Key never belongs in the client UI or git. */

export const TRIAL_DEEPSEEK_API_KEY_ENV = 'TOOLMAN_TRIAL_DEEPSEEK_API_KEY'
export const TRIAL_DEEPSEEK_PROVIDER_ID = 'deepseek'
export const TRIAL_DEEPSEEK_MODEL = 'deepseek-v4-flash'
export const TRIAL_DEEPSEEK_BASE_URL = 'https://api.deepseek.com/v1'
export const TRIAL_LLM_MONTHLY_TOKEN_CAP = 200_000
export const TRIAL_LLM_MONTHLY_CONVERSATION_CAP = 50
export const TRIAL_LLM_RATE_PER_MINUTE = 3
export const TRIAL_LLM_RATE_WINDOW_MS = 60_000
export const TRIAL_LLM_MAX_COMPLETION_TOKENS = 2048

export const TRIAL_LLM_EXHAUSTED_MESSAGE =
  '试用额度已用完。请在设置 → 模型服务中填写自己的 API Key 后继续。'
export const TRIAL_LLM_RATE_MESSAGE =
  '试用请求过于频繁，每分钟最多 3 次。请稍后再试，或填写自己的 API Key。'
export const TRIAL_LLM_UNCONFIGURED_MESSAGE =
  '试用通道暂不可用。请在设置 → 模型服务中填写自己的 API Key。'
export const TRIAL_LLM_OFFLINE_MESSAGE =
  '试用模型需要联网。请检查网络，或填写自己的 API Key / 使用本地模型。'

export type TrialQuotaState = {
  monthKey: string
  tokensUsed: number
  conversationsUsed: number
  recentRequestAt: number[]
}

export type TrialQuotaDecision =
  | { ok: true; state: TrialQuotaState }
  | { ok: false; reason: 'exhausted' | 'rate'; message: string; state: TrialQuotaState }

export function hasUserConfiguredApiKey(apiKey: string | null | undefined): boolean {
  return Boolean(apiKey?.trim())
}

export function trialMonthKey(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 7)
}

export function emptyTrialQuota(now = Date.now()): TrialQuotaState {
  return {
    monthKey: trialMonthKey(now),
    tokensUsed: 0,
    conversationsUsed: 0,
    recentRequestAt: [],
  }
}

export function normalizeTrialQuota(state: TrialQuotaState | null | undefined, now = Date.now()): TrialQuotaState {
  const monthKey = trialMonthKey(now)
  if (!state || state.monthKey !== monthKey) return emptyTrialQuota(now)
  const windowStart = now - TRIAL_LLM_RATE_WINDOW_MS
  return {
    monthKey,
    tokensUsed: Math.max(0, Math.floor(state.tokensUsed) || 0),
    conversationsUsed: Math.max(0, Math.floor(state.conversationsUsed) || 0),
    recentRequestAt: (state.recentRequestAt ?? []).filter((ts) => ts > windowStart),
  }
}

export function remainingTrialConversations(state: TrialQuotaState, now = Date.now()): number {
  const current = normalizeTrialQuota(state, now)
  return Math.max(0, TRIAL_LLM_MONTHLY_CONVERSATION_CAP - current.conversationsUsed)
}

export function remainingTrialTokens(state: TrialQuotaState, now = Date.now()): number {
  const current = normalizeTrialQuota(state, now)
  return Math.max(0, TRIAL_LLM_MONTHLY_TOKEN_CAP - current.tokensUsed)
}

export function isTrialQuotaExhausted(state: TrialQuotaState, now = Date.now()): boolean {
  return remainingTrialConversations(state, now) <= 0 || remainingTrialTokens(state, now) <= 0
}

export function evaluateTrialQuota(state: TrialQuotaState | null | undefined, now = Date.now()): TrialQuotaDecision {
  const current = normalizeTrialQuota(state, now)
  if (isTrialQuotaExhausted(current, now)) {
    return { ok: false, reason: 'exhausted', message: TRIAL_LLM_EXHAUSTED_MESSAGE, state: current }
  }
  if (current.recentRequestAt.length >= TRIAL_LLM_RATE_PER_MINUTE) {
    return { ok: false, reason: 'rate', message: TRIAL_LLM_RATE_MESSAGE, state: current }
  }
  return { ok: true, state: current }
}

/** Count a send attempt toward the per-minute cap before the upstream call. */
export function recordTrialAttempt(state: TrialQuotaState | null | undefined, now = Date.now()): TrialQuotaState {
  const current = normalizeTrialQuota(state, now)
  return {
    ...current,
    recentRequestAt: [...current.recentRequestAt, now],
  }
}

/** Count a successful completion toward the monthly hard cap. */
export function recordTrialSuccess(
  state: TrialQuotaState | null | undefined,
  tokens: number,
  now = Date.now(),
): TrialQuotaState {
  const current = normalizeTrialQuota(state, now)
  const used = Number.isFinite(tokens) ? Math.max(0, Math.floor(tokens)) : 0
  return {
    ...current,
    tokensUsed: current.tokensUsed + used,
    conversationsUsed: current.conversationsUsed + 1,
  }
}

export function readTrialDeepSeekApiKey(
  env: Record<string, string | undefined> = typeof process === 'undefined' ? {} : process.env,
): string {
  return (env[TRIAL_DEEPSEEK_API_KEY_ENV] ?? '').trim()
}
