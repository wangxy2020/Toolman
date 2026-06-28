import { assertEmbedSafeTexts, isEmbedContextLengthError } from '../chunking/embed-limits.js'

export interface EmbedOptions {
  baseUrl: string
  model: string
  apiKey?: string | null
}

export interface EmbedProgressCallback {
  (completed: number, total: number): void
}

const OLLAMA_EMBED_CONCURRENCY = 8
const OPENAI_EMBED_BATCH_SIZE = 8
const OPENAI_EMBED_CONCURRENCY = 4
const EMBED_REQUEST_TIMEOUT_MS = 120_000

function isOllamaEmbedBaseUrl(baseUrl: string): boolean {
  const normalized = baseUrl.toLowerCase()
  return normalized.includes('11434') || normalized.includes('ollama')
}

function resolveOllamaEmbedBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, '').replace(/\/v1$/, '')
}

function resolveEmbeddingsUrl(baseUrl: string): string {
  const trimmedBase = baseUrl.replace(/\/$/, '')
  return trimmedBase.endsWith('/v1')
    ? `${trimmedBase}/embeddings`
    : `${trimmedBase}/v1/embeddings`
}

async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
  onProgress?: EmbedProgressCallback,
): Promise<R[]> {
  if (items.length === 0) return []

  const results = new Array<R>(items.length)
  let nextIndex = 0
  let completed = 0

  const worker = async () => {
    while (true) {
      const index = nextIndex
      nextIndex += 1
      if (index >= items.length) return
      results[index] = await mapper(items[index]!, index)
      completed += 1
      onProgress?.(completed, items.length)
    }
  }

  const workerCount = Math.min(Math.max(1, concurrency), items.length)
  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  return results
}

async function embedOllamaSingle(options: EmbedOptions, text: string): Promise<number[]> {
  const base = resolveOllamaEmbedBaseUrl(options.baseUrl)
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), EMBED_REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(`${base}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: options.model,
        input: text,
        truncate: true,
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const detail = await response.text()
      if (response.status === 400 && isEmbedContextLengthError(detail)) {
        throw new Error(
          'Embedding API 400: 文本分段过长，超过嵌入模型上下文限制。请减小知识库「分段大小」后重建索引。',
        )
      }
      throw new Error(`Embedding API ${response.status}: ${detail}`)
    }

    const payload = (await response.json()) as { embeddings?: number[][] }
    const embedding = payload.embeddings?.[0]
    if (!embedding?.length) {
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

async function embedOpenAiCompatibleSingle(options: EmbedOptions, text: string): Promise<number[]> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (options.apiKey) {
    headers.Authorization = `Bearer ${options.apiKey}`
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), EMBED_REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(resolveEmbeddingsUrl(options.baseUrl), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: options.model,
        input: text,
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const detail = await response.text()
      if (response.status === 400 && isEmbedContextLengthError(detail)) {
        throw new Error(
          'Embedding API 400: 文本分段过长，超过嵌入模型上下文限制。请减小知识库「分段大小」后重建索引。',
        )
      }
      throw new Error(`Embedding API ${response.status}: ${detail}`)
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

export async function embedTexts(
  options: EmbedOptions,
  texts: string[],
  onProgress?: EmbedProgressCallback,
): Promise<number[][]> {
  if (texts.length === 0) return []

  assertEmbedSafeTexts(texts, options.model)

  if (isOllamaEmbedBaseUrl(options.baseUrl)) {
    return mapConcurrent(
      texts,
      OLLAMA_EMBED_CONCURRENCY,
      (text) => embedOllamaSingle(options, text),
      onProgress,
    )
  }

  const vectors: number[][] = []
  for (let offset = 0; offset < texts.length; offset += OPENAI_EMBED_BATCH_SIZE) {
    const batch = texts.slice(offset, offset + OPENAI_EMBED_BATCH_SIZE)
    for (let i = 0; i < batch.length; i += OPENAI_EMBED_CONCURRENCY) {
      const miniBatch = batch.slice(i, i + OPENAI_EMBED_CONCURRENCY)
      const miniVectors = await Promise.all(
        miniBatch.map((text) => embedOpenAiCompatibleSingle(options, text)),
      )
      vectors.push(...miniVectors)
    }
    onProgress?.(Math.min(offset + batch.length, texts.length), texts.length)
  }

  return vectors
}

export async function testEmbeddingConnection(options: EmbedOptions): Promise<boolean> {
  const [vector] = await embedTexts(options, ['ping'])
  return vector.length > 0
}
