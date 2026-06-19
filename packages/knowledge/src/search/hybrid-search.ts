export interface SearchCandidate {
  chunkId: string
  documentId: string
  score: number
  source: 'vector' | 'fts'
}

export interface FusedSearchHit {
  chunkId: string
  documentId: string
  score: number
  vectorScore: number
  ftsScore: number
}

export function fuseHybridResults(
  vectorHits: Array<{ chunkId: string; documentId: string; score: number }>,
  ftsHits: Array<{ chunkId: string; documentId: string; score: number }>,
  options: {
    topK: number
    vectorWeight?: number
    ftsWeight?: number
  },
): FusedSearchHit[] {
  const vectorWeight = options.vectorWeight ?? 0.65
  const ftsWeight = options.ftsWeight ?? 0.35
  const merged = new Map<string, FusedSearchHit>()

  for (const hit of vectorHits) {
    merged.set(hit.chunkId, {
      chunkId: hit.chunkId,
      documentId: hit.documentId,
      score: hit.score * vectorWeight,
      vectorScore: hit.score,
      ftsScore: 0,
    })
  }

  for (const hit of ftsHits) {
    const existing = merged.get(hit.chunkId)
    if (existing) {
      existing.score += hit.score * ftsWeight
      existing.ftsScore = hit.score
      continue
    }

    merged.set(hit.chunkId, {
      chunkId: hit.chunkId,
      documentId: hit.documentId,
      score: hit.score * ftsWeight,
      vectorScore: 0,
      ftsScore: hit.score,
    })
  }

  return [...merged.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, options.topK)
}

export function dedupeByDocument(hits: FusedSearchHit[], topK: number): FusedSearchHit[] {
  const seenDocuments = new Set<string>()
  const result: FusedSearchHit[] = []

  for (const hit of hits) {
    if (seenDocuments.has(hit.documentId)) continue
    seenDocuments.add(hit.documentId)
    result.push(hit)
    if (result.length >= topK) break
  }

  return result
}
