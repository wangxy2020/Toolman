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

export function hasHtmlMarkup(text: string): boolean {
  return /<[a-z][\s\S]*>/i.test(text)
}

/** ODL often stores HTML tables; ReactMarkdown without raw HTML would render them as empty. */
export function htmlPreviewToVisibleText(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return ''
  if (!hasHtmlMarkup(trimmed)) return trimmed
  return trimmed
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<\/(td|th)>/gi, '\t')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** GFM pipe table — must not fall back to plain text or `|` / `---` stay visible. */
export function hasGfmTableMarkup(text: string): boolean {
  const body = text.trim()
  if (!body) return false
  return /^\s*\|.+\|/m.test(body) && /\|[-: ]{3,}\|/.test(body)
}

export type ParsePreviewKind = 'plain' | 'markdown' | 'html'

/** Cheap classifier — do not run OCR/HTML strip here; that belongs to parse, not display. */
export function resolveParsePreviewKind(text: string, markdown?: string): ParsePreviewKind {
  const body = (markdown ?? text).trim()
  if (!body) return 'plain'
  if (hasHtmlMarkup(body)) return 'html'
  if (hasGfmTableMarkup(body)) return 'markdown'
  if (/^#{1,6}\s/m.test(body)) return 'markdown'
  if (/^\s*[-*+]\s+/m.test(body)) return 'markdown'
  return 'plain'
}

/**
 * Tables keep the HTML/markdown renderer. Letters and prose use the same
 * paragraph layout as the translation pane.
 */
export function usesRichDocumentPagePreview(text: string, markdown?: string): boolean {
  const body = (markdown ?? text).trim()
  if (!body) return false
  if (hasHtmlMarkup(body)) return /<table\b/i.test(body) || /<img\b/i.test(body)
  if (hasGfmTableMarkup(body)) return true
  if (/^#{1,6}\s/m.test(body)) return true
  if (/^\s*[-*+]\s+/m.test(body)) return true
  return false
}

/** Tables start from a lower 字号 cap so a full grid can still fit the PDF page. */
export function usesDocumentPageTableFit(text: string, markdown?: string): boolean {
  const body = (markdown ?? text).trim()
  if (!body) return false
  return /<table\b/i.test(body) || hasGfmTableMarkup(body)
}

export function resolveDocumentPageDisplayText(raw: string, rich: boolean): string {
  const body = raw.trim()
  if (!body) return ''
  if (rich) return body
  return hasHtmlMarkup(body) ? htmlPreviewToVisibleText(body) : body
}

/** ODL HTML/markdown needs a rich preview; glm-ocr plain text uses lightweight paragraphs. */
export function isRichMarkdownPreview(text: string, markdown?: string): boolean {
  return usesRichDocumentPagePreview(text, markdown) || resolveParsePreviewKind(text, markdown) === 'html'
}

/** True when there is something to show, without re-running OCR collapse strip. */
export function hasVisibleParsePreviewBody(text: string, markdown?: string): boolean {
  const md = markdown?.trim() ?? ''
  const plain = text.trim()
  if (md && !isPdfPageMarkerOnly(md)) return true
  if (plain && !isPdfPageMarkerOnly(plain)) return true
  return false
}

/** Strip active content from saved ODL HTML before innerHTML. */
function stripPreviewStyleHints(style: string): string {
  return style
    .replace(
      /(?:^|;)\s*(?:font(?:-size|-family|-weight|-style)?|line-height|width|min-width|max-width|white-space|zoom)\s*:[^;]*/gi,
      '',
    )
    .replace(/^;+|;+$/g, '')
    .trim()
}

export function sanitizeDocumentPreviewHtml(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<\/?(iframe|object|embed|link|meta)\b[^>]*>/gi, '')
    .replace(/<\/?font\b[^>]*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(?:href|src)\s*=\s*(['"]?)\s*javascript:[^'">\s]*/gi, '')
    .replace(/\s(?:width|size|face)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\sstyle\s*=\s*"([^"]*)"/gi, (_match, style: string) => {
      const next = stripPreviewStyleHints(style)
      return next ? ` style="${next}"` : ''
    })
    .replace(/\sstyle\s*=\s*'([^']*)'/gi, (_match, style: string) => {
      const next = stripPreviewStyleHints(style)
      return next ? ` style='${next}'` : ''
    })
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

  if (isGappyCjkExtractedText(normalized)) return true

  return false
}

function isGappyCjkExtractedText(text: string): boolean {
  const runs = text.match(/[\u4e00-\u9fff]+/g) ?? []
  const cjkCount = runs.reduce((count, run) => count + run.length, 0)
  if (cjkCount < 80) return false
  const latinCount = text.match(/[A-Za-z]/g)?.length ?? 0
  if (latinCount > 0 && cjkCount / (cjkCount + latinCount) < 0.45) return false
  const averageRun = cjkCount / runs.length
  if (averageRun >= 3.5) return false
  const longRunChars = runs.reduce((count, run) => (run.length >= 4 ? count + run.length : count), 0)
  return longRunChars / cjkCount < 0.45
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
