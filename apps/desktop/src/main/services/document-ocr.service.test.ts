import { describe, expect, it } from 'vitest'
import type { ProviderModel } from '@toolman/shared'
import { pickOcrVisionModelId, toOcrImageBase64 } from './document-ocr.service'

function model(id: string): ProviderModel {
  return { id, name: id } as ProviderModel
}

describe('pickOcrVisionModelId', () => {
  it('prefers glm-ocr over chat models that only match broad vision heuristics', () => {
    expect(
      pickOcrVisionModelId([
        model('qwen3.6:latest'),
        model('qwen3.5:9b'),
        model('glm-ocr:latest'),
        model('gemma4:latest'),
        model('bge-m3:latest'),
      ]),
    ).toBe('glm-ocr:latest')
  })

  it('falls back to a strict VL model when glm-ocr is missing', () => {
    expect(
      pickOcrVisionModelId([
        model('qwen3.5:9b'),
        model('gemma4:latest'),
        model('qwen2.5-vl:7b'),
      ]),
    ).toBe('qwen2.5-vl:7b')
  })

  it('returns null when no vision model is available', () => {
    expect(pickOcrVisionModelId([model('bge-m3:latest')])).toBeNull()
  })
})

describe('toOcrImageBase64', () => {
  it('encodes Uint8Array the same as Buffer (worker clone case)', () => {
    const bytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const fromBuffer = Buffer.from(bytes).toString('base64')
    expect(toOcrImageBase64(bytes)).toBe(fromBuffer)
    // Regression: coercing Uint8Array to string is not base64 encoding.
    expect(String(bytes)).not.toBe(fromBuffer)
    expect(toOcrImageBase64(bytes).startsWith('iVBOR')).toBe(true)
  })
})

