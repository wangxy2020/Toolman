/** Default prose size inside the PDF page box (before measure shrinks further). */
export const DOCUMENT_FIT_FONT_MAX = 15
/** Readable floor — never crush body text below this for “fit the page”. */
export const DOCUMENT_FIT_FONT_MIN = 12
export const DOCUMENT_FIT_LINE_MAX = 1.5
export const DOCUMENT_FIT_LINE_MIN = 1.35
export const DOCUMENT_FIT_PAD_MAX = 14
export const DOCUMENT_FIT_PAD_MIN = 8
/**
 * Mild last-resort scale only when content almost fits.
 * Below this, keep fontMin and let the page card scroll instead.
 */
export const DOCUMENT_FIT_SCALE_MIN = 0.85

/** Parsed HTML tables need a lower cap so a full grid still fits the PDF page. */
export const DOCUMENT_FIT_TABLE_FONT_MAX = 12
export const DOCUMENT_FIT_TABLE_FONT_MIN = 10
export const DOCUMENT_FIT_TABLE_LINE_MAX = 1.35
export const DOCUMENT_FIT_TABLE_LINE_MIN = 1.2
export const DOCUMENT_FIT_TABLE_PAD_MAX = 10
export const DOCUMENT_FIT_TABLE_PAD_MIN = 6

export type DocumentPageFitCaps = {
  fontMax: number
  fontMin: number
  lineMax: number
  lineMin: number
  padMax: number
  padMin: number
}

export const DOCUMENT_PAGE_FIT_PROSE_CAPS: DocumentPageFitCaps = {
  fontMax: DOCUMENT_FIT_FONT_MAX,
  fontMin: DOCUMENT_FIT_FONT_MIN,
  lineMax: DOCUMENT_FIT_LINE_MAX,
  lineMin: DOCUMENT_FIT_LINE_MIN,
  padMax: DOCUMENT_FIT_PAD_MAX,
  padMin: DOCUMENT_FIT_PAD_MIN,
}

export const DOCUMENT_PAGE_FIT_TABLE_CAPS: DocumentPageFitCaps = {
  fontMax: DOCUMENT_FIT_TABLE_FONT_MAX,
  fontMin: DOCUMENT_FIT_TABLE_FONT_MIN,
  lineMax: DOCUMENT_FIT_TABLE_LINE_MAX,
  lineMin: DOCUMENT_FIT_TABLE_LINE_MIN,
  padMax: DOCUMENT_FIT_TABLE_PAD_MAX,
  padMin: DOCUMENT_FIT_TABLE_PAD_MIN,
}

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

export function documentPageFitReset(caps: DocumentPageFitCaps = DOCUMENT_PAGE_FIT_PROSE_CAPS): DocumentPageFitStyle {
  return {
    fontSize: caps.fontMax,
    lineHeight: caps.lineMax,
    padding: caps.padMax,
    scale: 1,
  }
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/** Shrink 字号 and 行距 so translation stays inside the PDF page height. */
export function resolveDocumentPageFit(
  contentHeight: number,
  boxHeight: number,
  caps: DocumentPageFitCaps = DOCUMENT_PAGE_FIT_PROSE_CAPS,
): Omit<DocumentPageFitStyle, 'scale'> {
  if (boxHeight < 1 || contentHeight <= boxHeight + 1) {
    return {
      fontSize: caps.fontMax,
      lineHeight: caps.lineMax,
      padding: caps.padMax,
    }
  }
  const ratio = boxHeight / contentHeight
  return {
    fontSize: Math.max(caps.fontMin, round1(caps.fontMax * ratio)),
    lineHeight: Math.max(caps.lineMin, round2(caps.lineMax * (0.82 + 0.18 * ratio))),
    padding: Math.max(caps.padMin, Math.round(caps.padMax * (0.55 + 0.45 * ratio))),
  }
}

/** Further shrink an already-applied type after wrapping is re-measured. */
export function tightenDocumentPageFit(
  current: Omit<DocumentPageFitStyle, 'scale'>,
  contentHeight: number,
  boxHeight: number,
  caps: DocumentPageFitCaps = DOCUMENT_PAGE_FIT_PROSE_CAPS,
): Omit<DocumentPageFitStyle, 'scale'> {
  if (boxHeight < 1 || contentHeight <= boxHeight + 1) return current
  const ratio = boxHeight / contentHeight
  return {
    fontSize: Math.max(caps.fontMin, round1(current.fontSize * ratio)),
    lineHeight: Math.max(caps.lineMin, round2(current.lineHeight * (0.82 + 0.18 * ratio))),
    padding: Math.max(caps.padMin, Math.round(current.padding * (0.55 + 0.45 * ratio))),
  }
}

export function usesFixedDocumentPageType(fit: Pick<DocumentPageFitStyle, 'fontSize' | 'lineHeight' | 'padding'>): boolean {
  return (
    fit.fontSize === DOCUMENT_FIT_FONT_MAX &&
    fit.lineHeight === DOCUMENT_FIT_LINE_MAX &&
    fit.padding === DOCUMENT_FIT_PAD_MAX
  )
}

/**
 * Mild uniform scale when the smallest type still slightly overflows.
 * If the page would need more than ~15% shrink, return 1 and let the card scroll.
 */
export function resolveDocumentPageFitScale(contentHeight: number, boxHeight: number): number {
  if (boxHeight < 1 || contentHeight <= boxHeight + 1) return 1
  const ratio = boxHeight / contentHeight
  if (ratio >= DOCUMENT_FIT_SCALE_MIN) return Math.min(1, ratio)
  return 1
}

export function isSameDocumentPageFit(
  left: Pick<DocumentPageFitRecord, 'fontSize' | 'lineHeight' | 'padding' | 'scale' | 'boxWidth' | 'boxHeight'>,
  right: Pick<DocumentPageFitRecord, 'fontSize' | 'lineHeight' | 'padding' | 'scale' | 'boxWidth' | 'boxHeight'>,
): boolean {
  return (
    Math.abs(left.fontSize - right.fontSize) < 0.15 &&
    Math.abs(left.lineHeight - right.lineHeight) < 0.03 &&
    Math.abs(left.padding - right.padding) < 1 &&
    Math.abs(left.scale - right.scale) < 0.01 &&
    Math.abs(left.boxWidth - right.boxWidth) < 2 &&
    Math.abs(left.boxHeight - right.boxHeight) < 2
  )
}

/** Ignore ResizeObserver noise from padding/type tweaks so fit does not loop. */
export function isNegligibleDocumentFitBoxChange(
  measured: Pick<DocumentPageFitRecord, 'boxWidth' | 'boxHeight'>,
  boxWidth: number,
  boxHeight: number,
): boolean {
  return Math.abs(boxWidth - measured.boxWidth) < 2 && Math.abs(boxHeight - measured.boxHeight) < 2
}

/** Remount can reuse a saved fit when the page box and 字号 cap still match. */
export function canReuseDocumentPageFit(
  saved: DocumentPageFitRecord | null | undefined,
  boxWidth: number,
  boxHeight: number,
  caps: DocumentPageFitCaps = DOCUMENT_PAGE_FIT_PROSE_CAPS,
): boolean {
  if (!saved || saved.boxWidth < 1 || saved.boxHeight < 1) return false
  if (!isNegligibleDocumentFitBoxChange(saved, boxWidth, boxHeight)) return false
  if (saved.fontSize > caps.fontMax + 0.15) return false
  if (saved.fontSize < caps.fontMin - 0.15) return false
  // Old fits that crushed with scale < 0.85 must remeasure for readability.
  if (saved.scale < DOCUMENT_FIT_SCALE_MIN - 0.01) return false
  return true
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

/**
 * Window resize must not rewrite 字号. Scaling by page-box height made maximize
 * (and intermediate layout frames) shrink readable type on some pages.
 * Typography stays put; overflow scrolls inside the card.
 */
export function scaleDocumentPageFitForBox(
  saved: DocumentPageFitRecord,
  _boxWidth: number,
  _boxHeight: number,
  caps: DocumentPageFitCaps = DOCUMENT_PAGE_FIT_PROSE_CAPS,
): DocumentPageFitStyle {
  return {
    fontSize: Math.max(caps.fontMin, Math.min(caps.fontMax, round1(saved.fontSize))),
    lineHeight: saved.lineHeight,
    padding: Math.max(caps.padMin, Math.min(caps.padMax, Math.round(saved.padding))),
    scale: saved.scale >= DOCUMENT_FIT_SCALE_MIN ? Math.min(1, saved.scale) : 1,
  }
}
