import type { ModelConfig } from '../state/MobileAppContext'
import { normalizeChatBaseUrl } from '../settings/provider-presets'
import { buildApiAuthHeaders } from './apiHeaders'

export type StreamHandlers = {
  onDelta: (text: string) => void
  onDone: () => void
  onError: (message: string) => void
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

  if (config.localModelEnabled && !config.apiKey) {
    handlers.onError('本地模型尚未启用；请配置 API 或关闭本地模型开关')
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

  if (!response.body) {
    handlers.onError('当前运行环境不支持流式响应')
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

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
          handlers.onDone()
          return
        }
        try {
          const json = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: string } }>
          }
          const delta = json.choices?.[0]?.delta?.content
          if (delta) handlers.onDelta(delta)
        } catch {
          // ignore malformed SSE chunks
        }
      }
    }
    handlers.onDone()
  } catch (error) {
    if (signal?.aborted) {
      // User stopped or page unmounted — do not report as a successful empty completion.
      return
    }
    handlers.onError(error instanceof Error ? error.message : String(error))
  }
}
