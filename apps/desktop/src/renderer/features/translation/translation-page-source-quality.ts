import { isUsableOdlPreviewContent, stripOcrCollapsedContent } from '@toolman/shared'

export const NO_VALID_PAGE_TEXT = 'no-valid-text'

const PDF_PAGE_MARKER_BODY_RE = /【第 \d+ 页(?:\/\d+)?】\n?/g

/** Local copy of packages/knowledge pdf-page-markers — avoid @toolman/knowledge in renderer. */
export function isPdfPageMarkerOnly(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return true
  return trimmed.replace(PDF_PAGE_MARKER_BODY_RE, '').trim().length === 0
}

export function hasUsableParsePreviewContent(text: string, markdown?: string): boolean {
  const md = markdown?.trim() ?? ''
  const plain = text.trim()
  if (md && !isPdfPageMarkerOnly(md) && isUsableOdlPreviewContent(plain, md)) return true
  if (plain && !isPdfPageMarkerOnly(plain) && isUsableOdlPreviewContent(plain, md)) return true
  return false
}

/** Lenient check for showing parsed preview — any non-marker body after sanitize counts. */
export function hasDisplayableParsePreviewContent(text: string, markdown?: string): boolean {
  const { text: plain, markdown: md } = sanitizeParsePreviewContent(text, markdown)
  if (md.trim() && !isPdfPageMarkerOnly(md)) return true
  if (plain.trim() && !isPdfPageMarkerOnly(plain)) return true
  return false
}

/** ODL HTML/markdown needs MessageMarkdown; glm-ocr plain text uses lightweight paragraphs. */
export function isRichMarkdownPreview(text: string, markdown?: string): boolean {
  const body = (markdown ?? text).trim()
  if (!body) return false
  if (/<[a-z][\s\S]*>/i.test(body)) return true
  if (/^#{1,6}\s/m.test(body)) return true
  if (/^\s*[-*+]\s+/m.test(body)) return true
  if (/^\s*\d+\.\s+/m.test(body)) return true
  return false
}

/** Strip OCR collapse noise (e.g. repeated "27") before display / cache. */
export function sanitizeParsePreviewContent(text: string, markdown?: string): {
  text: string
  markdown: string
} {
  const md = stripOcrCollapsedContent(markdown?.trim() ?? '')
  const plain = stripOcrCollapsedContent(text.trim() || md)
  return {
    text: plain,
    markdown: md || plain,
  }
}

/** Local copy of packages/knowledge pdf-text-quality — avoid @toolman/knowledge in renderer. */
function isPdfExtractedTextInsufficient(text: string, pageCount = 1): boolean {
  const normalized = text.trim()
  if (!normalized) return true

  const pages = Math.max(1, pageCount)
  const meaningful = normalized.replace(/[\s\d\p{P}\p{S}]/gu, '')
  if (meaningful.length < 80) return true

  const readable = normalized.match(/[\u4e00-\u9fffA-Za-z0-9]/g)?.length ?? 0
  if (readable / normalized.length < 0.12 && normalized.length < 600) return true

  if (pages > 1 && normalized.length / pages < 60) return true

  if (meaningful.length > 120) {
    const uniqueChars = new Set([...meaningful]).size
    if (uniqueChars / meaningful.length < 0.12) return true
  }

  const suspicious = normalized.match(/[\uFFFD\u0000-\u0008\u000B\u000C\u000E-\u001F]/g)?.length ?? 0
  if (suspicious > 0 && suspicious / normalized.length > 0.02) return true

  return false
}

/** Reject OCR/parse noise before sending a page to the translation model. */
export function isTranslationPageSourceInsufficient(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return true

  const compact = trimmed.replace(/\s+/g, '')
  if (!compact) return true

  const digits = compact.match(/\d/g)?.length ?? 0
  const letters = trimmed.match(/[A-Za-z\u4e00-\u9fff]/g)?.length ?? 0
  if (digits / compact.length > 0.65 && letters < 24) return true

  const lines = trimmed
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  if (lines.length >= 4) {
    const numericLines = lines.filter((line) => /^[\d\s.,:/-]+$/.test(line))
    if (numericLines.length / lines.length > 0.7 && letters < 32) return true

    const uniqueLines = new Set(lines)
    if (uniqueLines.size <= 2 && lines.every((line) => /^\d+$/.test(line))) return true
  }

  if (isPdfExtractedTextInsufficient(trimmed, 1)) {
    if (letters >= 12 && digits / Math.max(1, compact.length) < 0.25) {
      return false
    }
    return true
  }

  return false
}

export const HYBRID_UNAVAILABLE_ERROR = 'hybrid-unavailable'

export function emptyPageMessageKey(error?: string): 'pageNoValidText' | 'pageEmpty' | 'pageHybridUnavailable' {
  if (error === HYBRID_UNAVAILABLE_ERROR) return 'pageHybridUnavailable'
  return error === NO_VALID_PAGE_TEXT ? 'pageNoValidText' : 'pageEmpty'
}
