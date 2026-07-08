import { formatPdfPageMarker } from '../parsers/pdf-page-markers.js'

const DOCUMENT_EXT_PATTERN = /\.(pdf|docx?|txt|markdown|md|pptx|xlsx?|csv)$/i

/** Normalize file names for fuzzy matching (handles full-width dash, spaces, case). */
export function normalizeDocumentNameForMatch(name: string): string {
  return name
    .toLowerCase()
    .replace(DOCUMENT_EXT_PATTERN, '')
    .replace(/[\uFF0D－—–‐\-]/g, '')
    .replace(/[\s_().（）[\]{}]+/g, '')
    .trim()
}

export function documentTitleMatchesQuery(docTitle: string, queryHint: string): boolean {
  const docNorm = normalizeDocumentNameForMatch(docTitle)
  const hintNorm = normalizeDocumentNameForMatch(queryHint)
  if (!docNorm || !hintNorm) return false
  if (docNorm === hintNorm) return true
  if (docNorm.includes(hintNorm) || hintNorm.includes(docNorm)) return true

  const minLen = Math.min(docNorm.length, hintNorm.length)
  if (minLen >= 10) {
    const prefixLen = Math.min(16, minLen)
    const docPrefix = docNorm.slice(0, prefixLen)
    const hintPrefix = hintNorm.slice(0, prefixLen)
    if (docNorm.includes(hintPrefix) || hintNorm.includes(docPrefix)) return true
  }

  return false
}

/** Extract a document/file name hint from natural-language queries. */
export function extractDocumentTitleQueryHint(query: string): string | null {
  const trimmed = query.trim()
  if (!trimmed) return null

  const withExt = trimmed.match(
    /([^\s,，。；;：:？?！!]+?\.(?:pdf|docx?|txt|markdown|md|pptx|xlsx?|csv))/i,
  )
  if (withExt?.[1]) return withExt[1].trim()

  const withFileBeforePage = trimmed.match(
    /(?:本地)?知识库\s*中\s*(.+?)\s*(?:文件|文档)\s*第\s*\d+\s*页/i,
  )
  if (withFileBeforePage?.[1]) {
    const candidate = withFileBeforePage[1].trim()
    if (candidate.length >= 3) return candidate
  }

  const beforePage = trimmed.match(/(.+?)\s*第\s*\d+\s*页/i)
  if (beforePage?.[1]) {
    const candidate = beforePage[1]
      .replace(/^(?:搜索|查找|在|从|本地知识库|知识库|中|\s)+/u, '')
      .replace(/\s*(?:文件|文档)$/u, '')
      .trim()
    if (candidate.length >= 3) return candidate
  }

  const quoted = trimmed.match(/[「"']([^「」"']+?)[」"']/)
  if (quoted?.[1] && quoted[1].trim().length >= 3) return quoted[1].trim()

  return null
}

export function enhanceQueryForKnowledgeSearch(query: string): string {
  let enhanced = query.trim()
  const pageMatch = enhanced.match(/第\s*(\d+)\s*页|page\s*(\d+)/i)
  if (pageMatch) {
    const pageNumber = Number(pageMatch[1] ?? pageMatch[2])
    if (Number.isFinite(pageNumber) && pageNumber > 0) {
      const marker = formatPdfPageMarker(pageNumber)
      if (!enhanced.includes(marker)) {
        enhanced = `${enhanced} ${marker}`
      }
    }
  }

  const docHint = extractDocumentTitleQueryHint(query)
  if (docHint) {
    const normalized = normalizeDocumentNameForMatch(docHint)
    if (!enhanced.toLowerCase().includes(docHint.toLowerCase())) {
      enhanced = `${enhanced} ${docHint}`
    }
    if (normalized && !enhanced.includes(normalized)) {
      enhanced = `${enhanced} ${normalized}`
    }
  }

  return enhanced
}
