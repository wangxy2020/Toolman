import { describe, expect, it } from 'vitest'
import {
  assessKnowledgeHealth,
  buildDocumentRevisionId,
  buildKnowledgeIndexFingerprint,
  buildKnowledgeIndexVersionId,
} from './knowledge-infrastructure.js'

describe('knowledge infrastructure ids', () => {
  it('builds stable revision and index version ids', () => {
    expect(buildDocumentRevisionId('doc-1', 2)).toBe('doc-1:rev:2')
    expect(buildKnowledgeIndexVersionId('kb-1', 1)).toBe('kb-1:idx:1')
  })

  it('fingerprints chunk + embedding config for incremental ingest', () => {
    const a = buildKnowledgeIndexFingerprint({
      chunkStrategy: 'markdown',
      chunkSize: 512,
      chunkOverlap: 64,
      embeddingModel: 'bge-m3:latest',
      embeddingDimension: 1024,
      vectorBackend: 'file',
    })
    const b = buildKnowledgeIndexFingerprint({
      chunkStrategy: 'markdown',
      chunkSize: 1200,
      chunkOverlap: 64,
      embeddingModel: 'bge-m3:latest',
      embeddingDimension: 1024,
      vectorBackend: 'file',
    })
    expect(a).not.toBe(b)
    expect(a).toContain('bge-m3:latest')
  })
})

describe('assessKnowledgeHealth', () => {
  const readyBase = {
    status: 'ready',
    fileExists: true,
    contentHashMatches: true,
    chunkCount: 4,
    ftsCount: 4,
    vectorCount: 4,
    documentIndexVersion: 1,
    activeIndexVersion: 1,
    sourceValid: true,
    retrievalEnabled: true,
  }

  it('reports healthy when file, hashes, chunks, fts, and vectors agree', () => {
    expect(assessKnowledgeHealth(readyBase).status).toBe('healthy')
  })

  it('reports stale when the source file hash no longer matches', () => {
    expect(assessKnowledgeHealth({ ...readyBase, contentHashMatches: false }).status).toBe(
      'stale',
    )
  })

  it('reports broken when sqlite is ready but vectors are missing', () => {
    expect(assessKnowledgeHealth({ ...readyBase, vectorCount: 0 }).status).toBe('broken')
  })

  it('does not require vectors for local_files registry rows', () => {
    expect(
      assessKnowledgeHealth({
        ...readyBase,
        vectorCount: 0,
        ftsCount: 0,
        chunkCount: 0,
        retrievalEnabled: false,
      }).status,
    ).toBe('healthy')
  })
})
