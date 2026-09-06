export const DOCUMENT_PAGE_OVERSCAN = 1
/** First page and later pages keep the same mounted row count (current ± overscan, shifted at the ends). */
export const DOCUMENT_PAGE_WINDOW_SIZE = DOCUMENT_PAGE_OVERSCAN * 2 + 1
export const DOCUMENT_ROW_PANE_PAD_TOP = 12
export const DOCUMENT_ROW_GAP = 16
export const MIN_MEASURED_ROW_HEIGHT = 48

export function estimateDocumentPageBodyHeight(pageBoxWidth: number, pageAspect: number | null): number {
  const width = Math.max(160, pageBoxWidth || 400)
  const aspect = pageAspect && pageAspect > 0 ? pageAspect : 792 / 612
  return Math.round(width * aspect)
}

export function estimateDocumentRowHeight(pageBoxWidth: number, pageAspect: number | null): number {
  return DOCUMENT_ROW_PANE_PAD_TOP + estimateDocumentPageBodyHeight(pageBoxWidth, pageAspect) + DOCUMENT_ROW_GAP
}

export function resolveDocumentPageWindow(
  currentPage: number,
  totalPages: number,
  overscan = DOCUMENT_PAGE_OVERSCAN,
): { startPage: number; endPage: number } {
  const total = Math.max(1, Math.floor(totalPages) || 1)
  const current = Math.max(1, Math.min(total, Math.floor(currentPage) || 1))
  let start = current - overscan
  let end = current + overscan
  if (end > total) {
    start -= end - total
    end = total
  }
  if (start < 1) {
    end += 1 - start
    start = 1
  }
  return {
    startPage: Math.max(1, start),
    endPage: Math.min(total, end),
  }
}

export function pageFromScrollTop(scrollTop: number, rowHeight: number, totalPages: number): number {
  const total = Math.max(1, Math.floor(totalPages) || 1)
  if (rowHeight < 1) return 1
  return Math.max(1, Math.min(total, Math.floor(Math.max(0, scrollTop) / rowHeight) + 1))
}

export function resolveMeasuredRowHeight(
  pageNumber: number,
  measured: ReadonlyMap<number, number>,
  fallbackHeight: number,
): number {
  const exact = measured.get(pageNumber)
  if (exact && exact > 0) return exact
  if (measured.size > 0) {
    let sum = 0
    for (const height of measured.values()) sum += height
    return Math.max(1, Math.round(sum / measured.size))
  }
  return Math.max(1, fallbackHeight)
}

export function pageFromMeasuredScrollTop(
  scrollTop: number,
  totalPages: number,
  getRowHeight: (pageNumber: number) => number,
): number {
  const total = Math.max(1, Math.floor(totalPages) || 1)
  let offset = 0
  const y = Math.max(0, scrollTop)
  for (let page = 1; page <= total; page += 1) {
    const height = Math.max(1, getRowHeight(page))
    if (y < offset + height) return page
    offset += height
  }
  return total
}

export function documentWindowSpacers(
  startPage: number,
  endPage: number,
  totalPages: number,
  rowHeight: number,
): { top: number; bottom: number } {
  const total = Math.max(1, Math.floor(totalPages) || 1)
  const start = Math.max(1, startPage)
  const end = Math.max(start, endPage)
  return {
    top: Math.max(0, start - 1) * rowHeight,
    bottom: Math.max(0, total - end) * rowHeight,
  }
}

export function documentWindowSpacersFromHeights(
  startPage: number,
  endPage: number,
  totalPages: number,
  getRowHeight: (pageNumber: number) => number,
): { top: number; bottom: number } {
  const total = Math.max(1, Math.floor(totalPages) || 1)
  const start = Math.max(1, startPage)
  const end = Math.max(start, Math.min(total, endPage))
  let top = 0
  for (let page = 1; page < start; page += 1) top += Math.max(1, getRowHeight(page))
  let bottom = 0
  for (let page = end + 1; page <= total; page += 1) bottom += Math.max(1, getRowHeight(page))
  return { top, bottom }
}

export function offsetToPage(
  pageNumber: number,
  getRowHeight: (page: number) => number,
): number {
  const page = Math.max(1, Math.floor(pageNumber) || 1)
  let top = 0
  for (let index = 1; index < page; index += 1) top += Math.max(1, getRowHeight(index))
  return top
}

/** Keep scroll position when unmounted pages move into the spacer; only correct measurement changes. */
export function topSpacerScrollAdjustment(
  startPageChanged: boolean,
  previousTop: number,
  nextTop: number,
): number {
  if (startPageChanged || previousTop <= 0 || nextTop === previousTop) return 0
  return nextTop - previousTop
}
