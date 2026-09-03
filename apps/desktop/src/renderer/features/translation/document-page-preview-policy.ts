/** Visible page always renders first; neighbors wait until the visible page is ready. */
export type PdfPreviewDirection = 1 | -1
/** Hidden decode pool around the current page — large ranges stall the UI after ~a dozen pages. */
export const PDF_PREVIEW_WARM_RADIUS = 3

export function resolvePdfPreviewRenderWidth(displayWidth: number): number {
  if (displayWidth <= 0) return 0
  const dpr =
    typeof window !== 'undefined' ? Math.min(1.25, Math.max(1, window.devicePixelRatio || 1)) : 1
  const bucket = Math.max(160, Math.round(displayWidth / 16) * 16)
  return Math.min(960, Math.round(bucket * dpr))
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
  if (pageNumber === current) return true
  if (options.readyPage !== current) return false
  const total = Math.max(1, Math.floor(options.totalPages) || 1)
  return (
    (pageNumber === current - 1 && current - 1 >= 1) ||
    (pageNumber === current + 1 && current + 1 <= total)
  )
}

export function resolvePdfPreviewPriority(pageNumber: number, currentPage: number): 'visible' | 'prefetch' {
  return pageNumber === currentPage ? 'visible' : 'prefetch'
}

/** Saved parse text is large; keep it off-screen until the current PDF preview can paint. */
export function shouldAttachSavedSnapshotBody(isPdf: boolean, previewUnlocked: boolean): boolean {
  return !isPdf || previewUnlocked
}

export function resolvePdfPreviewFetchPages(options: {
  currentPage: number
  totalPages: number
  readyPage: number | null
  direction: PdfPreviewDirection
}): Array<{ pageNumber: number; priority: 'visible' | 'prefetch' }> {
  const total = Math.max(1, Math.floor(options.totalPages) || 1)
  const current = Math.max(1, Math.min(total, Math.floor(options.currentPage) || 1))
  const pages: Array<{ pageNumber: number; priority: 'visible' | 'prefetch' }> = [
    { pageNumber: current, priority: 'visible' },
  ]
  if (options.readyPage !== current) return pages

  const ahead = options.direction < 0 ? [-1, 1, -2, -3] : [-1, 1, 2, 3]
  const seen = new Set([current])
  for (const delta of ahead) {
    const page = current + delta
    if (page < 1 || page > total || seen.has(page)) continue
    seen.add(page)
    pages.push({ pageNumber: page, priority: 'prefetch' })
  }
  return pages
}
