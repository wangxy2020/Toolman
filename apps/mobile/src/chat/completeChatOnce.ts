import { Platform } from 'react-native'
import type { ModelConfig } from '../state/MobileAppContext'
import { normalizeChatBaseUrl } from '../settings/provider-presets'
import { buildApiAuthHeaders } from './apiHeaders'
import { extractChatCompletionText, extractChatCompletionUsageTokens } from './llmProxyRequest'
import {
  claimTrialLlmRequest,
  formatTrialFetchError,
  readTrialProxyError,
  recordTrialLlmSuccess,
  resolveTrialLlmProxyUrl,
  shouldUseTrialLlm,
} from './trialLlm'

function formatFetchError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return '无法连接模型服务。请检查网络、API 地址，或在网页端确认已配置模型。'
  }
  return message
}

async function completeTrialChatOnce(options: {
  messages: Array<{ role: string; content: string }>
  signal?: AbortSignal
}): Promise<{ ok: true; text: string } | { ok: false; message: string }> {
  const claimed = await claimTrialLlmRequest()
  if (!claimed.ok) return { ok: false, message: claimed.message }

  let response: Response
  try {
    response = await fetch(resolveTrialLlmProxyUrl(), {
      method: 'POST',
      signal: options.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        trial: true,
        stream: false,
        deviceId: claimed.deviceId,
        messages: options.messages,
      }),
    })
  } catch (error) {
    return { ok: false, message: formatTrialFetchError(error) }
  }

  const raw = await response.text().catch(() => '')
  if (!response.ok) {
    return { ok: false, message: readTrialProxyError(raw, response.status) }
  }

  let payload: unknown = raw
  try {
    payload = raw ? JSON.parse(raw) : null
  } catch {
    return { ok: false, message: '试用模型返回了无法解析的内容' }
  }

  const text = extractChatCompletionText(payload)
  if (!text) return { ok: false, message: readTrialProxyError(raw, response.status) }
  await recordTrialLlmSuccess(extractChatCompletionUsageTokens(payload))
  return { ok: true, text }
}

/** Non-streaming chat completion. Web uses same-origin proxy to avoid CORS. */
export async function completeChatOnce(options: {
  config: ModelConfig
  messages: Array<{ role: string; content: string }>
  signal?: AbortSignal
}): Promise<{ ok: true; text: string } | { ok: false; message: string }> {
  const { config, messages, signal } = options
  if (shouldUseTrialLlm(config)) {
    return completeTrialChatOnce({ messages, signal })
  }

  const auth = buildApiAuthHeaders(config.apiKey)
  if (!auth.ok) return { ok: false, message: auth.message }

  const base = normalizeChatBaseUrl(config.baseUrl, config.providerId).replace(/\/$/, '')
  if (!base) return { ok: false, message: '请先在设置中配置模型服务' }

  const useProxy = Platform.OS === 'web'
  const url = useProxy ? '/api/llm/chat' : `${base}/chat/completions`
  const body = useProxy
    ? { baseUrl: base, apiKey: auth.apiKey, model: config.model, messages }
    : { model: config.model, stream: false, messages }

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      signal,
      headers: useProxy
        ? { 'Content-Type': 'application/json' }
        : auth.headers,
      body: JSON.stringify(body),
    })
  } catch (error) {
    return { ok: false, message: formatFetchError(error) }
  }

  const raw = await response.text().catch(() => '')
  if (!response.ok) {
    return {
      ok: false,
      message: `模型请求失败 (${response.status}) ${raw.slice(0, 200)}`.trim(),
    }
  }

  let payload: unknown = raw
  try {
    payload = raw ? JSON.parse(raw) : null
  } catch {
    return { ok: false, message: '模型返回了无法解析的内容' }
  }

  if (payload && typeof payload === 'object' && 'error' in payload) {
    const err = (payload as { error?: { message?: string } | string }).error
    const detail = typeof err === 'string' ? err : err?.message
    if (detail) return { ok: false, message: detail }
  }

  const text = extractChatCompletionText(payload)
  if (!text) return { ok: false, message: '翻译结果为空' }
  return { ok: true, text }
}
