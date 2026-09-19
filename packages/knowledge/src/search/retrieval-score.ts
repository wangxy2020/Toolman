export interface RetrievalScoreWeights {
  vectorWeight: number
  ftsWeight: number
  metadataWeight: number
  pageWeight: number
  titleWeight: number
  rerankWeight: number
}

export interface RetrievalHitInput {
  vectorScore: number
  ftsScore: number
  metadataScore?: number
  pageScore?: number
  titleScore?: number
  rerankScore?: number
}

/**
 * Extensible hybrid score:
 * vector + fts + metadata + page + title + rerank.
 * Weights come from a single retrieval_config, not call-site constants.
 */
export function scoreHybridRetrievalHit(
  hit: RetrievalHitInput,
  config: RetrievalScoreWeights,
): number {
  const rerank = hit.rerankScore
  const fused =
    hit.vectorScore * config.vectorWeight +
    hit.ftsScore * config.ftsWeight +
    (hit.metadataScore ?? 0) * config.metadataWeight +
    (hit.pageScore ?? 0) * config.pageWeight +
    (hit.titleScore ?? 0) * config.titleWeight
  if (rerank == null) return fused
  return fused * (1 - Math.min(1, config.rerankWeight) * 0.5) + rerank * config.rerankWeight
}

export function metadataMatchScore(options: {
  fileNameMatches?: boolean | null
  pageMatches?: boolean | null
}): { metadataScore: number; pageScore: number; titleScore: number } {
  const titleScore = options.fileNameMatches ? 1 : options.fileNameMatches === false ? -1 : 0
  const pageScore = options.pageMatches ? 1 : options.pageMatches === false ? -1 : 0
  const metadataScore = (options.fileNameMatches ? 1 : 0) + (options.pageMatches ? 1 : 0)
  return { metadataScore, pageScore, titleScore }
}
