import { describe, expect, it } from 'vitest'
import {
  buildOllamaOcrGenerateOptions,
  consumeOllamaNdjsonLine,
  isOcrTokenRepeatMessage,
  salvageOllamaOcrAfterError,
} from './document-ocr-ollama-ndjson'

describe('document-ocr-ollama-ndjson', () => {
  it('caps glm-ocr decode length so pages cannot run to 8192 looping tokens', () => {
    expect(buildOllamaOcrGenerateOptions().num_predict).toBeLessThanOrEqual(384)
    expect(buildOllamaOcrGenerateOptions().num_ctx).toBeLessThanOrEqual(4096)
    expect(buildOllamaOcrGenerateOptions(true).num_predict).toBeLessThan(
      buildOllamaOcrGenerateOptions().num_predict,
    )
    expect(buildOllamaOcrGenerateOptions().repeat_penalty).toBeGreaterThan(1)
  })

  it('keeps streamed OCR text when Ollama aborts for token-repeat', () => {
    const acc = { text: '' }
    expect(consumeOllamaNdjsonLine('{"response":"第一章 场景"}', acc)).toEqual({ kind: 'ok' })
    expect(consumeOllamaNdjsonLine('{"response":" 立刻"}', acc)).toEqual({ kind: 'ok' })
    const err = consumeOllamaNdjsonLine(
      '{"error":"prediction aborted, token repeat limit reached"}',
      acc,
    )
    expect(err).toEqual({
      kind: 'error',
      message: 'prediction aborted, token repeat limit reached',
    })
    expect(isOcrTokenRepeatMessage('prediction aborted, token repeat limit reached')).toBe(true)
    expect(salvageOllamaOcrAfterError('prediction aborted, token repeat limit reached', acc.text)).toBe(
      '第一章 场景 立刻',
    )
  })

  it('does not salvage an empty token-repeat abort', () => {
    expect(salvageOllamaOcrAfterError('prediction aborted, token repeat limit reached', '  ')).toBeNull()
  })
})
