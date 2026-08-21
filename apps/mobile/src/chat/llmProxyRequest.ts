export function extractChatCompletionText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return ''
  const choices = (payload as { choices?: Array<{ message?: { content?: unknown } }> }).choices
  const content = choices?.[0]?.message?.content
  return typeof content === 'string' ? content.trim() : ''
}

export function extractChatCompletionUsageTokens(payload: unknown): number {
  if (!payload || typeof payload !== 'object') return 0
  const usage = (payload as {
    usage?: { total_tokens?: unknown; prompt_tokens?: unknown; completion_tokens?: unknown }
  }).usage
  const total = usage?.total_tokens
  if (typeof total === 'number' && Number.isFinite(total) && total > 0) return Math.floor(total)
  const prompt = typeof usage?.prompt_tokens === 'number' ? usage.prompt_tokens : 0
  const completion = typeof usage?.completion_tokens === 'number' ? usage.completion_tokens : 0
  const sum = prompt + completion
  return Number.isFinite(sum) && sum > 0 ? Math.floor(sum) : 0
}

export type LlmProxyChatInput = {
  baseUrl: string
  apiKey: string
  model: string
  messages: Array<{ role: string; content: string }>
  trial?: boolean
  stream?: boolean
  deviceId?: string
}

function normalizeMessages(messages: unknown): Array<{ role: string; content: string }> {
  if (!Array.isArray(messages)) return []
  return messages.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const row = item as { role?: unknown; content?: unknown }
    if (typeof row.role !== 'string' || typeof row.content !== 'string') return []
    return [{ role: row.role, content: row.content }]
  })
}

export function parseLlmProxyChatBody(body: unknown): LlmProxyChatInput | { error: string } {
  const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : null
  const messages = normalizeMessages(record?.messages)
  if (messages.length === 0) return { error: 'messages required' }

  const trial = record?.trial === true
  const stream = record?.stream === true
  const deviceId = typeof record?.deviceId === 'string' ? record.deviceId.trim() : ''

  if (trial) {
    return {
      trial: true,
      stream,
      deviceId,
      baseUrl: '',
      apiKey: '',
      model: '',
      messages,
    }
  }

  const baseUrl = typeof record?.baseUrl === 'string' ? record.baseUrl.trim().replace(/\/$/, '') : ''
  const apiKey = typeof record?.apiKey === 'string' ? record.apiKey.trim() : ''
  const model = typeof record?.model === 'string' ? record.model.trim() : ''
  if (!baseUrl) return { error: 'baseUrl required' }
  if (!apiKey) return { error: 'apiKey required' }
  if (!model) return { error: 'model required' }
  try {
    const parsed = new URL(baseUrl)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { error: 'unsupported baseUrl' }
    }
  } catch {
    return { error: 'invalid baseUrl' }
  }
  return { baseUrl, apiKey, model, messages, stream, deviceId }
}
