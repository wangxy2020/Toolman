import { describe, expect, it } from 'vitest'
import {
  KnowledgeSnapshotSchema,
  decodeFloat32Vector,
  encodeFloat32Vector,
} from './knowledge-snapshot.js'

describe('knowledge snapshot vectors', () => {
  it('round-trips float32 embeddings through base64', () => {
    const original = [0, 0.5, -1, 1.25]
    const decoded = decodeFloat32Vector(encodeFloat32Vector(original))
    expect(decoded).toHaveLength(original.length)
    for (let i = 0; i < original.length; i += 1) {
      expect(decoded[i]).toBeCloseTo(original[i]!, 5)
    }
  })

  it('parses an empty snapshot', () => {
    const parsed = KnowledgeSnapshotSchema.parse({
      schemaVersion: 1,
      exportedAt: 1,
      kbs: [],
      documents: [],
      chunks: [],
      vectors: [],
      files: [],
    })
    expect(parsed.documents).toEqual([])
  })
})
