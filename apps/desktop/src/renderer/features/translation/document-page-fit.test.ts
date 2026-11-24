import { describe, expect, it } from 'vitest'
import {
  DOCUMENT_FIT_FONT_MAX,
  DOCUMENT_FIT_FONT_MIN,
  DOCUMENT_FIT_LINE_MAX,
  DOCUMENT_FIT_LINE_MIN,
  DOCUMENT_FIT_TABLE_FONT_MAX,
  DOCUMENT_FIT_TABLE_FONT_MIN,
  DOCUMENT_PAGE_FIT_RESET,
  DOCUMENT_PAGE_FIT_TABLE_CAPS,
  canReuseDocumentPageFit,
  isNegligibleDocumentFitBoxChange,
  isSameDocumentPageFit,
  resolveDocumentPageFit,
  resolveDocumentPageFitCapsForWidth,
  resolveDocumentPageFitScale,
  scaleDocumentPageFitForBox,
  splitDocumentPageFitMarkdown,
  tightenDocumentPageFit,
  writeDocumentPageFitMarkdown,
} from './document-page-fit'

describe('document page fit', () => {
  it('keeps full 字号 and 行距 when the text already fits the page', () => {
    expect(resolveDocumentPageFit(400, 800)).toEqual({
      fontSize: DOCUMENT_FIT_FONT_MAX,
      lineHeight: DOCUMENT_FIT_LINE_MAX,
      padding: DOCUMENT_PAGE_FIT_RESET.padding,
    })
    expect(resolveDocumentPageFitScale(400, 800)).toBe(1)
  })

  it('shrinks 字号 and 行距 when the text is taller than the page', () => {
    const fitted = resolveDocumentPageFit(1600, 800)
    expect(fitted.fontSize).toBeLessThan(DOCUMENT_FIT_FONT_MAX)
    expect(fitted.fontSize).toBeGreaterThanOrEqual(DOCUMENT_FIT_FONT_MIN)
    expect(fitted.lineHeight).toBeLessThanOrEqual(DOCUMENT_FIT_LINE_MAX)
    expect(fitted.lineHeight).toBeGreaterThanOrEqual(DOCUMENT_FIT_LINE_MIN)
  })

  it('keeps 行距 near English body leading instead of collapsing to the floor', () => {
    const fitted = resolveDocumentPageFit(1600, 800)
    expect(fitted.lineHeight).toBeGreaterThanOrEqual(DOCUMENT_FIT_LINE_MIN)
    expect(fitted.fontSize).toBeGreaterThanOrEqual(DOCUMENT_FIT_FONT_MIN)
  })

  it('tightens from the current type instead of jumping back to the max', () => {
    const current = resolveDocumentPageFit(1600, 800)
    const tighter = tightenDocumentPageFit(current, 1100, 800)
    expect(tighter.fontSize).toBeLessThanOrEqual(current.fontSize)
    expect(tighter.lineHeight).toBeLessThanOrEqual(current.lineHeight)
  })

  it('uses only two 字号 caps: default window vs maximized', () => {
    const defaultA = resolveDocumentPageFitCapsForWidth(400)
    const defaultB = resolveDocumentPageFitCapsForWidth(600)
    const maximized = resolveDocumentPageFitCapsForWidth(760)
    expect(defaultA).toEqual(defaultB)
    expect(defaultA.fontMax).toBe(DOCUMENT_FIT_FONT_MAX)
    expect(defaultA.fontMin).toBe(DOCUMENT_FIT_FONT_MIN)
    expect(maximized.fontMax).toBe(DOCUMENT_FIT_FONT_MAX + 2)
    expect(maximized.fontMin).toBe(DOCUMENT_FIT_FONT_MIN + 1)
    expect(maximized.fontMax).toBeGreaterThan(defaultA.fontMax)
  })

  it('caps parsed tables at 12px so a full grid can still fit the page', () => {
    expect(resolveDocumentPageFit(400, 800, DOCUMENT_PAGE_FIT_TABLE_CAPS).fontSize).toBe(
      DOCUMENT_FIT_TABLE_FONT_MAX,
    )
    const fitted = resolveDocumentPageFit(1600, 800, DOCUMENT_PAGE_FIT_TABLE_CAPS)
    expect(fitted.fontSize).toBeLessThanOrEqual(DOCUMENT_FIT_TABLE_FONT_MAX)
    expect(fitted.fontSize).toBeGreaterThanOrEqual(DOCUMENT_FIT_TABLE_FONT_MIN)
  })

  it('applies mild scale only when content nearly fits; otherwise keeps 1 for scroll', () => {
    expect(resolveDocumentPageFitScale(800, 800)).toBe(1)
    expect(resolveDocumentPageFitScale(900, 800)).toBeCloseTo(800 / 900, 2)
    expect(resolveDocumentPageFitScale(1600, 800)).toBe(1)
  })

  it('rejects saved fits that crushed below the readable scale floor', () => {
    const saved = {
      fontSize: 12,
      lineHeight: 1.35,
      padding: 10,
      scale: 0.5,
      boxWidth: 400,
      boxHeight: 600,
    }
    expect(canReuseDocumentPageFit(saved, 400, 600)).toBe(false)
  })

  it('writes type settings into Markdown and reads them back', () => {
    const markdown = writeDocumentPageFitMarkdown('# Title\n\nHello', {
      fontSize: 11,
      lineHeight: 1.4,
      padding: 10,
      scale: 0.85,
      boxWidth: 520,
      boxHeight: 734,
    })
    expect(markdown).toContain('<!-- tm-doc-fit')
    expect(markdown).toContain('# Title')
    const parsed = splitDocumentPageFitMarkdown(markdown)
    expect(parsed.body).toBe('# Title\n\nHello')
    expect(parsed.fit).toEqual({
      fontSize: 11,
      lineHeight: 1.4,
      padding: 10,
      scale: 0.85,
      boxWidth: 520,
      boxHeight: 734,
    })
  })

  it('steps 字号 once when crossing default → maximized', () => {
    const scaled = scaleDocumentPageFitForBox(
      {
        fontSize: 13,
        lineHeight: 1.4,
        padding: 10,
        scale: 1,
        boxWidth: 400,
        boxHeight: 600,
      },
      800,
      1200,
    )
    expect(scaled.fontSize).toBeGreaterThan(13)
    expect(scaled.fontSize).toBeLessThanOrEqual(DOCUMENT_FIT_FONT_MAX + 2)
    expect(scaled.lineHeight).toBe(1.4)
    expect(scaled.scale).toBe(1)
  })

  it('keeps 字号 for width changes inside the same window bucket', () => {
    const scaled = scaleDocumentPageFitForBox(
      {
        fontSize: 13,
        lineHeight: 1.4,
        padding: 10,
        scale: 1,
        boxWidth: 400,
        boxHeight: 600,
      },
      560,
      610,
    )
    expect(scaled.fontSize).toBe(13)
  })

  it('ignores sub-pixel page-box noise so fit does not loop', () => {
    expect(
      isNegligibleDocumentFitBoxChange({ boxWidth: 400, boxHeight: 600 }, 401, 599),
    ).toBe(true)
    expect(
      isNegligibleDocumentFitBoxChange({ boxWidth: 400, boxHeight: 600 }, 420, 600),
    ).toBe(false)
  })

  it('reuses a saved fit within the same window bucket', () => {
    const saved = {
      fontSize: 12,
      lineHeight: 1.35,
      padding: 10,
      scale: 1,
      boxWidth: 400,
      boxHeight: 600,
    }
    expect(canReuseDocumentPageFit(saved, 401, 599, DOCUMENT_PAGE_FIT_TABLE_CAPS)).toBe(true)
    expect(canReuseDocumentPageFit(saved, 560, 600, DOCUMENT_PAGE_FIT_TABLE_CAPS)).toBe(true)
    expect(canReuseDocumentPageFit({ ...saved, fontSize: 18 }, 400, 600, DOCUMENT_PAGE_FIT_TABLE_CAPS)).toBe(
      false,
    )
    expect(canReuseDocumentPageFit(saved, 720, 600, DOCUMENT_PAGE_FIT_TABLE_CAPS)).toBe(false)
  })

  it('treats nearby fit measurements as the same record', () => {
    expect(
      isSameDocumentPageFit(
        { fontSize: 10, lineHeight: 1.4, padding: 10, scale: 0.8, boxWidth: 400, boxHeight: 600 },
        { fontSize: 10.1, lineHeight: 1.41, padding: 10, scale: 0.804, boxWidth: 401, boxHeight: 599 },
      ),
    ).toBe(true)
    expect(
      isSameDocumentPageFit(
        { fontSize: 10, lineHeight: 1.4, padding: 10, scale: 0.8, boxWidth: 400, boxHeight: 600 },
        { fontSize: 8, lineHeight: 1.4, padding: 10, scale: 0.8, boxWidth: 400, boxHeight: 600 },
      ),
    ).toBe(false)
  })
})
