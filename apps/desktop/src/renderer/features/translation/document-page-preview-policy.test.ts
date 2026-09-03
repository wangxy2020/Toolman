import { describe, expect, it } from 'vitest'
import {
  PDF_PREVIEW_WARM_RADIUS,
  resolvePdfPreviewActive,
  resolvePdfPreviewDirection,
  resolvePdfPreviewFetchPages,
  resolvePdfPreviewPriority,
  resolvePdfPreviewRenderWidth,
  shouldAttachSavedSnapshotBody,
} from './document-page-preview-policy'

describe('document-page-preview-policy', () => {
  it('only fetches the current page until that preview is ready', () => {
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
    ).toBe(false)
    expect(
      resolvePdfPreviewFetchPages({
        currentPage: 4,
        totalPages: 20,
        readyPage: null,
        direction: 1,
      }),
    ).toEqual([{ pageNumber: 4, priority: 'visible' }])
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

  it('prefetches farther pages in the scroll direction after the current page is ready', () => {
    expect(
      resolvePdfPreviewFetchPages({
        currentPage: 10,
        totalPages: 20,
        readyPage: 10,
        direction: 1,
      }).map((item) => item.pageNumber),
    ).toEqual([10, 9, 11, 12, 13])
    expect(
      resolvePdfPreviewFetchPages({
        currentPage: 10,
        totalPages: 20,
        readyPage: 10,
        direction: -1,
      }).map((item) => item.pageNumber),
    ).toEqual([10, 9, 11, 8, 7])
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
    expect(resolvePdfPreviewRenderWidth(800)).toBeLessThanOrEqual(960)
  })

  it('keeps the hidden decode pool small enough to scroll past page 14', () => {
    expect(PDF_PREVIEW_WARM_RADIUS).toBeLessThanOrEqual(3)
  })

  it('keeps saved parse bodies off a PDF until the current preview is unlocked', () => {
    expect(shouldAttachSavedSnapshotBody(true, false)).toBe(false)
    expect(shouldAttachSavedSnapshotBody(true, true)).toBe(true)
    expect(shouldAttachSavedSnapshotBody(false, false)).toBe(true)
  })
})
