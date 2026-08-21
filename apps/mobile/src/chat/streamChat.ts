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
  trialLlmPrefersStream,
} from './trialLlm'

export type StreamHandlers = {
  onDelta: (text: string) => void
  onDone: () => void
  onError: (message: string) => void
}

async function parseSseChatStream(
  response: Response,
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<{ tokens: number; completed: boolean }> {
  if (!response.body) {
    handlers.onError('当前运行环境不支持流式响应')
    return { tokens: 0, completed: false }
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let tokens = 0
  let finished = false

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const data = trimmed.slice(5).trim()
        if (data === '[DONE]') {
          finished = true
          handlers.onDone()
          return { tokens, completed: true }
        }
        try {
          const json = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: string } }>
            usage?: { total_tokens?: number }
          }
          const usageTokens = extractChatCompletionUsageTokens(json)
          if (usageTokens > 0) tokens = usageTokens
          const delta = json.choices?.[0]?.delta?.content
          if (delta) handlers.onDelta(delta)
        } catch {
          // ignore malformed SSE chunks
        }
      }
    }
    if (!finished) handlers.onDone()
    return { tokens, completed: true }
  } catch (error) {
    if (signal?.aborted) return { tokens, completed: false }
    handlers.onError(error instanceof Error ? error.message : String(error))
    return { tokens, completed: false }
  }
}

async function completeTrialOnce(
  deviceId: string,
  messages: Array<{ role: string; content: string }>,
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  let response: Response
  try {
    response = await fetch(resolveTrialLlmProxyUrl(), {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        trial: true,
        stream: false,
        deviceId,
        messages,
      }),
    })
  } catch (error) {
    handlers.onError(formatTrialFetchError(error))
    return
  }
  const raw = await response.text().catch(() => '')
  if (!response.ok) {
    handlers.onError(readTrialProxyError(raw, response.status))
    return
  }
  let payload: unknown = null
  try {
    payload = raw ? JSON.parse(raw) : null
  } catch {
    handlers.onError('试用模型返回了无法解析的内容')
    return
  }
  const text = extractChatCompletionText(payload)
  if (!text) {
    handlers.onError(readTrialProxyError(raw, response.status))
    return
  }
  await recordTrialLlmSuccess(extractChatCompletionUsageTokens(payload))
  handlers.onDelta(text)
  handlers.onDone()
}

async function streamTrialChat(options: {
  messages: Array<{ role: string; content: string }>
  handlers: StreamHandlers
  signal?: AbortSignal
}): Promise<void> {
  const claimed = await claimTrialLlmRequest()
  if (!claimed.ok) {
    options.handlers.onError(claimed.message)
    return
  }

  if (!trialLlmPrefersStream()) {
    await completeTrialOnce(claimed.deviceId, options.messages, options.handlers, options.signal)
    return
  }

  let response: Response
  try {
    response = await fetch(resolveTrialLlmProxyUrl(), {
      method: 'POST',
      signal: options.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        trial: true,
        stream: true,
        deviceId: claimed.deviceId,
        messages: options.messages,
      }),
    })
  } catch (error) {
    options.handlers.onError(formatTrialFetchError(error))
    return
  }

  if (!response.ok) {
    const raw = await response.text().catch(() => '')
    options.handlers.onError(readTrialProxyError(raw, response.status))
    return
  }

  const contentType = response.headers.get('Content-Type') ?? ''
  if (contentType.includes('application/json')) {
    const raw = await response.text().catch(() => '')
    let payload: unknown = null
    try {
      payload = raw ? JSON.parse(raw) : null
    } catch {
      options.handlers.onError('试用模型返回了无法解析的内容')
      return
    }
    const text = extractChatCompletionText(payload)
    if (!text) {
      options.handlers.onError(readTrialProxyError(raw, response.status))
      return
    }
    await recordTrialLlmSuccess(extractChatCompletionUsageTokens(payload))
    options.handlers.onDelta(text)
    options.handlers.onDone()
    return
  }

  const { tokens, completed } = await parseSseChatStream(response, options.handlers, options.signal)
  if (completed) await recordTrialLlmSuccess(tokens)
}

/**
 * OpenAI-compatible chat completions streaming.
 * Local on-device models can plug in later behind the same interface.
 */
export async function streamChatCompletion(options: {
  config: ModelConfig
  messages: Array<{ role: string; content: string }>
  handlers: StreamHandlers
  signal?: AbortSignal
}): Promise<void> {
  const { config, messages, handlers, signal } = options

  if (shouldUseTrialLlm(config)) {
    await streamTrialChat({ messages, handlers, signal })
    return
  }

  const auth = buildApiAuthHeaders(config.apiKey)
  if (!auth.ok) {
    handlers.onError(auth.message)
    return
  }

  const base = normalizeChatBaseUrl(config.baseUrl, config.providerId).replace(/\/$/, '')
  const url = `${base}/chat/completions`

  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      signal,
      headers: auth.headers,
      body: JSON.stringify({
        model: config.model,
        stream: true,
        messages,
      }),
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    if (msg.includes('ISO-8859-1') || msg.includes('code point')) {
      handlers.onError('请求头含非法字符，请重新粘贴纯 ASCII 的 API Key')
      return
    }
    handlers.onError(msg)
    return
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    handlers.onError(`模型请求失败 (${response.status}) ${body.slice(0, 200)}`)
    return
  }

  await parseSseChatStream(response, handlers, signal)
}
