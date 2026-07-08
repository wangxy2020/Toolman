/** Marker inserted before each PDF page body for retrieval and chunking. */
export function formatPdfPageMarker(pageNumber: number, totalPages?: number): string {
  if (totalPages && totalPages > 0) {
    return `【第 ${pageNumber} 页/${totalPages}】`
  }
  return `【第 ${pageNumber} 页】`
}

const PDF_PAGE_MARKER_BODY_RE = /【第 (\d+) 页(?:\/\d+)?】\n?/g

export function isPdfPageMarkerOnly(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return true
  return trimmed.replace(PDF_PAGE_MARKER_BODY_RE, '').trim().length === 0
}

export function stripPdfPageMarkers(text: string): string {
  return text.replace(PDF_PAGE_MARKER_BODY_RE, '').trim()
}

export function hasPdfPageMarkers(text: string): boolean {
  return /【第 \d+ 页(?:\/\d+)?】/.test(text)
}

export function splitPdfPagesByMarkers(text: string): Array<{ pageNumber: number; text: string }> {
  const matches = [...text.matchAll(PDF_PAGE_MARKER_BODY_RE)]
  if (matches.length === 0) return []

  const pages: Array<{ pageNumber: number; text: string }> = []
  for (let i = 0; i < matches.length; i += 1) {
    const match = matches[i]!
    const pageNumber = Number(match[1])
    if (!Number.isFinite(pageNumber) || pageNumber < 1) continue

    const start = match.index! + match[0].length
    const end = i + 1 < matches.length ? matches[i + 1]!.index! : text.length
    const pageText = text.slice(start, end).trim()
    if (pageText) {
      pages.push({ pageNumber, text: pageText })
    }
  }

  return pages
}

/** Boost page-specific queries so vector / FTS search can match page markers. */
export function extractPdfPageQueryHint(query: string): number | null {
  const match = query.match(/第\s*(\d+)\s*页|page\s*(\d+)/i)
  if (!match) return null
  const pageNumber = Number(match[1] ?? match[2])
  return Number.isFinite(pageNumber) && pageNumber > 0 ? pageNumber : null
}

export function enhanceQueryForPdfPageSearch(query: string): string {
  const pageNumber = extractPdfPageQueryHint(query)
  if (!pageNumber) return query
  const marker = formatPdfPageMarker(pageNumber)
  if (query.includes(marker)) return query
  return `${query.trim()} ${marker}`
}
