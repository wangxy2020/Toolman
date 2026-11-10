/** Settled current page: Retina-sharp without oversized GPU allocations. */
export const PDF_VIEWER_MAX_BACKING_WIDTH = 2560
export const PDF_VIEWER_MAX_DPR = 2
/** Neighbor / in-scroll pages: cheaper paint while keeping layout stable. */
export const PDF_VIEWER_PREVIEW_BACKING_WIDTH = 1400
export const PDF_VIEWER_PREVIEW_DPR = 1.25
export const PDF_VIEWER_PAGE_BATCH = 10
/** Current sharp + one neighbor preview can paint without serializing every flip. */
export const PDF_VIEWER_RENDER_CONCURRENCY = 2
/** Keep recently painted pages so scrolling back does not blank-reload. */
export const PDF_VIEWER_PAINT_CACHE_LIMIT = 48
/** Local/range reads: larger chunks cut round-trips while paging. */
export const PDF_VIEWER_RANGE_CHUNK_SIZE = 262_144

export type PdfViewerPaintQuality = 'sharp' | 'preview'

export function decodeBase64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

export function resolvePdfViewerBackingWidth(
  cssWidth: number,
  devicePixelRatio: number,
  quality: PdfViewerPaintQuality = 'sharp',
): number {
  if (cssWidth <= 0) return 0
  const maxDpr = quality === 'sharp' ? PDF_VIEWER_MAX_DPR : PDF_VIEWER_PREVIEW_DPR
  const maxWidth = quality === 'sharp' ? PDF_VIEWER_MAX_BACKING_WIDTH : PDF_VIEWER_PREVIEW_BACKING_WIDTH
  const dpr = Math.min(maxDpr, Math.max(1, devicePixelRatio || 1))
  return Math.min(maxWidth, Math.max(1, Math.round(cssWidth * dpr)))
}

export function resolvePdfViewerPaintQuality(
  pageNumber: number,
  currentPage: number,
  options?: { allowSharp?: boolean },
): PdfViewerPaintQuality {
  if (options?.allowSharp === false) return 'preview'
  return pageNumber === currentPage ? 'sharp' : 'preview'
}

/**
 * Avoid abort/repaint storms on every currentPage tick.
 * Keep an existing bitmap; only schedule first paint or preview→sharp when settled.
 */
export function shouldSchedulePdfPagePaint(options: {
  active: boolean
  painted: boolean
  paintedQuality: PdfViewerPaintQuality | null
  pageNumber: number
  currentPage: number
  allowSharp?: boolean
}): boolean {
  if (!options.active) return false
  if (!options.painted || !options.paintedQuality) return true
  const want = resolvePdfViewerPaintQuality(options.pageNumber, options.currentPage, {
    allowSharp: options.allowSharp,
  })
  return want === 'sharp' && options.paintedQuality !== 'sharp'
}

export function pdfViewerPaintCacheKey(filePath: string, pageNumber: number, cssWidth: number): string {
  return `${filePath}::${pageNumber}::${Math.round(cssWidth)}`
}

export function resolvePdfPageViewportScale(pageWidth: number, backingWidth: number): number {
  return Math.max(0.1, backingWidth / Math.max(1, pageWidth))
}

export function joinPdfjsAssetUrl(schemeHost: string, subdir: string): string {
  const trimmed = subdir.replace(/^\/+|\/+$/g, '')
  return `${schemeHost.replace(/\/+$/, '')}/${trimmed}/`
}

export function resolvePdfjsAssetUrl(subdir: string): string {
  return joinPdfjsAssetUrl('toolman-pdfjs://bundle', subdir)
}

export function pdfjsDocumentUrl(filePath: string): string {
  return `toolman-pdfjs://doc/pdf?path=${encodeURIComponent(filePath)}`
}

export function parseContentRangeSize(header: string | null): number | null {
  const match = /\/(\d+)\s*$/.exec(header ?? '')
  if (!match) return null
  const size = Number(match[1])
  return Number.isInteger(size) && size > 0 ? size : null
}

export function resolvePdfViewerRenderPriority(pageNumber: number, currentPage: number): number {
  if (pageNumber === currentPage) return 0
  return Math.abs(pageNumber - currentPage)
}

export function isPdfViewerRenderCancelled(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const name = 'name' in error ? String((error as { name?: unknown }).name ?? '') : ''
  return (
    name === 'RenderingCancelledException' ||
    name === 'AbortException' ||
    (error instanceof DOMException && error.name === 'AbortError')
  )
}
