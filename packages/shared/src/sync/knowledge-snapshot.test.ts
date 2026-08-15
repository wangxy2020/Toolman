import { describe, expect, it } from 'vitest'
import {
  KnowledgeSnapshotSchema,
  decodeFloat32Vector,
  encodeFloat32Vector,
  mergeKnowledgeSnapshot,
  type KnowledgeSnapshot,
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

  it('merges incremental document bodies and drops deleted docs', () => {
    const previous: KnowledgeSnapshot = {
      schemaVersion: 1,
      exportedAt: 1,
      kbs: [{ id: 'kb1', name: 'A', kind: 'sync', documentCount: 2, updatedAt: 1 }],
      documents: [
        {
          id: 'd1',
          kbId: 'kb1',
          title: 'old',
          status: 'ready',
          sourceKind: 'file',
          chunkCount: 1,
          updatedAt: 1,
        },
        {
          id: 'd2',
          kbId: 'kb1',
          title: 'keep',
          status: 'ready',
          sourceKind: 'file',
          chunkCount: 1,
          updatedAt: 1,
        },
      ],
      chunks: [
        { id: 'c1', documentId: 'd1', kbId: 'kb1', chunkIndex: 0, text: 'old' },
        { id: 'c2', documentId: 'd2', kbId: 'kb1', chunkIndex: 0, text: 'keep' },
      ],
      vectors: [],
      files: [
        { documentId: 'd1', kbId: 'kb1', fileName: 'a.md', sizeBytes: 1 },
        { documentId: 'd2', kbId: 'kb1', fileName: 'b.md', sizeBytes: 1 },
      ],
    }
    const incoming: KnowledgeSnapshot = {
      schemaVersion: 1,
      exportedAt: 2,
      kbs: [{ id: 'kb1', name: 'A', kind: 'sync', documentCount: 1, updatedAt: 2 }],
      documents: [
        {
          id: 'd2',
          kbId: 'kb1',
          title: 'keep',
          status: 'ready',
          sourceKind: 'file',
          chunkCount: 1,
          updatedAt: 2,
        },
      ],
      chunks: [{ id: 'c2b', documentId: 'd2', kbId: 'kb1', chunkIndex: 0, text: 'updated' }],
      vectors: [],
      files: [{ documentId: 'd2', kbId: 'kb1', fileName: 'b.md', sizeBytes: 2 }],
    }
    const merged = mergeKnowledgeSnapshot(previous, incoming)
    expect(merged.documents.map((doc) => doc.id)).toEqual(['d2'])
    expect(merged.chunks).toEqual(incoming.chunks)
    expect(merged.files).toEqual(incoming.files)
  })
})
