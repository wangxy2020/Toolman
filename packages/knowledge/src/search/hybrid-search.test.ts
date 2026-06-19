import { describe, expect, it } from 'vitest'
import { dedupeByDocument, fuseHybridResults } from './hybrid-search.js'

describe('fuseHybridResults', () => {
  it('merges vector and fts scores for the same chunk', () => {
    const hits = fuseHybridResults(
      [{ chunkId: 'c1', documentId: 'd1', score: 1 }],
      [{ chunkId: 'c1', documentId: 'd1', score: 0.5 }],
      { topK: 5 },
    )

    expect(hits).toHaveLength(1)
    expect(hits[0]?.chunkId).toBe('c1')
    expect(hits[0]?.vectorScore).toBe(1)
    expect(hits[0]?.ftsScore).toBe(0.5)
    expect(hits[0]?.score).toBeCloseTo(0.65 + 0.175)
  })

  it('returns topK fused hits sorted by score', () => {
    const hits = fuseHybridResults(
      [
        { chunkId: 'c1', documentId: 'd1', score: 0.2 },
        { chunkId: 'c2', documentId: 'd2', score: 0.9 },
      ],
      [{ chunkId: 'c3', documentId: 'd3', score: 1 }],
      { topK: 2 },
    )

    expect(hits).toHaveLength(2)
    expect(hits[0]?.chunkId).toBe('c2')
    expect(hits[1]?.chunkId).toBe('c3')
  })
})

describe('dedupeByDocument', () => {
  it('keeps only the highest-ranked chunk per document', () => {
    const hits = dedupeByDocument(
      [
        {
          chunkId: 'c1',
          documentId: 'd1',
          score: 0.9,
          vectorScore: 0.9,
          ftsScore: 0,
        },
        {
          chunkId: 'c2',
          documentId: 'd1',
          score: 0.5,
          vectorScore: 0.5,
          ftsScore: 0,
        },
        {
          chunkId: 'c3',
          documentId: 'd2',
          score: 0.8,
          vectorScore: 0.8,
          ftsScore: 0,
        },
      ],
      5,
    )

    expect(hits).toHaveLength(2)
    expect(hits.map((hit) => hit.chunkId)).toEqual(['c1', 'c3'])
  })
})
