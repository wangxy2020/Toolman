import { afterEach, describe, expect, it } from 'vitest'
import {
  clearSharedDocumentPageFits,
  medianFontSize,
  reportDocumentPageNaturalFit,
  getSharedDocumentPageFit,
  styleForSharedFontSize,
} from './document-page-fit-shared'
import { DOCUMENT_FIT_FONT_MIN, DOCUMENT_FIT_FONT_MAX } from './document-page-fit'

describe('document page fit shared', () => {
  afterEach(() => {
    clearSharedDocumentPageFits('doc-a')
  })

  it('computes a median 字号', () => {
    expect(medianFontSize([12, 15, 13])).toBe(13)
    expect(medianFontSize([12, 14])).toBe(13)
    expect(medianFontSize([])).toBeNull()
  })

  it('builds a document shared style from page samples', () => {
    reportDocumentPageNaturalFit({
      documentId: 'doc-a',
      pageNumber: 1,
      kind: 'prose',
      fontSize: 15,
    })
    reportDocumentPageNaturalFit({
      documentId: 'doc-a',
      pageNumber: 2,
      kind: 'prose',
      fontSize: 12,
    })
    reportDocumentPageNaturalFit({
      documentId: 'doc-a',
      pageNumber: 3,
      kind: 'prose',
      fontSize: 13,
    })
    const shared = getSharedDocumentPageFit('doc-a', 'prose')
    expect(shared?.fontSize).toBe(13)
    expect(shared?.fontSize).toBeGreaterThanOrEqual(DOCUMENT_FIT_FONT_MIN)
    expect(shared?.fontSize).toBeLessThanOrEqual(DOCUMENT_FIT_FONT_MAX)
  })

  it('blends line height between caps for a shared 字号', () => {
    const low = styleForSharedFontSize(DOCUMENT_FIT_FONT_MIN)
    const high = styleForSharedFontSize(DOCUMENT_FIT_FONT_MAX)
    expect(low.fontSize).toBe(DOCUMENT_FIT_FONT_MIN)
    expect(high.fontSize).toBe(DOCUMENT_FIT_FONT_MAX)
    expect(high.lineHeight).toBeGreaterThanOrEqual(low.lineHeight)
  })
})
