import { describe, expect, it } from 'vitest'
import {
  DOCUMENT_FIT_FONT_MAX,
  DOCUMENT_FIT_LINE_MAX,
  DOCUMENT_PAGE_FIT_RESET,
  resolveDocumentPageFit,
  resolveDocumentPageFitScale,
  scaleDocumentPageFitForBox,
  splitDocumentPageFitMarkdown,
  writeDocumentPageFitMarkdown,
} from './document-page-fit'

describe('document page fit', () => {
  it('keeps a fixed type for every page', () => {
    expect(resolveDocumentPageFit(400, 800)).toEqual({
      fontSize: DOCUMENT_FIT_FONT_MAX,
      lineHeight: DOCUMENT_FIT_LINE_MAX,
      padding: DOCUMENT_PAGE_FIT_RESET.padding,
    })
    expect(resolveDocumentPageFit(1600, 800)).toEqual({
      fontSize: DOCUMENT_FIT_FONT_MAX,
      lineHeight: DOCUMENT_FIT_LINE_MAX,
      padding: DOCUMENT_PAGE_FIT_RESET.padding,
    })
    expect(resolveDocumentPageFitScale(400, 800)).toBe(1)
  })

  it('uses one uniform scale when the page overflows', () => {
    expect(resolveDocumentPageFitScale(1200, 800)).toBeCloseTo(800 / 1200, 5)
    expect(resolveDocumentPageFitScale(2000, 800)).toBe(0.5)
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

  it('keeps the fixed type and only rescales when the window page box changes', () => {
    const scaled = scaleDocumentPageFitForBox(
      {
        fontSize: DOCUMENT_FIT_FONT_MAX,
        lineHeight: DOCUMENT_FIT_LINE_MAX,
        padding: DOCUMENT_PAGE_FIT_RESET.padding,
        scale: 0.8,
        boxWidth: 400,
        boxHeight: 600,
      },
      800,
      1200,
    )
    expect(scaled.fontSize).toBe(DOCUMENT_FIT_FONT_MAX)
    expect(scaled.lineHeight).toBe(DOCUMENT_FIT_LINE_MAX)
    expect(scaled.padding).toBe(DOCUMENT_PAGE_FIT_RESET.padding)
    expect(scaled.scale).toBeCloseTo(1.5, 5)
  })
})
