export const DOCUMENT_FIT_FONT_MAX = 12
export const DOCUMENT_FIT_FONT_MIN = 8
export const DOCUMENT_FIT_LINE_MAX = 1.6
export const DOCUMENT_FIT_LINE_MIN = 1.22
export const DOCUMENT_FIT_PAD_MAX = 16
export const DOCUMENT_FIT_PAD_MIN = 6

export type DocumentPageFitStyle = {
  fontSize: number
  lineHeight: number
  padding: number
  scale: number
}

export const DOCUMENT_PAGE_FIT_RESET: DocumentPageFitStyle = {
  fontSize: DOCUMENT_FIT_FONT_MAX,
  lineHeight: DOCUMENT_FIT_LINE_MAX,
  padding: DOCUMENT_FIT_PAD_MAX,
  scale: 1,
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/** Type stays fixed. Overflow is handled only by resolveDocumentPageFitScale. */
export function resolveDocumentPageFit(
  _contentHeight?: number,
  _boxHeight?: number,
): Omit<DocumentPageFitStyle, 'scale'> {
  return {
    fontSize: DOCUMENT_FIT_FONT_MAX,
    lineHeight: DOCUMENT_FIT_LINE_MAX,
    padding: DOCUMENT_FIT_PAD_MAX,
  }
}

export function usesFixedDocumentPageType(fit: Pick<DocumentPageFitStyle, 'fontSize' | 'lineHeight' | 'padding'>): boolean {
  return (
    fit.fontSize === DOCUMENT_FIT_FONT_MAX &&
    fit.lineHeight === DOCUMENT_FIT_LINE_MAX &&
    fit.padding === DOCUMENT_FIT_PAD_MAX
  )
}

/** Last-resort uniform scale when the smallest type still overflows the PDF page. */
export function resolveDocumentPageFitScale(contentHeight: number, boxHeight: number): number {
  if (boxHeight < 1 || contentHeight <= boxHeight + 1) return 1
  return Math.max(0.5, Math.min(1, boxHeight / contentHeight))
}

export function applyDocumentPageFitVars(el: HTMLElement, style: DocumentPageFitStyle): void {
  el.style.setProperty('--tm-doc-fit-font', `${style.fontSize}px`)
  el.style.setProperty('--tm-doc-fit-lead', String(style.lineHeight))
  el.style.setProperty('--tm-doc-fit-pad', `${style.padding}px`)
  el.style.setProperty('--tm-doc-fit-scale', String(style.scale))
}

/** Saved into each page's Markdown so reopen does not remount-measure. */
export type DocumentPageFitRecord = DocumentPageFitStyle & {
  boxWidth: number
  boxHeight: number
}

const FIT_COMMENT_RE = /^<!--\s*tm-doc-fit\b([^>]*)-->\s*/i
const FIT_ATTR_RE = /([a-zA-Z]+)\s*=\s*"([^"]*)"/g

function readFinite(value: string | undefined, fallback: number): number {
  const next = Number.parseFloat(value ?? '')
  return Number.isFinite(next) ? next : fallback
}

export function isDocumentPageFitRecord(value: unknown): value is DocumentPageFitRecord {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<DocumentPageFitRecord>
  return (
    Number.isFinite(record.fontSize) &&
    Number.isFinite(record.lineHeight) &&
    Number.isFinite(record.padding) &&
    Number.isFinite(record.scale) &&
    Number.isFinite(record.boxWidth) &&
    Number.isFinite(record.boxHeight)
  )
}

export function splitDocumentPageFitMarkdown(text: string): {
  fit: DocumentPageFitRecord | null
  body: string
} {
  const trimmed = text.trim()
  const match = trimmed.match(FIT_COMMENT_RE)
  if (!match) return { fit: null, body: trimmed }

  const attrs = new Map<string, string>()
  const raw = match[1] ?? ''
  for (const part of raw.matchAll(FIT_ATTR_RE)) {
    attrs.set(part[1]!, part[2]!)
  }

  const fit = {
    fontSize: readFinite(attrs.get('fontSize'), DOCUMENT_FIT_FONT_MAX),
    lineHeight: readFinite(attrs.get('lineHeight'), DOCUMENT_FIT_LINE_MAX),
    padding: readFinite(attrs.get('padding'), DOCUMENT_FIT_PAD_MAX),
    scale: readFinite(attrs.get('scale'), 1),
    boxWidth: readFinite(attrs.get('boxWidth'), 0),
    boxHeight: readFinite(attrs.get('boxHeight'), 0),
  }
  const body = trimmed.slice(match[0].length).trim()
  return {
    fit: fit.boxWidth > 0 && fit.boxHeight > 0 ? fit : null,
    body,
  }
}

export function writeDocumentPageFitMarkdown(body: string, fit: DocumentPageFitRecord): string {
  const { body: clean } = splitDocumentPageFitMarkdown(body)
  const comment = `<!-- tm-doc-fit fontSize="${round1(fit.fontSize)}" lineHeight="${round2(fit.lineHeight)}" padding="${Math.round(fit.padding)}" scale="${round2(fit.scale)}" boxWidth="${Math.round(fit.boxWidth)}" boxHeight="${Math.round(fit.boxHeight)}" -->`
  return clean ? `${comment}\n\n${clean}` : comment
}

/** Keep the fixed type; only the uniform scale follows the current page box. */
export function scaleDocumentPageFitForBox(
  saved: DocumentPageFitRecord,
  _boxWidth: number,
  boxHeight: number,
): DocumentPageFitStyle {
  const heightRatio = saved.boxHeight > 0 && boxHeight > 0 ? boxHeight / saved.boxHeight : 1
  const safeRatio = Number.isFinite(heightRatio) && heightRatio > 0 ? heightRatio : 1
  return {
    ...DOCUMENT_PAGE_FIT_RESET,
    scale: Math.max(0.5, Math.min(1.5, round2(saved.scale * safeRatio))),
  }
}
