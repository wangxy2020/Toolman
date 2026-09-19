import { describe, expect, it } from 'vitest'
import {
  DEFAULT_KNOWLEDGE_RETRIEVAL_CONFIG,
  mergeKnowledgeRetrievalConfig,
  parseKnowledgeRetrievalConfig,
} from './knowledge-retrieval-config.js'

describe('parseKnowledgeRetrievalConfig', () => {
  it('returns defaults for empty input', () => {
    expect(parseKnowledgeRetrievalConfig(null)).toEqual(DEFAULT_KNOWLEDGE_RETRIEVAL_CONFIG)
    expect(parseKnowledgeRetrievalConfig('{}').vectorWeight).toBe(0.65)
    expect(parseKnowledgeRetrievalConfig('{}').ftsWeight).toBe(0.35)
  })

  it('merges stored JSON with caller overrides without scattering weights', () => {
    const merged = mergeKnowledgeRetrievalConfig(
      JSON.stringify({ vectorWeight: 0.5, ftsWeight: 0.5 }),
      { pageWeight: 2 },
    )
    expect(merged.vectorWeight).toBe(0.5)
    expect(merged.ftsWeight).toBe(0.5)
    expect(merged.pageWeight).toBe(2)
    expect(merged.titleWeight).toBe(DEFAULT_KNOWLEDGE_RETRIEVAL_CONFIG.titleWeight)
  })
})
