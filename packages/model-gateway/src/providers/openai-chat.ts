import type {
  ChatCompletionResult,
  ChatParams,
  ProviderConfig,
} from '../types.js'
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
  throwProviderHttpError,
} from './openai-shared.js'
import { formatMessagesForOpenAi, parseToolCalls } from './openai-messages.js'

export async function chatCompleteOpenAiCompatible(
  config: ProviderConfig,
  params: ChatParams,
): Promise<ChatCompletionResult> {
  assertApiKey(config)

  const baseUrl = resolveOpenAiBaseUrl(config)
  const apiModel = resolveOpenAiModelName(config, params.model)
  const routeThinkingAsAnswer = shouldRouteThinkingAsAnswer(config, params.model)
  const omitSampling = shouldOmitOpenAiSamplingParams(config, params.model)
  const body: Record<string, unknown> = {
    model: apiModel,
    messages: formatMessagesForOpenAi(params.messages, config, params.model),
    max_tokens: resolveOpenAiMaxTokens(config, params.model, params.maxTokens),
    stream: false,
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

  const response = await providerFetch(config, `${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: buildHeaders(config),
    body: JSON.stringify(body),
    signal: params.signal,
  })

  if (!response.ok) {
    await throwProviderHttpError(response)
  }

  const data = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string | null
        reasoning_content?: string | null
        thinking?: string | null
        tool_calls?: Array<{
          id: string
          function?: { name?: string; arguments?: string }
        }>
      }
      finish_reason?: string | null
    }>
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
  }

  const choice = data.choices?.[0]
  const message = choice?.message
  const mainContent = typeof message?.content === 'string' ? message.content : ''
  const fallbackContent =
    message?.reasoning_content?.trim() || message?.thinking?.trim() || ''
  const content =
    mainContent.trim() || (routeThinkingAsAnswer && fallbackContent ? fallbackContent : mainContent)
  const usage = data.usage
    ? {
        prompt: data.usage.prompt_tokens ?? 0,
        completion: data.usage.completion_tokens ?? 0,
        total: data.usage.total_tokens ?? 0,
      }
    : undefined

  return {
    content,
    toolCalls: parseToolCalls(message ?? {}),
    finishReason: choice?.finish_reason ?? undefined,
    usage,
  }
}
