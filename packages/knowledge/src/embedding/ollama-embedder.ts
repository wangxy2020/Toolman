export interface EmbedOptions {
  baseUrl: string
  model: string
  apiKey?: string | null
}

export async function embedTexts(options: EmbedOptions, texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []

  const vectors: number[][] = []
  const batchSize = 16

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize)
    const batchVectors = await Promise.all(batch.map((text) => embedSingle(options, text)))
    vectors.push(...batchVectors)
  }

  return vectors
}

async function embedSingle(options: EmbedOptions, text: string): Promise<number[]> {
  const trimmedBase = options.baseUrl.replace(/\/$/, '')
  const openAiUrl = trimmedBase.endsWith('/v1')
    ? `${trimmedBase}/embeddings`
    : `${trimmedBase}/v1/embeddings`

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (options.apiKey) {
    headers.Authorization = `Bearer ${options.apiKey}`
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 120_000)

  try {
    let response = await fetch(openAiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: options.model,
        input: text,
      }),
      signal: controller.signal,
    })

    if (!response.ok && trimmedBase.includes('11434')) {
      response = await fetch(`${trimmedBase.replace(/\/v1$/, '')}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: options.model,
          prompt: text,
        }),
        signal: controller.signal,
      })
    }

    if (!response.ok) {
      throw new Error(`Embedding API ${response.status}: ${await response.text()}`)
    }

    const payload = (await response.json()) as
      | { data?: Array<{ embedding?: number[] }> }
      | { embedding?: number[] }

    if ('embedding' in payload && Array.isArray(payload.embedding)) {
      return payload.embedding
    }

    const openAiPayload = payload as { data?: Array<{ embedding?: number[] }> }
    const embedding = openAiPayload.data?.[0]?.embedding
    if (!embedding) {
      throw new Error('Embedding API 返回格式无效')
    }

    return embedding
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Embedding API 响应超时，请检查嵌入模型服务是否可用')
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function testEmbeddingConnection(options: EmbedOptions): Promise<boolean> {
  const [vector] = await embedTexts(options, ['ping'])
  return vector.length > 0
}
