import { describe, expect, it } from 'vitest'
import {
  buildOdlHybridServerArgs,
  FALLBACK_ODL_HYBRID_OCR,
  MAC_VISION_ODL_HYBRID_OCR,
  RAPID_ODL_HYBRID_OCR,
  parseOdlHybridPort,
  shouldForceOdlHybridOcr,
} from './odl-hybrid-server-manager.service'

describe('parseOdlHybridPort', () => {
  it('parses explicit localhost port', () => {
    expect(parseOdlHybridPort('http://localhost:5002')).toBe(5002)
  })

  it('defaults http to port 80', () => {
    expect(parseOdlHybridPort('http://127.0.0.1')).toBe(80)
  })

  it('defaults https to port 443', () => {
    expect(parseOdlHybridPort('https://localhost')).toBe(443)
  })
})

describe('buildOdlHybridServerArgs', () => {
  it('forces Apple Vision OCR with MPS for scanned pages on Hybrid', () => {
    expect(buildOdlHybridServerArgs(5002, { ocr: MAC_VISION_ODL_HYBRID_OCR })).toEqual([
      '--port',
      '5002',
      '--force-ocr',
      '--ocr-engine',
      'ocrmac',
      '--ocr-lang',
      'zh-Hans,en-US',
      '--device',
      'mps',
    ])
  })

  it('can fall back to RapidOCR Chinese with MPS', () => {
    expect(buildOdlHybridServerArgs(5002, { ocr: RAPID_ODL_HYBRID_OCR })).toEqual([
      '--port',
      '5002',
      '--force-ocr',
      '--ocr-engine',
      'rapidocr',
      '--ocr-lang',
      'chinese',
      '--device',
      'mps',
    ])
  })

  it('can fall back to EasyOCR Simplified Chinese instead of English-only default', () => {
    expect(buildOdlHybridServerArgs(5002, { ocr: FALLBACK_ODL_HYBRID_OCR })).toEqual([
      '--port',
      '5002',
      '--force-ocr',
      '--ocr-engine',
      'easyocr',
      '--ocr-lang',
      'ch_sim,en',
    ])
  })

  it('omits OCR flags when force OCR is off', () => {
    expect(buildOdlHybridServerArgs(5002, { forceOcr: false })).toEqual(['--port', '5002'])
  })
})

describe('shouldForceOdlHybridOcr', () => {
  it('forces OCR for the default docling-fast scan backend', () => {
    expect(
      shouldForceOdlHybridOcr({
        enabled: true,
        backend: 'docling-fast',
        url: 'http://localhost:5002',
        mode: 'full',
        hancomAiOcrStrategy: 'auto',
      }),
    ).toBe(true)
  })
})
