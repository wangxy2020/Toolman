export type MessageSegment =
  | { type: 'markdown'; text: string }
  | { type: 'tool'; name: string; arguments?: string; result: string; status: 'done' | 'running' }

const TOOL_BLOCK_RE =
  /(?:^|\n\n)> 工具 \*\*([^*]+)\*\*\n(?:> 参数 ([^\n]+)\n)?([\s\S]*?)(?=(?:\n\n> 工具 \*\*)|$)/g

export function parseMessageSegments(text: string, streaming = false): MessageSegment[] {
  const normalized = text.replace(/^\s*> 工具 \*\*/, '\n\n> 工具 **')
  if (!normalized.trim()) return []

  const segments: MessageSegment[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  const matches: RegExpExecArray[] = []

  TOOL_BLOCK_RE.lastIndex = 0
  while ((match = TOOL_BLOCK_RE.exec(normalized)) !== null) {
    matches.push(match)
  }

  if (matches.length === 0) {
    return [{ type: 'markdown', text: normalized.trim() }]
  }

  for (let i = 0; i < matches.length; i += 1) {
    const current = matches[i]
    const before = normalized.slice(lastIndex, current.index).trim()
    if (before) {
      segments.push({ type: 'markdown', text: before })
    }

    const isLastTool = i === matches.length - 1
    const tailAfterTools = normalized.slice(current.index + current[0].length).trim()
    const status: 'done' | 'running' =
      streaming && isLastTool && !tailAfterTools ? 'running' : 'done'

    segments.push({
      type: 'tool',
      name: current[1].trim(),
      arguments: current[2]?.trim(),
      result: current[3].trim(),
      status,
    })

    lastIndex = current.index + current[0].length
  }

  const tail = normalized.slice(lastIndex).trim()
  if (tail) {
    segments.push({ type: 'markdown', text: tail })
  }

  return segments
}
