import {
  isGemmaThinkingOllamaModelId,
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

export function chatMessagesContainImages(messages: readonly ChatMessage[]): boolean {
  return messages.some(
    (message) =>
      Array.isArray(message.content) &&
      message.content.some((part) => part.type === 'image_url' && part.image_url?.url),
  )
}

export function formatMessagesForOllamaNative(
  messages: ChatMessage[],
): Array<{ role: 'system' | 'user' | 'assistant'; content: string }> {
  const formatted: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = []

  for (const message of messages) {
    if (message.role === 'tool') continue
    if (message.role !== 'system' && message.role !== 'user' && message.role !== 'assistant') {
      continue
    }

    const content = flattenMessageContent(message.content)
    if (!content.trim() && message.role !== 'assistant') continue
    formatted.push({ role: message.role, content })
  }

  return formatted
}

export function shouldUseOllamaNativeChat(config: ProviderConfig, params: ChatParams): boolean {
  return (
    config.type === 'ollama' &&
    isGemmaThinkingOllamaModelId(params.model) &&
    (!params.tools || params.tools.length === 0) &&
    !chatMessagesContainImages(params.messages)
  )
}

export async function* streamOllamaNativeChat(
  config: ProviderConfig,
  params: ChatParams,
): AsyncGenerator<StreamChunk> {
  const baseUrl = resolveOllamaNativeBaseUrl(config)
  const numPredict = resolveOpenAiMaxTokens(config, params.model, params.maxTokens) ?? 4096

  const response = await providerFetch(config, `${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: params.model.trim(),
      messages: formatMessagesForOllamaNative(params.messages),
      stream: true,
      think: false,
      options: {
        temperature: params.temperature ?? 0.7,
        num_predict: numPredict,
        repeat_penalty: 1.12,
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

        const text = parsed.message?.content
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
