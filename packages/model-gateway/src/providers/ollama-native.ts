import {
  isGemmaThinkingOllamaModelId,
  isOcrVisionModelId,
  isQwenThinkingOllamaModelId,
  resolveOpenAiMaxTokens,
} from '../model-aliases.js'
import type { ChatMessage, ChatParams, ProviderConfig, StreamChunk } from '../types.js'
import { ProviderError } from '../types.js'
import { providerFetch, readErrorBody } from '../utils.js'

export function resolveOllamaNativeBaseUrl(config: ProviderConfig): string {
  const raw = (config.baseUrl ?? 'http://127.0.0.1:11434').replace(/\/$/, '')
  return raw.replace(/\/v1$/i, '')
}

function flattenMessageContent(content: ChatMessage['content']): string {
  if (typeof content === 'string') return content
  return content
    .filter((part) => part.type === 'text')
    .map((part) => part.text ?? '')
    .filter(Boolean)
    .join('\n\n')
}

/** Strip data-URL prefix; Ollama native API expects raw base64 in `images`. */
export function extractBase64ImagesFromContent(content: ChatMessage['content']): string[] {
  if (typeof content === 'string') return []
  const images: string[] = []
  for (const part of content) {
    if (part.type !== 'image_url' || !part.image_url?.url) continue
    const url = part.image_url.url.trim()
    // Prefer indexOf over regex — huge base64 payloads can break RegExp matching.
    const marker = ';base64,'
    const markerIndex = url.indexOf(marker)
    const base64 = (markerIndex >= 0 ? url.slice(markerIndex + marker.length) : url).replace(
      /\s+/g,
      '',
    )
    // Reject values that still look like a data-URL (would cause "illegal base64 data").
    if (!base64 || base64.startsWith('data:') || /[^A-Za-z0-9+/=]/.test(base64)) continue
    images.push(base64)
  }
  return images
}

export function chatMessagesContainImages(messages: readonly ChatMessage[]): boolean {
  return messages.some(
    (message) =>
      Array.isArray(message.content) &&
      message.content.some((part) => part.type === 'image_url' && part.image_url?.url),
  )
}

export type OllamaNativeMessage = {
  role: 'system' | 'user' | 'assistant'
  content: string
  images?: string[]
}

export function formatMessagesForOllamaNative(messages: ChatMessage[]): OllamaNativeMessage[] {
  const formatted: OllamaNativeMessage[] = []

  for (const message of messages) {
    if (message.role === 'tool') continue
    if (message.role !== 'system' && message.role !== 'user' && message.role !== 'assistant') {
      continue
    }

    const content = flattenMessageContent(message.content)
    const images = extractBase64ImagesFromContent(message.content)
    if (!content.trim() && images.length === 0 && message.role !== 'assistant') continue

    const entry: OllamaNativeMessage = {
      role: message.role,
      content: content.trim() || (images.length > 0 ? 'Text Recognition:' : ''),
    }
    if (images.length > 0) {
      entry.images = images
    }
    formatted.push(entry)
  }

  return formatted
}

/**
 * Use Ollama native /api/chat for:
 * - Gemma / Qwen3 thinking models (text-only; avoids /v1 empty-content + reasoning bug)
 * - OCR models like glm-ocr (require native `images` field, not OpenAI image_url)
 */
export function shouldUseOllamaNativeChat(config: ProviderConfig, params: ChatParams): boolean {
  if (config.type !== 'ollama') return false
  if (params.tools && params.tools.length > 0) return false

  if (isOcrVisionModelId(params.model)) return true

  if (isGemmaThinkingOllamaModelId(params.model) || isQwenThinkingOllamaModelId(params.model)) {
    // Vision via /v1 may work; keep text-only on native path.
    return !chatMessagesContainImages(params.messages)
  }

  return false
}

export async function* streamOllamaNativeChat(
  config: ProviderConfig,
  params: ChatParams,
): AsyncGenerator<StreamChunk> {
  const baseUrl = resolveOllamaNativeBaseUrl(config)
  const numPredict = resolveOpenAiMaxTokens(config, params.model, params.maxTokens) ?? 4096
  const isOcr = isOcrVisionModelId(params.model)

  const response = await providerFetch(config, `${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: params.model.trim(),
      messages: formatMessagesForOllamaNative(params.messages),
      stream: true,
      think: false,
      options: {
        temperature: params.temperature ?? (isOcr ? 0 : 0.7),
        num_predict: numPredict,
        // glm-ocr needs a larger context for vision tokens.
        ...(isOcr ? { num_ctx: 10240 } : {}),
        ...(!isOcr ? { repeat_penalty: 1.12 } : {}),
      },
    }),
    signal: params.signal,
  })

  if (!response.ok) {
    const detail = await readErrorBody(response)
    throw new ProviderError(`Ollama 请求失败 (${response.status}): ${detail}`, response.status >= 500)
  }

  const reader = response.body?.getReader()
  if (!reader) {
    throw new ProviderError('Ollama 响应无 body')
  }

  const decoder = new TextDecoder()
  let buffer = ''
  let usage: StreamChunk['usage']

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue

      try {
        const parsed = JSON.parse(trimmed) as {
          message?: { content?: string; thinking?: string }
          done?: boolean
          prompt_eval_count?: number
          eval_count?: number
        }

        // glm-ocr may put text in thinking/reasoning-like fields on some builds.
        const text = parsed.message?.content || (isOcr ? parsed.message?.thinking : undefined)
        if (text) {
          yield { type: 'text-delta', text }
        }

        if (parsed.done) {
          const prompt = parsed.prompt_eval_count ?? 0
          const completion = parsed.eval_count ?? 0
          usage = { prompt, completion, total: prompt + completion }
        }
      } catch {
        // skip malformed chunk
      }
    }
  }

  yield { type: 'done', usage }
}
