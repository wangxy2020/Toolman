import { describe, expect, it } from 'vitest'
import { formatEmbedNetworkError } from './ollama-embedder.js'

describe('formatEmbedNetworkError', () => {
  it('maps fetch failed / ECONNREFUSED to an Ollama start hint', () => {
    const error = new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } })
    expect(formatEmbedNetworkError(error, 'http://127.0.0.1:11434/v1').message).toContain(
      'Ollama',
    )
    expect(formatEmbedNetworkError(error, 'http://127.0.0.1:11434/v1').message).toContain(
      '已启动',
    )
  })

  it('keeps non-network errors intact', () => {
    expect(formatEmbedNetworkError(new Error('Embedding API 400: oops'), 'http://x').message).toBe(
      'Embedding API 400: oops',
    )
  })
})
