import { describe, expect, it } from 'vitest'
import {
  documentWindowSpacers,
  documentWindowSpacersFromHeights,
  estimateDocumentRowHeight,
  offsetToPage,
  pageFromMeasuredScrollTop,
  pageFromScrollTop,
  resolveDocumentPageWindow,
  resolveMeasuredRowHeight,
  topSpacerScrollAdjustment,
} from './document-page-window'

describe('document-page-window', () => {
  it('keeps a small window around the current page', () => {
    expect(resolveDocumentPageWindow(1, 40)).toEqual({ startPage: 1, endPage: 2 })
    expect(resolveDocumentPageWindow(10, 40)).toEqual({ startPage: 9, endPage: 11 })
    expect(resolveDocumentPageWindow(40, 40)).toEqual({ startPage: 39, endPage: 40 })
  })

  it('maps scroll offset to a page number', () => {
    expect(pageFromScrollTop(0, 800, 20)).toBe(1)
    expect(pageFromScrollTop(800, 800, 20)).toBe(2)
    expect(pageFromScrollTop(10_000, 800, 20)).toBe(13)
  })

  it('maps scroll offset with measured row heights', () => {
    const heights = [2200, 1800, 2400]
    const getRowHeight = (page: number) => heights[page - 1] ?? 2000
    expect(pageFromMeasuredScrollTop(0, 20, getRowHeight)).toBe(1)
    expect(pageFromMeasuredScrollTop(2199, 20, getRowHeight)).toBe(1)
    expect(pageFromMeasuredScrollTop(2200, 20, getRowHeight)).toBe(2)
    expect(pageFromMeasuredScrollTop(4000, 20, getRowHeight)).toBe(3)
  })

  it('does not treat a tall parsed page as several PDF-sized pages', () => {
    const getRowHeight = (page: number) => (page === 1 ? 2400 : 800)
    expect(pageFromMeasuredScrollTop(1500, 20, getRowHeight)).toBe(1)
    expect(pageFromScrollTop(1500, 800, 20)).toBe(2)
  })

  it('reserves spacer height for unmounted pages', () => {
    expect(documentWindowSpacers(9, 11, 40, 700)).toEqual({
      top: 8 * 700,
      bottom: 29 * 700,
    })
  })

  it('reserves spacers from measured heights', () => {
    const getRowHeight = (page: number) => (page <= 2 ? 2000 : 900)
    expect(documentWindowSpacersFromHeights(3, 5, 8, getRowHeight)).toEqual({
      top: 4000,
      bottom: 2700,
    })
  })

  it('uses the average measured height for pages not yet mounted', () => {
    const measured = new Map([
      [1, 2000],
      [2, 2200],
    ])
    expect(resolveMeasuredRowHeight(1, measured, 700)).toBe(2000)
    expect(resolveMeasuredRowHeight(8, measured, 700)).toBe(2100)
    expect(resolveMeasuredRowHeight(1, new Map(), 700)).toBe(700)
  })

  it('computes the scroll offset of a page', () => {
    const getRowHeight = (page: number) => (page === 1 ? 2000 : 900)
    expect(offsetToPage(1, getRowHeight)).toBe(0)
    expect(offsetToPage(3, getRowHeight)).toBe(2900)
  })

  it('estimates row height from the PDF pane aspect', () => {
    expect(estimateDocumentRowHeight(400, 792 / 612)).toBeGreaterThan(500)
  })

  it('does not shift scroll when the window moves a page into the top spacer', () => {
    expect(topSpacerScrollAdjustment(true, 700, 1400)).toBe(0)
    expect(topSpacerScrollAdjustment(true, 1400, 700)).toBe(0)
  })

  it('shifts scroll only when already-unmounted row heights change', () => {
    expect(topSpacerScrollAdjustment(false, 1400, 1600)).toBe(200)
    expect(topSpacerScrollAdjustment(false, 0, 1400)).toBe(0)
    expect(topSpacerScrollAdjustment(false, 1400, 1400)).toBe(0)
  })
})
