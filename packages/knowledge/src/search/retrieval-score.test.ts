import { describe, expect, it } from 'vitest'
import { metadataMatchScore, scoreHybridRetrievalHit } from './retrieval-score.js'

const DEFAULT_WEIGHTS = {
  vectorWeight: 0.65,
  ftsWeight: 0.35,
  metadataWeight: 0.15,
  pageWeight: 1,
  titleWeight: 1.2,
  rerankWeight: 1,
}

describe('scoreHybridRetrievalHit', () => {
  it('combines vector and fts using centralized weights', () => {
    const score = scoreHybridRetrievalHit(
      { vectorScore: 1, ftsScore: 0.5 },
      DEFAULT_WEIGHTS,
    )
    expect(score).toBeCloseTo(0.65 + 0.175)
  })

  it('boosts PDF page + filename matches', () => {
    const match = metadataMatchScore({ fileNameMatches: true, pageMatches: true })
    const score = scoreHybridRetrievalHit(
      { vectorScore: 0.2, ftsScore: 0.2, ...match },
      DEFAULT_WEIGHTS,
    )
    expect(score).toBeGreaterThan(1)
  })
})
