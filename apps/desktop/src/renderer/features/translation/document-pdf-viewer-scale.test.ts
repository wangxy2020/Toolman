import { describe, expect, it } from 'vitest'
import {
  decodeBase64ToUint8Array,
  isPdfViewerRenderCancelled,
  joinPdfjsAssetUrl,
  parseContentRangeSize,
  PDF_VIEWER_MAX_BACKING_WIDTH,
  pdfjsDocumentUrl,
  resolvePdfjsAssetUrl,
  resolvePdfPageViewportScale,
  resolvePdfViewerBackingWidth,
  resolvePdfViewerPaintQuality,
  resolvePdfViewerRenderPriority,
  shouldSchedulePdfPagePaint,
} from './document-pdf-viewer-scale'

describe('document-pdf-viewer-scale', () => {
  it('scales the backing store with DPR and caps GPU size', () => {
    expect(resolvePdfViewerBackingWidth(0, 2)).toBe(0)
    expect(resolvePdfViewerBackingWidth(800, 2)).toBe(1600)
    expect(resolvePdfViewerBackingWidth(2000, 3)).toBe(PDF_VIEWER_MAX_BACKING_WIDTH)
    expect(resolvePdfViewerBackingWidth(800, 3, 'preview')).toBe(1000)
    expect(resolvePdfPageViewportScale(612, 1224)).toBe(2)
    expect(resolvePdfPageViewportScale(0, 800)).toBe(800)
  })

  it('decodes the IPC base64 payload into PDF bytes', () => {
    const bytes = decodeBase64ToUint8Array(btoa('%PDF-1.4'))
    expect(Array.from(bytes)).toEqual(Array.from(new TextEncoder().encode('%PDF-1.4')))
  })

  it('points pdf.js assets at the privileged protocol', () => {
    expect(joinPdfjsAssetUrl('toolman-pdfjs://bundle', 'cmaps')).toBe('toolman-pdfjs://bundle/cmaps/')
    expect(resolvePdfjsAssetUrl('wasm')).toBe('toolman-pdfjs://bundle/wasm/')
  })

  it('treats cancelled paints as retries, not viewer failures', () => {
    expect(isPdfViewerRenderCancelled({ name: 'RenderingCancelledException' })).toBe(true)
    expect(isPdfViewerRenderCancelled(new DOMException('aborted', 'AbortError'))).toBe(true)
    expect(isPdfViewerRenderCancelled(new Error('corrupt'))).toBe(false)
  })

  it('paints the current page before neighbors', () => {
    expect(resolvePdfViewerRenderPriority(4, 4)).toBe(0)
    expect(resolvePdfViewerRenderPriority(5, 4)).toBeGreaterThan(0)
  })

  it('keeps sharp for the settled current page and preview while scrolling', () => {
    expect(resolvePdfViewerPaintQuality(4, 4)).toBe('sharp')
    expect(resolvePdfViewerPaintQuality(4, 4, { allowSharp: false })).toBe('preview')
    expect(resolvePdfViewerPaintQuality(5, 4, { allowSharp: true })).toBe('preview')
    expect(resolvePdfViewerBackingWidth(900, 2, 'sharp')).toBe(1800)
  })

  it('only reschedules paints for first draw or settled sharp upgrades', () => {
    expect(
      shouldSchedulePdfPagePaint({
        active: true,
        painted: false,
        paintedQuality: null,
        pageNumber: 3,
        currentPage: 3,
      }),
    ).toBe(true)
    expect(
      shouldSchedulePdfPagePaint({
        active: true,
        painted: true,
        paintedQuality: 'preview',
        pageNumber: 3,
        currentPage: 3,
        allowSharp: true,
      }),
    ).toBe(true)
    expect(
      shouldSchedulePdfPagePaint({
        active: true,
        painted: true,
        paintedQuality: 'preview',
        pageNumber: 3,
        currentPage: 3,
        allowSharp: false,
      }),
    ).toBe(false)
    expect(
      shouldSchedulePdfPagePaint({
        active: true,
        painted: true,
        paintedQuality: 'sharp',
        pageNumber: 3,
        currentPage: 3,
      }),
    ).toBe(false)
    expect(
      shouldSchedulePdfPagePaint({
        active: true,
        painted: true,
        paintedQuality: 'sharp',
        pageNumber: 3,
        currentPage: 4,
      }),
    ).toBe(false)
    expect(
      shouldSchedulePdfPagePaint({
        active: false,
        painted: false,
        paintedQuality: null,
        pageNumber: 3,
        currentPage: 3,
      }),
    ).toBe(false)
  })

  it('encodes the document protocol URL and reads Content-Range sizes', () => {
    expect(pdfjsDocumentUrl('/tmp/spec.pdf')).toBe('toolman-pdfjs://doc/pdf?path=%2Ftmp%2Fspec.pdf')
    expect(parseContentRangeSize('bytes 0-0/4096')).toBe(4096)
  })
})
