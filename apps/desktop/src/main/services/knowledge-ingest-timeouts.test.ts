import { describe, expect, it } from 'vitest'
import { resolveEmbedTimeoutMs, resolveParseTimeoutMs } from './knowledge-ingest-timeouts'

describe('knowledge ingest timeouts', () => {
  it('scales parse timeout with file size', () => {
    expect(resolveParseTimeoutMs(100 * 1024)).toBeGreaterThanOrEqual(20 * 60 * 1000)
    expect(resolveParseTimeoutMs(100 * 1024 * 1024)).toBeLessThanOrEqual(2 * 60 * 60 * 1000)
  })

  it('scales embed timeout with extracted text length', () => {
    expect(resolveEmbedTimeoutMs(50_000)).toBe(10 * 60 * 1000 + 30 * 1000)
    expect(resolveEmbedTimeoutMs(5_000_000)).toBeGreaterThan(10 * 60 * 1000)
    expect(resolveEmbedTimeoutMs(500_000_000)).toBeLessThanOrEqual(2 * 60 * 60 * 1000)
    expect(resolveEmbedTimeoutMs(50_000, 128)).toBeGreaterThan(resolveEmbedTimeoutMs(50_000))
  })
})
