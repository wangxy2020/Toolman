import type {
  ChatParams,
  ProviderConfig,
  StreamChunk,
} from '../types.js'
import { ProviderError } from '../types.js'
import {
  resolveOpenAiModelName,
  resolveOpenAiMaxTokens,
  shouldOmitOpenAiSamplingParams,
  shouldRouteThinkingAsAnswer,
} from '../model-aliases.js'
import { assertApiKey, providerFetch, resolveOpenAiBaseUrl } from '../utils.js'
import {
  buildHeaders,
  mergeExtraBody,
  supportsUsageInStream,
  throwProviderHttpError,
  yieldTextOrReasoning,
} from './openai-shared.js'
import {
  applyOpenAiToolCallDeltas,
  formatMessagesForOpenAi,
  toolCallsFromDeltaAcc,
  type OpenAiToolCallDelta,
} from './openai-messages.js'

export async function* streamOpenAiCompatible(
  config: ProviderConfig,
  params: ChatParams,
): AsyncGenerator<StreamChunk> {
  assertApiKey(config)

  const baseUrl = resolveOpenAiBaseUrl(config)
  const apiModel = resolveOpenAiModelName(config, params.model)
  const routeThinkingAsAnswer = shouldRouteThinkingAsAnswer(config, params.model)
  const omitSampling = shouldOmitOpenAiSamplingParams(config, params.model)
  const body: Record<string, unknown> = {
    model: apiModel,
    messages: formatMessagesForOpenAi(params.messages, config, params.model),
    max_tokens: resolveOpenAiMaxTokens(config, params.model, params.maxTokens),
    stream: true,
    ...mergeExtraBody(config, params.model, params.extraBody),
  }
  if (!omitSampling) {
    body.temperature = params.temperature ?? 0.7
  } else {
    delete body.temperature
    delete body.top_p
    delete body.n
    delete body.presence_penalty
    delete body.frequency_penalty
  }

  if (params.tools?.length) {
    body.tools = params.tools
    body.tool_choice = 'auto'
  }

  if (supportsUsageInStream(config)) {
    body.stream_options = { include_usage: true }
  }

  const response = await providerFetch(config, `${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: buildHeaders(config),
    body: JSON.stringify(body),
    signal: params.signal,
  })

  if (!response.ok) {
    await throwProviderHttpError(response)
  }

  if (!response.body) {
    throw new ProviderError('Provider 返回空响应体', true)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let usage: StreamChunk['usage']
  let finishReason: string | undefined
  const toolCallAcc = new Map<number, { id: string; name: string; arguments: string }>()

  const consumeSseLine = function* (line: string): Generator<StreamChunk> {
    const trimmed = line.trim()
    if (!trimmed.startsWith('data:')) return

    const data = trimmed.slice(5).trim()
    if (data === '[DONE]') return

    try {
      const parsed = JSON.parse(data) as {
        choices?: Array<{
          delta?: {
            content?: string
            reasoning_content?: string
            reasoning?: string
            thinking?: string
            tool_calls?: OpenAiToolCallDelta[]
          }
          finish_reason?: string | null
        }>
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
      }

      const choice = parsed.choices?.[0]
      if (choice?.finish_reason) {
        finishReason = choice.finish_reason
      }

      const delta = choice?.delta
      const reasoning = delta?.reasoning_content ?? delta?.reasoning ?? delta?.thinking
      for (const chunk of yieldTextOrReasoning(reasoning ?? '', routeThinkingAsAnswer)) {
        yield chunk
      }

      applyOpenAiToolCallDeltas(toolCallAcc, delta?.tool_calls)

      const text = delta?.content
      if (text) yield { type: 'text-delta', text }

      if (parsed.usage) {
        usage = {
          prompt: parsed.usage.prompt_tokens ?? 0,
          completion: parsed.usage.completion_tokens ?? 0,
          total: parsed.usage.total_tokens ?? 0,
        }
      }
    } catch {
      // skip malformed chunk
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      yield* consumeSseLine(line)
    }
  }

  buffer += decoder.decode()
  if (buffer.trim()) {
    for (const line of buffer.split('\n')) {
      yield* consumeSseLine(line)
    }
  }

  const toolCalls = toolCallsFromDeltaAcc(toolCallAcc)
  yield {
    type: 'done',
    usage,
    finishReason,
    ...(toolCalls.length > 0 ? { toolCalls } : {}),
  }
}
