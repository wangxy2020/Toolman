export interface RerankOptions {
  baseUrl: string
  model: string
  apiKey?: string | null
}

export interface RerankHit {
  index: number
  score: number
}

export async function rerankDocuments(
  options: RerankOptions,
  query: string,
  documents: string[],
  topN?: number,
): Promise<RerankHit[]> {
  if (documents.length === 0) return []

  const trimmedBase = options.baseUrl.replace(/\/$/, '')
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (options.apiKey) {
    headers.Authorization = `Bearer ${options.apiKey}`
  }

  const body = {
    model: options.model,
    query,
    documents,
    top_n: topN ?? documents.length,
  }

  const endpoints = [
    trimmedBase.endsWith('/v1') ? `${trimmedBase}/rerank` : `${trimmedBase}/v1/rerank`,
    `${trimmedBase.replace(/\/v1$/, '')}/api/rerank`,
  ]

  for (const url of endpoints) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      })
      if (!response.ok) continue

      const payload = (await response.json()) as {
        results?: Array<{ index?: number; relevance_score?: number; score?: number }>
        data?: Array<{ index?: number; relevance_score?: number; score?: number }>
      }

      const rows = payload.results ?? payload.data
      if (!Array.isArray(rows) || rows.length === 0) continue

      return rows
        .map((row, fallbackIndex) => ({
          index: typeof row.index === 'number' ? row.index : fallbackIndex,
          score: row.relevance_score ?? row.score ?? 0,
        }))
        .filter((row) => row.index >= 0 && row.index < documents.length)
        .sort((a, b) => b.score - a.score)
    } catch {
      continue
    }
  }

  return documents.map((_, index) => ({ index, score: 1 - index * 0.001 }))
}
