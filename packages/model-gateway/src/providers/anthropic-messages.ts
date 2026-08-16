import type {
  ChatMessage,
  ToolCall,
  ToolDefinition,
} from '../types.js'

export type AnthropicContentBlock =
  | { type: 'text'; text: string }
  | {
      type: 'image'
      source: { type: 'base64'; media_type: string; data: string }
    }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string }

function parseDataImageUrl(url: string): { mediaType: string; data: string } | null {
  const match = url.trim().match(/^data:([^;]+);base64,(.+)$/i)
  if (!match?.[1] || !match[2]) return null
  return { mediaType: match[1], data: match[2] }
}

function buildAnthropicUserContent(message: ChatMessage): string | AnthropicContentBlock[] {
  if (message.role !== 'user') return ''
  if (typeof message.content === 'string') {
    return message.content
  }

  const blocks: AnthropicContentBlock[] = []
  for (const part of message.content) {
    if (part.type === 'text' && part.text?.trim()) {
      blocks.push({ type: 'text', text: part.text })
      continue
    }
    if (part.type === 'image_url' && part.image_url?.url) {
      const parsed = parseDataImageUrl(part.image_url.url)
      if (parsed) {
        blocks.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: parsed.mediaType,
            data: parsed.data,
          },
        })
      }
    }
  }

  if (blocks.length === 0) return ''
  if (blocks.length === 1 && blocks[0]?.type === 'text') {
    return blocks[0].text
  }
  return blocks
}

export function toAnthropicTools(tools: ToolDefinition[]) {
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

export function formatAnthropicMessages(messages: ChatMessage[]): Array<{
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
      merged.push({ role: 'user', content: buildAnthropicUserContent(message) })
    }
  }

  return merged
}

export function parseAnthropicToolCalls(content: AnthropicContentBlock[]): ToolCall[] {
  return content
    .filter((block): block is Extract<AnthropicContentBlock, { type: 'tool_use' }> => block.type === 'tool_use')
    .map((block) => ({
      id: block.id,
      name: block.name,
      arguments: JSON.stringify(block.input ?? {}),
    }))
}

