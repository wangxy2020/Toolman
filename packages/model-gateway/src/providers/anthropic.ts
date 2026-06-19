import type {
  ChatCompletionResult,
  ChatParams,
  ChatMessage,
  ModelInfo,
  ProviderConfig,
  StreamChunk,
  TestResult,
  ToolCall,
  ToolDefinition,
} from '../types.js'
import { ProviderError } from '../types.js'
import { assertApiKey, readErrorBody, resolveAnthropicBaseUrl } from '../utils.js'

export async function fetchAnthropicModels(_config: ProviderConfig): Promise<ModelInfo[]> {
  return [
    { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
    { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku' },
  ]
}

export async function testAnthropicConnection(config: ProviderConfig): Promise<TestResult> {
  const start = Date.now()
  try {
    assertApiKey(config)
    const baseUrl = resolveAnthropicBaseUrl(config)
    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      }),
    })

    if (!response.ok) {
      return {
        success: false,
        latencyMs: Date.now() - start,
        error: `Anthropic 测试失败 (${response.status}): ${await readErrorBody(response)}`,
      }
    }

    return { success: true, latencyMs: Date.now() - start }
  } catch (error) {
    return {
      success: false,
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : '连接失败',
    }
  }
}

export async function* streamAnthropic(
  config: ProviderConfig,
  params: ChatParams,
): AsyncGenerator<StreamChunk> {
  assertApiKey(config)

  const baseUrl = resolveAnthropicBaseUrl(config)
  const systemMessage = params.messages.find((m) => m.role === 'system')
  const nonSystemMessages = params.messages.filter((m) => m.role !== 'system')

  const response = await fetch(`${baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: params.model,
      max_tokens: params.maxTokens ?? 4096,
      temperature: params.temperature ?? 0.7,
      system: systemMessage?.content,
      messages: nonSystemMessages.map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      })),
      stream: true,
    }),
    signal: params.signal,
  })

  if (!response.ok) {
    throw new ProviderError(
      `Anthropic 请求失败 (${response.status}): ${await readErrorBody(response)}`,
      response.status >= 500 || response.status === 429,
    )
  }

  if (!response.body) {
    throw new ProviderError('Anthropic 返回空响应体', true)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let usage: StreamChunk['usage']

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n\n')
    buffer = parts.pop() ?? ''

    for (const part of parts) {
      const lines = part.split('\n')
      let eventType = ''
      let dataLine = ''

      for (const line of lines) {
        if (line.startsWith('event:')) eventType = line.slice(6).trim()
        if (line.startsWith('data:')) dataLine = line.slice(5).trim()
      }

      if (!dataLine) continue

      try {
        const parsed = JSON.parse(dataLine) as {
          type?: string
          delta?: { text?: string }
          usage?: { input_tokens?: number; output_tokens?: number }
        }

        if (eventType === 'content_block_delta' && parsed.delta?.text) {
          yield { type: 'text-delta', text: parsed.delta.text }
        }

        if (parsed.type === 'message_delta' && parsed.usage) {
          usage = {
            prompt: parsed.usage.input_tokens ?? 0,
            completion: parsed.usage.output_tokens ?? 0,
            total: (parsed.usage.input_tokens ?? 0) + (parsed.usage.output_tokens ?? 0),
          }
        }
      } catch {
        // skip
      }
    }
  }

  yield { type: 'done', usage }
}

type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string }

function toAnthropicTools(tools: ToolDefinition[]) {
  return tools.map((tool) => ({
    name: tool.function.name,
    description: tool.function.description,
    input_schema: tool.function.parameters,
  }))
}

function parseToolArguments(raw: string): Record<string, unknown> {
  const trimmed = raw.trim()
  if (!trimmed) return {}
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return { raw: trimmed }
  }
}

function formatAnthropicMessages(messages: ChatMessage[]): Array<{
  role: 'user' | 'assistant'
  content: string | AnthropicContentBlock[]
}> {
  const merged: Array<{ role: 'user' | 'assistant'; content: string | AnthropicContentBlock[] }> = []

  for (const message of messages) {
    if (message.role === 'system') continue

    if (message.role === 'tool') {
      const block: AnthropicContentBlock = {
        type: 'tool_result',
        tool_use_id: message.tool_call_id ?? '',
        content: typeof message.content === 'string' ? message.content : '',
      }
      const last = merged[merged.length - 1]
      if (last?.role === 'user' && Array.isArray(last.content)) {
        last.content.push(block)
      } else {
        merged.push({ role: 'user', content: [block] })
      }
      continue
    }

    if (message.role === 'assistant') {
      const blocks: AnthropicContentBlock[] = []
      const text =
        typeof message.content === 'string'
          ? message.content
          : message.content
              .filter((part) => part.type === 'text' && part.text)
              .map((part) => part.text)
              .join('\n')
      if (text.trim()) blocks.push({ type: 'text', text })
      for (const call of message.tool_calls ?? []) {
        blocks.push({
          type: 'tool_use',
          id: call.id,
          name: call.name,
          input: parseToolArguments(call.arguments),
        })
      }
      merged.push({
        role: 'assistant',
        content: blocks.length === 1 && blocks[0]?.type === 'text' ? blocks[0].text : blocks,
      })
      continue
    }

    if (message.role === 'user') {
      const text =
        typeof message.content === 'string'
          ? message.content
          : message.content
              .filter((part) => part.type === 'text' && part.text)
              .map((part) => part.text)
              .join('\n')
      merged.push({ role: 'user', content: text })
    }
  }

  return merged
}

function parseAnthropicToolCalls(content: AnthropicContentBlock[]): ToolCall[] {
  return content
    .filter((block): block is Extract<AnthropicContentBlock, { type: 'tool_use' }> => block.type === 'tool_use')
    .map((block) => ({
      id: block.id,
      name: block.name,
      arguments: JSON.stringify(block.input ?? {}),
    }))
}

export async function chatCompleteAnthropic(
  config: ProviderConfig,
  params: ChatParams,
): Promise<ChatCompletionResult> {
  assertApiKey(config)

  const baseUrl = resolveAnthropicBaseUrl(config)
  const systemMessage = params.messages.find((m) => m.role === 'system')
  const systemText =
    typeof systemMessage?.content === 'string'
      ? systemMessage.content
      : systemMessage?.content
          ?.filter((part) => part.type === 'text' && part.text)
          .map((part) => part.text)
          .join('\n')

  const body: Record<string, unknown> = {
    model: params.model,
    max_tokens: params.maxTokens ?? 4096,
    temperature: params.temperature ?? 0.7,
    system: systemText,
    messages: formatAnthropicMessages(params.messages),
  }

  if (params.tools?.length) {
    body.tools = toAnthropicTools(params.tools)
  }

  const response = await fetch(`${baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
    signal: params.signal,
  })

  if (!response.ok) {
    throw new ProviderError(
      `Anthropic 请求失败 (${response.status}): ${await readErrorBody(response)}`,
      response.status >= 500 || response.status === 429,
    )
  }

  const data = (await response.json()) as {
    content?: AnthropicContentBlock[]
    usage?: { input_tokens?: number; output_tokens?: number }
  }

  const contentBlocks = data.content ?? []
  const text = contentBlocks
    .filter((block): block is Extract<AnthropicContentBlock, { type: 'text' }> => block.type === 'text')
    .map((block) => block.text)
    .join('')

  return {
    content: text,
    toolCalls: parseAnthropicToolCalls(contentBlocks),
    usage: data.usage
      ? {
          prompt: data.usage.input_tokens ?? 0,
          completion: data.usage.output_tokens ?? 0,
          total: (data.usage.input_tokens ?? 0) + (data.usage.output_tokens ?? 0),
        }
      : undefined,
  }
}
