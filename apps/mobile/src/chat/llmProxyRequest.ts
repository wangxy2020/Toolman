export function extractChatCompletionText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return ''
  const choices = (payload as { choices?: Array<{ message?: { content?: unknown } }> }).choices
  const content = choices?.[0]?.message?.content
  return typeof content === 'string' ? content.trim() : ''
}

export type LlmProxyChatInput = {
  baseUrl: string
  apiKey: string
  model: string
  messages: Array<{ role: string; content: string }>
}

export function parseLlmProxyChatBody(body: unknown): LlmProxyChatInput | { error: string } {
  const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : null
  const baseUrl = typeof record?.baseUrl === 'string' ? record.baseUrl.trim().replace(/\/$/, '') : ''
  const apiKey = typeof record?.apiKey === 'string' ? record.apiKey.trim() : ''
  const model = typeof record?.model === 'string' ? record.model.trim() : ''
  const messages = Array.isArray(record?.messages) ? record.messages : []
  if (!baseUrl) return { error: 'baseUrl required' }
  if (!apiKey) return { error: 'apiKey required' }
  if (!model) return { error: 'model required' }
  if (messages.length === 0) return { error: 'messages required' }
  try {
    const parsed = new URL(baseUrl)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { error: 'unsupported baseUrl' }
    }
  } catch {
    return { error: 'invalid baseUrl' }
  }
  const normalized = messages.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const row = item as { role?: unknown; content?: unknown }
    if (typeof row.role !== 'string' || typeof row.content !== 'string') return []
    return [{ role: row.role, content: row.content }]
  })
  if (normalized.length === 0) return { error: 'messages required' }
  return { baseUrl, apiKey, model, messages: normalized }
}

export async function proxyChatCompletion(input: LlmProxyChatInput): Promise<{
  status: number
  body: unknown
}> {
  const response = await fetch(`${input.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: input.model,
      stream: false,
      messages: input.messages,
    }),
  })
  const raw = await response.text()
  try {
    return { status: response.status, body: JSON.parse(raw) }
  } catch {
    return { status: response.status, body: { error: raw.slice(0, 300) || 'upstream error' } }
  }
}
