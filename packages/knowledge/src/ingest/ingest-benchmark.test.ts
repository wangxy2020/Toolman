import { describe, expect, it, vi } from 'vitest'
import { chunkText } from '../chunking/text-chunker.js'
import { ingestContent } from './content-ingest.js'

vi.mock('../embedding/ollama-embedder.js', () => ({
  embedTexts: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
}))

vi.mock('../vector/create-vector-store.js', () => ({
  openKbVectorStore: vi.fn().mockResolvedValue({
    upsert: vi.fn().mockResolvedValue(undefined),
  }),
}))

const CHUNK_CONFIG = {
  strategy: 'fixed' as const,
  chunkSize: 512,
  chunkOverlap: 64,
}

describe('knowledge ingest benchmark', () => {
  it('chunks ~100k chars within throughput budget', () => {
    const text = `${'Toolman knowledge ingest benchmark paragraph. '.repeat(2_000)}\n`
    expect(text.length).toBeGreaterThan(90_000)

    const started = performance.now()
    const chunks = chunkText(text, CHUNK_CONFIG)
    const elapsedMs = performance.now() - started

    expect(chunks.length).toBeGreaterThan(50)
    expect(elapsedMs).toBeLessThan(750)
  })

  it('ingests mocked pipeline for medium document within budget', async () => {
    const plainText = `${'Section content for ingest benchmark. '.repeat(400)}\n`
    const started = performance.now()
    const result = await ingestContent({
      sourceKey: '/tmp/benchmark.md',
      title: 'benchmark.md',
      plainText,
      mimeType: 'text/markdown',
      kind: 'markdown',
      contentHash: 'benchmark-hash',
      kbId: 'kb-benchmark',
      documentId: 'doc-benchmark',
      chunkConfig: CHUNK_CONFIG,
      embedOptions: {
        baseUrl: 'http://127.0.0.1:11434/v1',
        model: 'bge-m3:latest',
        apiKey: null,
      },
      embedModel: 'bge-m3:latest',
      vectorsDir: '/tmp/toolman-benchmark-vectors',
    })
    const elapsedMs = performance.now() - started

    expect(result.chunkCount).toBeGreaterThan(5)
    expect(elapsedMs).toBeLessThan(2_000)
  })
})
