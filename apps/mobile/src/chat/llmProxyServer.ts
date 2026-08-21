import {
  TRIAL_DEEPSEEK_BASE_URL,
  TRIAL_DEEPSEEK_MODEL,
  TRIAL_LLM_MAX_COMPLETION_TOKENS,
  TRIAL_LLM_RATE_PER_MINUTE,
  TRIAL_LLM_RATE_WINDOW_MS,
  TRIAL_LLM_UNCONFIGURED_MESSAGE,
  TRIAL_LLM_RATE_MESSAGE,
  readTrialDeepSeekApiKey,
} from '@toolman/shared'
import type { LlmProxyChatInput } from './llmProxyRequest'

const trialRateBuckets = new Map<string, number[]>()

export function resetTrialLlmRateLimitForTests(): void {
  trialRateBuckets.clear()
}

export function allowTrialLlmRate(deviceId: string, now = Date.now()): boolean {
  const key = deviceId.trim() || 'unknown'
  const windowStart = now - TRIAL_LLM_RATE_WINDOW_MS
  const times = (trialRateBuckets.get(key) ?? []).filter((ts) => ts > windowStart)
  if (times.length >= TRIAL_LLM_RATE_PER_MINUTE) {
    trialRateBuckets.set(key, times)
    return false
  }
  times.push(now)
  trialRateBuckets.set(key, times)
  return true
}

function trialUpstreamBody(input: LlmProxyChatInput): Record<string, unknown> {
  return {
    model: TRIAL_DEEPSEEK_MODEL,
    stream: Boolean(input.stream),
    max_tokens: TRIAL_LLM_MAX_COMPLETION_TOKENS,
    messages: input.messages,
    ...(input.stream ? { stream_options: { include_usage: true } } : {}),
  }
}

function resolveUpstream(input: LlmProxyChatInput): {
  ok: true
  baseUrl: string
  apiKey: string
  body: Record<string, unknown>
} | { ok: false; status: number; body: { error: string; code: string } } {
  if (!input.trial) {
    return {
      ok: true,
      baseUrl: input.baseUrl,
      apiKey: input.apiKey,
      body: {
        model: input.model,
        stream: Boolean(input.stream),
        messages: input.messages,
      },
    }
  }
  const apiKey = readTrialDeepSeekApiKey()
  if (!apiKey) {
    return {
      ok: false,
      status: 503,
      body: { error: TRIAL_LLM_UNCONFIGURED_MESSAGE, code: 'TRIAL_UNCONFIGURED' },
    }
  }
  if (!allowTrialLlmRate(input.deviceId ?? '')) {
    return {
      ok: false,
      status: 429,
      body: { error: TRIAL_LLM_RATE_MESSAGE, code: 'TRIAL_RATE' },
    }
  }
  return {
    ok: true,
    baseUrl: TRIAL_DEEPSEEK_BASE_URL,
    apiKey,
    body: trialUpstreamBody(input),
  }
}

export async function proxyChatCompletion(input: LlmProxyChatInput): Promise<{
  status: number
  body: unknown
}> {
  const resolved = resolveUpstream({ ...input, stream: false })
  if (!resolved.ok) return { status: resolved.status, body: resolved.body }
  const response = await fetch(`${resolved.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resolved.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ...resolved.body, stream: false }),
  })
  const raw = await response.text()
  try {
    return { status: response.status, body: JSON.parse(raw) }
  } catch {
    return { status: response.status, body: { error: raw.slice(0, 300) || 'upstream error' } }
  }
}

export async function proxyChatCompletionStream(input: LlmProxyChatInput): Promise<
  | { ok: true; response: Response }
  | { ok: false; status: number; body: { error: string; code?: string } }
> {
  const resolved = resolveUpstream({ ...input, stream: true })
  if (!resolved.ok) return { ok: false, status: resolved.status, body: resolved.body }
  try {
    const response = await fetch(`${resolved.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resolved.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(resolved.body),
    })
    if (!response.ok) {
      const raw = await response.text().catch(() => '')
      return {
        ok: false,
        status: response.status,
        body: { error: raw.slice(0, 300) || 'upstream error' },
      }
    }
    if (!response.body) {
      return { ok: false, status: 502, body: { error: 'upstream stream missing' } }
    }
    return { ok: true, response }
  } catch (error) {
    return {
      ok: false,
      status: 502,
      body: { error: error instanceof Error ? error.message : 'upstream stream failed' },
    }
  }
}
