import { describe, expect, it } from 'vitest'
import {
  PDF_PREVIEW_ACTIVE_RADIUS,
  PDF_PREVIEW_FAST_MAX_WIDTH,
  PDF_PREVIEW_IMMEDIATE_MAX_WIDTH,
  PDF_PREVIEW_MAX_RENDER_WIDTH,
  PDF_PREVIEW_PREFETCH_AHEAD,
  PDF_PREVIEW_PREFETCH_BEHIND,
  PDF_PREVIEW_WARM_RADIUS,
  resolvePdfPreviewActive,
  resolvePdfPreviewDirection,
  resolvePdfPreviewFetchPages,
  resolvePdfPreviewPriority,
  resolvePdfPreviewFastWidth,
  resolvePdfPreviewImmediateWidth,
  resolvePdfPreviewRenderWidth,
  resolvePdfPreviewSharpWidth,
  resolveParseBodyAttachFlags,
  shouldAttachSavedSnapshotBody,
} from './document-page-preview-policy'

describe('document-page-preview-policy', () => {
  it('activates current ±1 so page 2 can paint from cache while page 1 is focused', () => {
    expect(PDF_PREVIEW_ACTIVE_RADIUS).toBe(1)
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
      resolvePdfPreviewActive({
        pageNumber: 3,
        currentPage: 1,
        readyPage: null,
        totalPages: 20,
        direction: 1,
      }),
    ).toBe(false)
  })

  it('prefetches only one page ahead to keep scan rasters off the main-process queue', () => {
    expect(PDF_PREVIEW_PREFETCH_AHEAD).toBe(1)
    expect(PDF_PREVIEW_PREFETCH_BEHIND).toBe(0)
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
    ])
  })

  it('keeps the same lookahead shape on first open and while paging', () => {
    expect(
      resolvePdfPreviewFetchPages({
        currentPage: 1,
        totalPages: 48,
        readyPage: null,
        direction: 1,
      }).map((item) => item.pageNumber),
    ).toEqual([1, 2])
    expect(
      resolvePdfPreviewFetchPages({
        currentPage: 10,
        totalPages: 30,
        readyPage: 10,
        direction: 1,
        extent: 'far',
      }).map((item) => item.pageNumber),
    ).toEqual([10, 11])
    expect(
      resolvePdfPreviewFetchPages({
        currentPage: 10,
        totalPages: 30,
        readyPage: 10,
        direction: -1,
        extent: 'near',
      }).map((item) => item.pageNumber),
    ).toEqual([10, 9])
  })

  it('activates the previous neighbor when scrolling up', () => {
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

  it('uses immediate = readable ≥720 then sharp ≤1440', () => {
    expect(PDF_PREVIEW_IMMEDIATE_MAX_WIDTH).toBe(720)
    expect(PDF_PREVIEW_FAST_MAX_WIDTH).toBe(720)
    expect(PDF_PREVIEW_MAX_RENDER_WIDTH).toBe(1440)
    expect(resolvePdfPreviewRenderWidth(0)).toBe(0)
    expect(resolvePdfPreviewImmediateWidth(800)).toBe(720)
    expect(resolvePdfPreviewImmediateWidth(800)).toBe(resolvePdfPreviewFastWidth(800))
    expect(resolvePdfPreviewFastWidth(800)).toBe(720)
    expect(resolvePdfPreviewFastWidth(400)).toBe(400)
    expect(resolvePdfPreviewSharpWidth(400)).toBeGreaterThan(resolvePdfPreviewFastWidth(400))
    expect(resolvePdfPreviewSharpWidth(800)).toBeGreaterThan(resolvePdfPreviewFastWidth(800))
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

  it('keeps the same final layout for every mounted PDF window row', () => {
    expect(
      resolveParseBodyAttachFlags({
        isPdf: true,
        pageNumber: 2,
        currentPage: 2,
        startPage: 1,
        endPage: 5,
      }),
    ).toEqual({ attachPlain: true, attachRich: true })
    expect(
      resolveParseBodyAttachFlags({
        isPdf: true,
        pageNumber: 1,
        currentPage: 2,
        startPage: 1,
        endPage: 5,
      }),
    ).toEqual({ attachPlain: true, attachRich: true })
    expect(
      resolveParseBodyAttachFlags({
        isPdf: true,
        pageNumber: 5,
        currentPage: 2,
        startPage: 1,
        endPage: 5,
      }),
    ).toEqual({ attachPlain: true, attachRich: true })
    expect(
      resolveParseBodyAttachFlags({
        isPdf: true,
        pageNumber: 6,
        currentPage: 2,
        startPage: 1,
        endPage: 5,
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
