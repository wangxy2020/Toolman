import type {
  ChatContentPart,
  ChatParams,
  ProviderConfig,
  ToolCall,
} from '../types.js'
import { providerSupportsOpenAiVision } from '../model-aliases.js'

export function parseToolCalls(message: {
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

export type OpenAiToolCallDelta = {
  index?: number
  id?: string
  function?: { name?: string; arguments?: string }
}

/** Merge incremental OpenAI `delta.tool_calls` fragments into complete calls. */
export function applyOpenAiToolCallDeltas(
  acc: Map<number, ToolCall>,
  deltas: OpenAiToolCallDelta[] | undefined,
): void {
  if (!deltas?.length) return
  for (const delta of deltas) {
    const index = typeof delta.index === 'number' ? delta.index : acc.size
    const current = acc.get(index) ?? { id: '', name: '', arguments: '' }
    if (delta.id) current.id = delta.id
    if (delta.function?.name) current.name += delta.function.name
    if (delta.function?.arguments) current.arguments += delta.function.arguments
    acc.set(index, current)
  }
}

export function toolCallsFromDeltaAcc(acc: Map<number, ToolCall>): ToolCall[] {
  return [...acc.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, call]) => ({
      id: call.id,
      name: call.name,
      arguments: call.arguments || '{}',
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
