/** Visible page renders first; window neighbors start immediately at lower priority. */
export type PdfPreviewDirection = 1 | -1
/** Hidden decode pool around the current page — do not mount these as extra <img>s. */
export const PDF_PREVIEW_WARM_RADIUS = 3
/**
 * Same lookahead on first open and while paging so later pages stay warm.
 * Keep this uniform — a one-shot first-idle burst made page 8+ feel cold.
 */
export const PDF_PREVIEW_NEAR_AHEAD = 8
export const PDF_PREVIEW_PREFETCH_AHEAD = 8
export const PDF_PREVIEW_PREFETCH_BEHIND = 2
/** Fast 1x raster — kept for tests / optional low-cost prefetch. */
export const PDF_PREVIEW_FAST_MAX_WIDTH = 1000
/** Match the main-process preview cap so Retina panes are not downsampled twice. */
export const PDF_PREVIEW_MAX_RENDER_WIDTH = 2400
export const PDF_PREVIEW_MAX_DPR = 2
export type PdfPreviewPrefetchExtent = 'none' | 'near' | 'far'

export function resolvePdfPreviewFastWidth(displayWidth: number): number {
  if (displayWidth <= 0) return 0
  return Math.min(PDF_PREVIEW_FAST_MAX_WIDTH, Math.max(160, Math.round(displayWidth)))
}

export function resolvePdfPreviewSharpWidth(displayWidth: number): number {
  if (displayWidth <= 0) return 0
  const dpr =
    typeof window !== 'undefined'
      ? Math.min(PDF_PREVIEW_MAX_DPR, Math.max(1, window.devicePixelRatio || 1))
      : 1
  return Math.min(PDF_PREVIEW_MAX_RENDER_WIDTH, Math.max(160, Math.round(displayWidth * dpr)))
}

/** Visible and prefetch rasters use device pixels so the left PDF stays as sharp as the source. */
export function resolvePdfPreviewRenderWidth(displayWidth: number): number {
  return resolvePdfPreviewSharpWidth(displayWidth)
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
}): boolean {
  const current = Math.max(1, Math.floor(options.currentPage) || 1)
  const pageNumber = Math.max(1, Math.floor(options.pageNumber) || 1)
  const total = Math.max(1, Math.floor(options.totalPages) || 1)
  if (pageNumber < 1 || pageNumber > total) return false
  return Math.abs(pageNumber - current) <= 1
}

export function resolvePdfPreviewPriority(pageNumber: number, currentPage: number): 'visible' | 'prefetch' {
  return pageNumber === currentPage ? 'visible' : 'prefetch'
}

/** Windowed rows show saved parse/translation; height is not locked to the PDF. */
export function shouldAttachSavedSnapshotBody(isPdf: boolean, previewUnlocked: boolean): boolean {
  return !isPdf || previewUnlocked
}

export type ParseBodyAttachFlags = {
  attachPlain: boolean
  attachRich: boolean
}

/**
 * Every mounted window row gets its saved body. Waiting for the JPEG or the
 * current page only left neighbors as empty「已解析」cards.
 */
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
  const seen = new Set([current])
  for (const delta of resolvePdfPreviewFetchDeltas(options.direction, ahead)) {
    const page = current + delta
    if (page < 1 || page > total || seen.has(page)) continue
    seen.add(page)
    pages.push({ pageNumber: page, priority: 'prefetch' })
  }
  return pages
}
