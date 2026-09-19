import { describe, expect, it } from 'vitest'
import { assessKnowledgeHealth } from '@toolman/shared'

describe('knowledge health service contract', () => {
  it('keeps file-ready-without-vectors as broken for searchable knowledge', () => {
    expect(
      assessKnowledgeHealth({
        status: 'ready',
        fileExists: true,
        contentHashMatches: true,
        chunkCount: 3,
        ftsCount: 3,
        vectorCount: 0,
        documentIndexVersion: 1,
        activeIndexVersion: 1,
        sourceValid: true,
        retrievalEnabled: true,
      }).status,
    ).toBe('broken')
  })
})
