import { describe, expect, it } from 'vitest'
import { resolveRendererPdfPaintScale } from './pdf-renderer-scale'

describe('resolveRendererPdfPaintScale', () => {
  it('paints the focused page at full device pixels', () => {
    const scale = resolveRendererPdfPaintScale({
      pageWidthPt: 612,
      cssWidth: 612,
      focused: true,
    })
    expect(scale).toBeGreaterThanOrEqual(1)
  })

  it('uses a lighter scale for neighbor prefetch', () => {
    const focused = resolveRendererPdfPaintScale({
      pageWidthPt: 612,
      cssWidth: 800,
      focused: true,
    })
    const neighbor = resolveRendererPdfPaintScale({
      pageWidthPt: 612,
      cssWidth: 800,
      focused: false,
    })
    expect(neighbor).toBeLessThanOrEqual(focused)
  })
})
