/** Page markers compatible with `@toolman/knowledge` chunking and search. */
export function formatPdfPageMarker(pageNumber: number, totalPages?: number): string {
  if (totalPages && totalPages > 0) {
    return `【第 ${pageNumber} 页/${totalPages}】`
  }
  return `【第 ${pageNumber} 页】`
}

export function buildTextPageSeparator(): string {
  return '\n\n【第 %page-number% 页】\n'
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

export function pickLongestUsablePageBody(...sources: Array<string | undefined | null>): string {
  let best = ''
  for (const source of sources) {
    if (!source?.trim()) continue
    const cleaned = stripPdfPageMarkers(source)
    if (!cleaned || isPdfPageMarkerOnly(cleaned)) continue
    if (cleaned.length > best.length) best = cleaned
  }
  return best
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

export function formatPageRange(range?: { start: number; end: number }): string | undefined {
  if (!range) return undefined
  const start = Math.max(1, Math.floor(range.start))
  const end = Math.max(start, Math.floor(range.end))
  if (start === end) return String(start)
  return `${start}-${end}`
}
