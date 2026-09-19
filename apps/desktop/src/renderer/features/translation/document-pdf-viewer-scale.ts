export const PDF_VIEWER_MAX_BACKING_WIDTH = 3200
export const PDF_VIEWER_MAX_DPR = 3
export const PDF_VIEWER_PAGE_BATCH = 10
export const PDF_VIEWER_RENDER_CONCURRENCY = 1

export function decodeBase64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

export function resolvePdfViewerBackingWidth(cssWidth: number, devicePixelRatio: number): number {
  if (cssWidth <= 0) return 0
  const dpr = Math.min(PDF_VIEWER_MAX_DPR, Math.max(1, devicePixelRatio || 1))
  return Math.min(PDF_VIEWER_MAX_BACKING_WIDTH, Math.max(1, Math.round(cssWidth * dpr)))
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
