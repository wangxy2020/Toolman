import { describe, expect, it } from 'vitest'
import { DEFAULT_ODL_HYBRID_SETTINGS, normalizeOdlHybridSettings } from './odl-hybrid.js'

describe('normalizeOdlHybridSettings', () => {
  it('returns defaults for empty input', () => {
    expect(normalizeOdlHybridSettings()).toEqual(DEFAULT_ODL_HYBRID_SETTINGS)
  })

  it('preserves valid hybrid settings', () => {
    expect(
      normalizeOdlHybridSettings({
        enabled: true,
        backend: 'docling-fast',
        url: 'http://127.0.0.1:5002',
        mode: 'auto',
        hancomAiOcrStrategy: 'auto',
      }),
    ).toEqual({
      enabled: true,
      backend: 'docling-fast',
      url: 'http://127.0.0.1:5002',
      mode: 'auto',
      hancomAiOcrStrategy: 'auto',
    })
  })
})
