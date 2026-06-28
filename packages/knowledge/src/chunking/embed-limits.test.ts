import { describe, expect, it } from 'vitest'
import {
  assertEmbedSafeTexts,
  maxEmbedCharsForText,
  resolveEmbedInputCharLimit,
  splitTextForEmbedding,
} from './embed-limits.js'
import { chunkText } from './text-chunker.js'

describe('embed limits', () => {
  it('uses model-specific char limits for bge-m3', () => {
    expect(resolveEmbedInputCharLimit('bge-m3:latest')).toBe(1200)
    expect(maxEmbedCharsForText('word '.repeat(2000), 512, 'bge-m3:latest')).toBeLessThanOrEqual(1200)
  })

  it('splits oversized Chinese text before embedding', () => {
    const text = '这是一段中文内容。'.repeat(300)
    const parts = splitTextForEmbedding(text, 512, 64, 'bge-m3:latest')

    expect(parts.length).toBeGreaterThan(1)
    for (const part of parts) {
      expect(part.length).toBeLessThanOrEqual(1200)
    }
  })

  it('splits dense JSON/code that tokenizes near one token per character', () => {
    const json = '{"key":"value","id":'.repeat(400)
    const parts = splitTextForEmbedding(json, 512, 32, 'bge-m3:latest')

    expect(parts.length).toBeGreaterThan(1)
    for (const part of parts) {
      expect(part.length).toBeLessThanOrEqual(1200)
    }
  })

  it('rejects unsafe embed payloads before calling the API', () => {
    expect(() => assertEmbedSafeTexts(['x'.repeat(2000)], 'bge-m3:latest')).toThrow(/内部分段异常/)
  })
})

describe('chunkText', () => {
  it('keeps Chinese chunks within configured token budget', () => {
    const text = '中文测试内容。'.repeat(500)
    const chunks = chunkText(text, {
      chunkSize: 512,
      chunkOverlap: 64,
      strategy: 'fixed',
    })

    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(1200)
    }
  })
})
