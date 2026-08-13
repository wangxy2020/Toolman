import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { FileVectorStore, getKbVectorStorePath } from '../vector/file-vector-store.js'
import { moveDocumentVectors } from './file-ingest.js'

describe('moveDocumentVectors', () => {
  const dirs: string[] = []

  afterEach(() => {
    for (const dir of dirs) {
      rmSync(dir, { recursive: true, force: true })
    }
    dirs.length = 0
  })

  it('copies existing embeddings to the destination kb without re-embedding', async () => {
    const vectorsDir = mkdtempSync(join(tmpdir(), 'toolman-move-vectors-'))
    dirs.push(vectorsDir)

    const source = new FileVectorStore(getKbVectorStorePath(vectorsDir, 'kb-source'))
    source.upsert(
      [
        {
          chunkId: 'chunk-1',
          documentId: 'doc-1',
          kbId: 'kb-source',
          vector: [0.1, 0.2, 0.3],
          metadata: { filePath: '/old/a.md' },
        },
      ],
      { dimension: 3, model: 'bge-m3:latest' },
    )

    const moved = await moveDocumentVectors({
      vectorsDir,
      sourceKbId: 'kb-source',
      destKbId: 'kb-dest',
      documentId: 'doc-1',
      destPath: '/sync/a.md',
      embedModel: 'bge-m3:latest',
    })

    expect(moved).toBe(1)
    expect(source.listByDocumentId('doc-1')).toHaveLength(0)

    const dest = new FileVectorStore(getKbVectorStorePath(vectorsDir, 'kb-dest'))
    const records = dest.listByDocumentId('doc-1')
    expect(records).toHaveLength(1)
    expect(records[0]?.kbId).toBe('kb-dest')
    expect(records[0]?.vector).toEqual([0.1, 0.2, 0.3])
    expect(records[0]?.metadata?.filePath).toBe('/sync/a.md')
  })
})
