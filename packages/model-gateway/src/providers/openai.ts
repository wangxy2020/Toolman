import type {
  ChatCompletionResult,
  ChatParams,
  ChatContentPart,
  ModelInfo,
  ProviderConfig,
  StreamChunk,
  TestResult,
  ToolCall,
} from '../types.js'
import { ProviderError } from '../types.js'
import { resolveDeepSeekExtraBody, resolveOpenAiModelName, providerSupportsOpenAiVision, resolveOllamaExtraBody, resolveOpenAiMaxTokens, shouldRouteThinkingAsAnswer } from '../model-aliases.js'
import { assertApiKey, readErrorBody, resolveOpenAiBaseUrl } from '../utils.js'

function formatProviderHttpError(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } }
    const message = parsed.error?.message?.trim()
    if (message) {
      if (/supported API model names/i.test(message)) {
        return `模型名称无效：${message}`
      }
      return message
    }
  } catch {
    // ignore malformed body
  }
  return body.trim() || `HTTP ${status}`
}

async function throwProviderHttpError(response: Response): Promise<never> {
  const body = await readErrorBody(response)
  throw new ProviderError(
    `Provider 请求失败 (${response.status}): ${formatProviderHttpError(response.status, body)}`,
    response.status >= 500 || response.status === 429,
  )
}

function buildHeaders(config: ProviderConfig): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
  }
}

function supportsUsageInStream(config: ProviderConfig): boolean {
  return config.type === 'openai' || config.type === 'azure_openai'
}

export async function fetchOpenAiModels(config: ProviderConfig): Promise<ModelInfo[]> {
  assertApiKey(config)
  const baseUrl = resolveOpenAiBaseUrl(config)
  const response = await fetch(`${baseUrl}/models`, {
    headers: buildHeaders(config),
  })

  if (!response.ok) {
    throw new ProviderError(
      `获取模型列表失败 (${response.status}): ${await readErrorBody(response)}`,
      response.status >= 500,
    )
  }

  const data = (await response.json()) as {
    data?: Array<{ id: string }>
  }

  return (data.data ?? []).map((m) => ({ id: m.id, name: m.id }))
}

export async function testOpenAiConnection(config: ProviderConfig): Promise<TestResult> {
  const start = Date.now()
  try {
    const models = await fetchOpenAiModels(config)
    if (models.length > 0) {
      return { success: true, latencyMs: Date.now() - start }
    }
  } catch {
    // 部分 OpenAI 兼容服务（如 DeepSeek）可能不返回 /models，改用最小对话探测
  }

  try {
    await pingOpenAiChat(config)
    return { success: true, latencyMs: Date.now() - start }
  } catch (error) {
    return {
      success: false,
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : '连接失败',
    }
  }
}

function resolvePingModel(config: ProviderConfig): string {
  const base = (config.baseUrl ?? '').toLowerCase()
  if (base.includes('deepseek')) return 'deepseek-v4-flash'
  if (base.includes('moonshot')) return 'moonshot-v1-8k'
  if (base.includes('dashscope') || base.includes('aliyuncs')) return 'qwen-plus'
  if (base.includes('bigmodel')) return 'glm-4-flash'
  return 'gpt-3.5-turbo'
}

async function pingOpenAiChat(config: ProviderConfig): Promise<void> {
  assertApiKey(config)
  const baseUrl = resolveOpenAiBaseUrl(config)
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: buildHeaders(config),
    body: JSON.stringify({
      model: resolvePingModel(config),
      messages: [{ role: 'user', content: 'ping' }],
      max_tokens: 1,
      stream: false,
    }),
  })

  if (!response.ok) {
    throw new ProviderError(
      `Provider 请求失败 (${response.status}): ${await readErrorBody(response)}`,
      response.status >= 500 || response.status === 429,
    )
  }
}

function mergeExtraBody(config: ProviderConfig, model: string): Record<string, unknown> {
  return {
    ...resolveDeepSeekExtraBody(config, model),
    ...resolveOllamaExtraBody(config, model),
  }
}

function yieldTextOrReasoning(
  text: string,
  routeThinkingAsAnswer: boolean,
): StreamChunk[] {
  if (!text) return []
  if (routeThinkingAsAnswer) {
    return [{ type: 'text-delta', text }]
  }
  return [{ type: 'reasoning-delta', text }]
}

export async function* streamOpenAiCompatible(
  config: ProviderConfig,
  params: ChatParams,
): AsyncGenerator<StreamChunk> {
  assertApiKey(config)

  const baseUrl = resolveOpenAiBaseUrl(config)
  const apiModel = resolveOpenAiModelName(config, params.model)
  const routeThinkingAsAnswer = shouldRouteThinkingAsAnswer(config, params.model)
  const body: Record<string, unknown> = {
    model: apiModel,
    messages: formatMessagesForOpenAi(params.messages, config, params.model),
    temperature: params.temperature ?? 0.7,
    max_tokens: resolveOpenAiMaxTokens(config, params.model, params.maxTokens),
    stream: true,
    ...mergeExtraBody(config, params.model),
  }

  if (supportsUsageInStream(config)) {
    body.stream_options = { include_usage: true }
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
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

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue

      const data = trimmed.slice(5).trim()
      if (data === '[DONE]') continue

      try {
        const parsed = JSON.parse(data) as {
          choices?: Array<{
            delta?: {
              content?: string
              reasoning_content?: string
              reasoning?: string
              thinking?: string
            }
          }>
          usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
        }

        const delta = parsed.choices?.[0]?.delta
        const reasoning = delta?.reasoning_content ?? delta?.reasoning ?? delta?.thinking
        for (const chunk of yieldTextOrReasoning(reasoning ?? '', routeThinkingAsAnswer)) {
          yield chunk
        }

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
  }

  yield { type: 'done', usage }
}

function parseToolCalls(message: {
  tool_calls?: Array<{
    id: string
    type?: string
    function?: { name?: string; arguments?: string }
  }>
}): ToolCall[] {
  return (message.tool_calls ?? [])
    .map((call) => ({
      id: call.id,
      name: call.function?.name ?? '',
      arguments: call.function?.arguments ?? '{}',
    }))
    .filter((call) => call.name)
}

function normalizeToolArguments(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return '{}'
  try {
    JSON.parse(trimmed)
    return trimmed
  } catch {
    return JSON.stringify(raw)
  }
}

function formatToolCallsForOpenAi(calls: ToolCall[]): Array<{
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}> {
  return calls.map((call) => ({
    id: call.id,
    type: 'function',
    function: {
      name: call.name,
      arguments: normalizeToolArguments(call.arguments),
    },
  }))
}

function flattenVisionContentToText(parts: ChatContentPart[]): string {
  const textParts = parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text?.trim() ?? '')
    .filter(Boolean)
  const imageCount = parts.filter((part) => part.type === 'image_url').length
  if (imageCount === 0) {
    return textParts.join('\n\n')
  }

  const note =
    imageCount === 1
      ? '[用户曾发送图片，当前模型不支持图片理解]'
      : `[用户曾发送 ${imageCount} 张图片，当前模型不支持图片理解]`
  return [...textParts, note].join('\n\n')
}

export function formatMessagesForOpenAi(
  messages: ChatParams['messages'],
  config?: ProviderConfig,
  model?: string,
): Array<Record<string, unknown>> {
  const supportsVision =
    config && model ? providerSupportsOpenAiVision(config, model) : true

  return messages.map((message) => {
    const content =
      !supportsVision && Array.isArray(message.content)
        ? flattenVisionContentToText(message.content)
        : message.content

    const entry: Record<string, unknown> = {
      role: message.role,
      content,
    }
    if (message.tool_call_id) entry.tool_call_id = message.tool_call_id
    if (message.tool_calls?.length) {
      entry.tool_calls = formatToolCallsForOpenAi(message.tool_calls)
    }
    return entry
  })
}

export async function chatCompleteOpenAiCompatible(
  config: ProviderConfig,
  params: ChatParams,
): Promise<ChatCompletionResult> {
  assertApiKey(config)

  const baseUrl = resolveOpenAiBaseUrl(config)
  const apiModel = resolveOpenAiModelName(config, params.model)
  const routeThinkingAsAnswer = shouldRouteThinkingAsAnswer(config, params.model)
  const body: Record<string, unknown> = {
    model: apiModel,
    messages: formatMessagesForOpenAi(params.messages, config, params.model),
    temperature: params.temperature ?? 0.7,
    max_tokens: resolveOpenAiMaxTokens(config, params.model, params.maxTokens),
    stream: false,
    ...mergeExtraBody(config, params.model),
  }

  if (params.tools?.length) {
    body.tools = params.tools
    body.tool_choice = 'auto'
  }

  const response = await fetch(`${baseUrl}/chat/completions`, {
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
    }>
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
  }

  const message = data.choices?.[0]?.message
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
    usage,
  }
}
