import { describe, expect, it } from 'vitest'
import {
  PDF_PREVIEW_MAX_RENDER_WIDTH,
  PDF_PREVIEW_PREFETCH_AHEAD,
  PDF_PREVIEW_WARM_RADIUS,
  resolvePdfPreviewActive,
  resolvePdfPreviewDirection,
  resolvePdfPreviewFetchPages,
  resolvePdfPreviewPriority,
  resolvePdfPreviewFastWidth,
  resolvePdfPreviewRenderWidth,
  resolvePdfPreviewSharpWidth,
  resolveParseBodyAttachFlags,
  shouldAttachSavedSnapshotBody,
} from './document-page-preview-policy'

describe('document-page-preview-policy', () => {
  it('loads the current page and window neighbors before the first JPEG is ready', () => {
    expect(
      resolvePdfPreviewActive({
        pageNumber: 1,
        currentPage: 1,
        readyPage: null,
        totalPages: 20,
        direction: 1,
      }),
    ).toBe(true)
    expect(
      resolvePdfPreviewActive({
        pageNumber: 2,
        currentPage: 1,
        readyPage: null,
        totalPages: 20,
        direction: 1,
      }),
    ).toBe(true)
    expect(
      resolvePdfPreviewFetchPages({
        currentPage: 4,
        totalPages: 20,
        readyPage: null,
        direction: 1,
      }),
    ).toEqual([
      { pageNumber: 4, priority: 'visible' },
      { pageNumber: 5, priority: 'prefetch' },
      { pageNumber: 6, priority: 'prefetch' },
      { pageNumber: 7, priority: 'prefetch' },
      { pageNumber: 8, priority: 'prefetch' },
      { pageNumber: 9, priority: 'prefetch' },
      { pageNumber: 10, priority: 'prefetch' },
      { pageNumber: 11, priority: 'prefetch' },
      { pageNumber: 12, priority: 'prefetch' },
      { pageNumber: 3, priority: 'prefetch' },
      { pageNumber: 2, priority: 'prefetch' },
    ])
  })

  it('prefetches both neighbors after the current page is ready', () => {
    expect(
      resolvePdfPreviewActive({
        pageNumber: 2,
        currentPage: 1,
        readyPage: 1,
        totalPages: 20,
        direction: 1,
      }),
    ).toBe(true)
    expect(
      resolvePdfPreviewActive({
        pageNumber: 6,
        currentPage: 7,
        readyPage: 7,
        totalPages: 20,
        direction: 1,
      }),
    ).toBe(true)
    expect(
      resolvePdfPreviewActive({
        pageNumber: 8,
        currentPage: 7,
        readyPage: 7,
        totalPages: 20,
        direction: 1,
      }),
    ).toBe(true)
    expect(
      resolvePdfPreviewActive({
        pageNumber: 3,
        currentPage: 1,
        readyPage: 1,
        totalPages: 20,
        direction: 1,
      }),
    ).toBe(false)
  })

  it('uses the same lookahead on first open and while paging', () => {
    expect(
      resolvePdfPreviewFetchPages({
        currentPage: 1,
        totalPages: 48,
        readyPage: null,
        direction: 1,
      }).map((item) => item.pageNumber),
    ).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(
      resolvePdfPreviewFetchPages({
        currentPage: 10,
        totalPages: 30,
        readyPage: 10,
        direction: 1,
        extent: 'far',
      }).map((item) => item.pageNumber),
    ).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 9, 8])
    expect(
      resolvePdfPreviewFetchPages({
        currentPage: 10,
        totalPages: 30,
        readyPage: 10,
        direction: -1,
        extent: 'near',
      }).map((item) => item.pageNumber),
    ).toEqual([10, 9, 8, 7, 6, 5, 4, 3, 2, 11, 12])
  })

  it('prefetches eight pages ahead on first open and while paging', () => {
    expect(PDF_PREVIEW_PREFETCH_AHEAD).toBe(8)
    const first = resolvePdfPreviewFetchPages({
      currentPage: 1,
      totalPages: 48,
      readyPage: 1,
      direction: 1,
    }).map((item) => item.pageNumber)
    const later = resolvePdfPreviewFetchPages({
      currentPage: 8,
      totalPages: 48,
      readyPage: 8,
      direction: 1,
    }).map((item) => item.pageNumber)
    expect(first).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(later).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16, 7, 6])
    expect(first.length).toBeLessThanOrEqual(later.length)
  })

  it('prefetches the previous page when scrolling up', () => {
    expect(resolvePdfPreviewDirection(8, 7)).toBe(-1)
    expect(
      resolvePdfPreviewActive({
        pageNumber: 6,
        currentPage: 7,
        readyPage: 7,
        totalPages: 20,
        direction: -1,
      }),
    ).toBe(true)
  })

  it('marks the current page as the visible render', () => {
    expect(resolvePdfPreviewPriority(4, 4)).toBe('visible')
    expect(resolvePdfPreviewPriority(5, 4)).toBe('prefetch')
  })

  it('caps preview raster size', () => {
    expect(resolvePdfPreviewRenderWidth(0)).toBe(0)
    expect(resolvePdfPreviewRenderWidth(800)).toBe(resolvePdfPreviewSharpWidth(800))
    expect(resolvePdfPreviewRenderWidth(1400)).toBe(resolvePdfPreviewSharpWidth(1400))
    expect(resolvePdfPreviewFastWidth(800)).toBe(800)
    expect(resolvePdfPreviewFastWidth(1400)).toBe(1000)
    expect(resolvePdfPreviewSharpWidth(800)).toBeGreaterThanOrEqual(800)
    expect(resolvePdfPreviewSharpWidth(800)).toBeLessThanOrEqual(PDF_PREVIEW_MAX_RENDER_WIDTH)
    expect(resolvePdfPreviewSharpWidth(3000)).toBe(PDF_PREVIEW_MAX_RENDER_WIDTH)
  })

  it('keeps the hidden decode pool small enough to scroll past page 14', () => {
    expect(PDF_PREVIEW_WARM_RADIUS).toBeLessThanOrEqual(3)
  })

  it('keeps saved parse bodies off a PDF until the current preview is unlocked', () => {
    expect(shouldAttachSavedSnapshotBody(true, false)).toBe(false)
    expect(shouldAttachSavedSnapshotBody(true, true)).toBe(true)
    expect(shouldAttachSavedSnapshotBody(false, false)).toBe(true)
  })

  it('attaches saved bodies on every windowed page so the next page is not blank', () => {
    expect(
      resolveParseBodyAttachFlags({
        isPdf: true,
        pageNumber: 1,
        currentPage: 2,
        startPage: 1,
        endPage: 3,
      }),
    ).toEqual({ attachPlain: true, attachRich: true })
    expect(
      resolveParseBodyAttachFlags({
        isPdf: true,
        pageNumber: 3,
        currentPage: 2,
        startPage: 1,
        endPage: 3,
      }),
    ).toEqual({ attachPlain: true, attachRich: true })
    expect(
      resolveParseBodyAttachFlags({
        isPdf: true,
        pageNumber: 4,
        currentPage: 2,
        startPage: 1,
        endPage: 3,
      }),
    ).toEqual({ attachPlain: false, attachRich: false })
    expect(
      resolveParseBodyAttachFlags({
        isPdf: false,
        pageNumber: 3,
        currentPage: 1,
      }),
    ).toEqual({ attachPlain: true, attachRich: true })
  })
})
