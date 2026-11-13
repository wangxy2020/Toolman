/**
 * Progressive left-pane PDF preview policy (IMA-like).
 *
 * Landed-page first: fling past unloaded pages → stop on N → only N is required.
 * Flow on settle: N immediate/readable (≥720) → N sharp (≤1440) → neighbor
 * readable prefetch. Soft-cancel drops other pages without killing the preview
 * worker / pdf.js document cache.
 */

export type PdfPreviewDirection = 1 | -1
export const PDF_PREVIEW_NEAR_AHEAD = 1
export const PDF_PREVIEW_PREFETCH_AHEAD = 1
export const PDF_PREVIEW_PREFETCH_BEHIND = 0
export const PDF_PREVIEW_ACTIVE_RADIUS = 1
/** First paint = readable frame (text + scan). */
export const PDF_PREVIEW_FAST_MAX_WIDTH = 720
/** Settled / focused upgrade (device pixels). */
export const PDF_PREVIEW_MAX_RENDER_WIDTH = 1440
export const PDF_PREVIEW_MAX_DPR = 2
export const PDF_PREVIEW_SHARP_MIN_BOOST = 1.75
/** Wait before sharp so neighbor prefetch can claim the worker first. */
export const PDF_PREVIEW_SHARP_DELAY_MS = 280
export type PdfPreviewPrefetchExtent = 'none' | 'near' | 'far'

function bucketPreviewWidth(width: number): number {
  return Math.max(160, Math.round(width / 8) * 8)
}

export function resolvePdfPreviewFastWidth(displayWidth: number): number {
  if (displayWidth <= 0) return 0
  return bucketPreviewWidth(
    Math.min(PDF_PREVIEW_FAST_MAX_WIDTH, Math.max(240, Math.round(displayWidth))),
  )
}

export function resolvePdfPreviewSharpWidth(displayWidth: number): number {
  if (displayWidth <= 0) return 0
  const dpr =
    typeof window !== 'undefined'
      ? Math.min(PDF_PREVIEW_MAX_DPR, Math.max(1, window.devicePixelRatio || 1))
      : 2
  const fast = resolvePdfPreviewFastWidth(displayWidth)
  const ideal = Math.round(displayWidth * dpr)
  const boosted = Math.round(fast * PDF_PREVIEW_SHARP_MIN_BOOST)
  return bucketPreviewWidth(
    Math.min(PDF_PREVIEW_MAX_RENDER_WIDTH, Math.max(fast + 200, ideal, boosted)),
  )
}

export function resolvePdfPreviewDirection(previousPage: number, currentPage: number): PdfPreviewDirection {
  return currentPage < previousPage ? -1 : 1
}

export function resolvePdfPreviewActive(options: {
  pageNumber: number
  currentPage: number
  readyPage: number | null
  totalPages: number
  direction: PdfPreviewDirection
  radius?: number
}): boolean {
  const current = Math.max(1, Math.floor(options.currentPage) || 1)
  const pageNumber = Math.max(1, Math.floor(options.pageNumber) || 1)
  const total = Math.max(1, Math.floor(options.totalPages) || 1)
  const radius = Math.max(0, Math.floor(options.radius ?? PDF_PREVIEW_ACTIVE_RADIUS) || 0)
  if (pageNumber < 1 || pageNumber > total) return false
  return Math.abs(pageNumber - current) <= radius
}

export function resolvePdfPreviewPriority(pageNumber: number, currentPage: number): 'visible' | 'prefetch' {
  return pageNumber === currentPage ? 'visible' : 'prefetch'
}

export type ParseBodyAttachFlags = {
  attachPlain: boolean
  attachRich: boolean
}

export function resolveParseBodyAttachFlags(options: {
  isPdf: boolean
  pageNumber: number
  currentPage: number
  startPage?: number
  endPage?: number
}): ParseBodyAttachFlags {
  if (!options.isPdf) return { attachPlain: true, attachRich: true }
  const start = Math.max(1, Math.floor(options.startPage ?? options.currentPage) || 1)
  const end = Math.max(start, Math.floor(options.endPage ?? options.currentPage) || start)
  if (options.pageNumber < start || options.pageNumber > end) {
    return { attachPlain: false, attachRich: false }
  }
  return { attachPlain: true, attachRich: true }
}

export function resolvePdfPreviewFetchDeltas(
  direction: PdfPreviewDirection,
  ahead = PDF_PREVIEW_NEAR_AHEAD,
  behind = PDF_PREVIEW_PREFETCH_BEHIND,
): number[] {
  const sign = direction < 0 ? -1 : 1
  const deltas: number[] = []
  for (let step = 1; step <= ahead; step += 1) deltas.push(sign * step)
  for (let step = 1; step <= behind; step += 1) deltas.push(-sign * step)
  return deltas
}

export function resolvePdfPreviewFetchPages(options: {
  currentPage: number
  totalPages: number
  readyPage: number | null
  direction: PdfPreviewDirection
  extent?: PdfPreviewPrefetchExtent
}): Array<{ pageNumber: number; priority: 'visible' | 'prefetch' }> {
  const total = Math.max(1, Math.floor(options.totalPages) || 1)
  const current = Math.max(1, Math.min(total, Math.floor(options.currentPage) || 1))
  const pages: Array<{ pageNumber: number; priority: 'visible' | 'prefetch' }> = [
    { pageNumber: current, priority: 'visible' },
  ]
  const ahead = PDF_PREVIEW_PREFETCH_AHEAD
  const behind = PDF_PREVIEW_PREFETCH_BEHIND
  const seen = new Set([current])
  for (const delta of resolvePdfPreviewFetchDeltas(options.direction, ahead, behind)) {
    const page = current + delta
    if (page < 1 || page > total || seen.has(page)) continue
    seen.add(page)
    pages.push({ pageNumber: page, priority: 'prefetch' })
  }
  return pages
}
