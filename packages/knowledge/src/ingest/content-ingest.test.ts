import { describe, expect, it, vi } from 'vitest'
import { ingestContent } from './content-ingest.js'

vi.mock('../embedding/ollama-embedder.js', () => ({
  embedTexts: vi.fn().mockImplementation(async (_options: unknown, texts: string[]) =>
    texts.map(() => [0.1, 0.2, 0.3]),
  ),
}))

vi.mock('../vector/create-vector-store.js', () => ({
  openKbVectorStore: vi.fn().mockResolvedValue({
    upsert: vi.fn().mockResolvedValue(undefined),
  }),
}))

describe('ingestContent', () => {
  it('chunks text and persists vector records', async () => {
    const result = await ingestContent({
      sourceKey: '/tmp/sample.md',
      title: 'sample.md',
      plainText: 'Hello world from Toolman knowledge ingest pipeline.',
      mimeType: 'text/markdown',
      kind: 'markdown',
      contentHash: 'hash-1',
      kbId: 'kb-1',
      documentId: 'doc-1',
      chunkConfig: {
        strategy: 'fixed',
        chunkSize: 200,
        chunkOverlap: 20,
      },
      embedOptions: {
        baseUrl: 'http://127.0.0.1:11434/v1',
        model: 'bge-m3:latest',
        apiKey: null,
      },
      embedModel: 'bge-m3:latest',
      vectorsDir: '/tmp/toolman-test-vectors',
    })

    expect(result.chunks.length).toBeGreaterThan(0)
    expect(result.chunkCount).toBe(result.chunks.length)
    expect(result.title).toBe('sample.md')
  })
})
