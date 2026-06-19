export interface VectorRecord {
  chunkId: string
  documentId: string
  kbId: string
  vector: number[]
  metadata?: Record<string, unknown>
}

export interface VectorSearchHit {
  chunkId: string
  documentId: string
  score: number
  metadata?: Record<string, unknown>
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0

  let dot = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!
    normA += a[i]! * a[i]!
    normB += b[i]! * b[i]!
  }

  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

export function searchVectors(
  records: VectorRecord[],
  queryVector: number[],
  topK: number,
): VectorSearchHit[] {
  return records
    .map((record) => ({
      chunkId: record.chunkId,
      documentId: record.documentId,
      score: cosineSimilarity(record.vector, queryVector),
      metadata: record.metadata,
    }))
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
}
