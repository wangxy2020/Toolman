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

/** Remount can reuse a saved fit when the width bucket and height still match. */
export function canReuseDocumentPageFit(
  saved: DocumentPageFitRecord | null | undefined,
  boxWidth: number,
  boxHeight: number,
  caps: DocumentPageFitCaps = DOCUMENT_PAGE_FIT_PROSE_CAPS,
): boolean {
  if (!saved || saved.boxWidth < 1 || saved.boxHeight < 1) return false
  if (shouldRemeasureDocumentPageFitForWidth(saved.boxWidth, boxWidth)) return false
  // Height still needs to be close — overflow fit depends on it.
  if (Math.abs(boxHeight - saved.boxHeight) >= 24) return false
  const widthCaps = resolveDocumentPageFitCapsForWidth(boxWidth, caps)
  if (saved.fontSize > widthCaps.fontMax + 0.15) return false
  if (saved.fontSize < widthCaps.fontMin - 0.15) return false
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
 * Only two layout sizes matter for 字号: default window vs maximized.
 * Continuous width interpolation caused many visible steps while dragging.
 */
export type DocumentPageFitWidthBucket = 'default' | 'maximized'

/** Page-pane widths at/above this are treated as the maximized layout. */
export const DOCUMENT_FIT_MAXIMIZED_WIDTH = 640

export function resolveDocumentPageFitWidthBucket(
  boxWidth: number,
): DocumentPageFitWidthBucket {
  return (boxWidth || 0) >= DOCUMENT_FIT_MAXIMIZED_WIDTH ? 'maximized' : 'default'
}

/**
 * Discrete 字号 caps for default vs maximized — no in-between steps.
 * Maximized is slightly larger so the wide pane stays readable.
 */
export function resolveDocumentPageFitCapsForWidth(
  boxWidth: number,
  base: DocumentPageFitCaps = DOCUMENT_PAGE_FIT_PROSE_CAPS,
): DocumentPageFitCaps {
  const bucket = resolveDocumentPageFitWidthBucket(boxWidth)
  if (bucket === 'default') {
    return { ...base }
  }
  return {
    fontMax: round1(base.fontMax + 2),
    fontMin: round1(base.fontMin + 1),
    lineMax: base.lineMax,
    lineMin: base.lineMin,
    padMax: base.padMax + 2,
    padMin: base.padMin + 1,
  }
}

/** Remeasure 字号 only when crossing default ↔ maximized. */
export function shouldRemeasureDocumentPageFitForWidth(
  previousWidth: number,
  nextWidth: number,
): boolean {
  if (previousWidth < 1 || nextWidth < 1) return true
  return (
    resolveDocumentPageFitWidthBucket(previousWidth) !==
    resolveDocumentPageFitWidthBucket(nextWidth)
  )
}

/**
 * Same bucket → keep type. Cross default/maximized → remap within the new caps
 * (one step, not a continuous scale with the drag).
 */
export function scaleDocumentPageFitForBox(
  saved: DocumentPageFitRecord,
  boxWidth: number,
  _boxHeight: number,
  caps: DocumentPageFitCaps = DOCUMENT_PAGE_FIT_PROSE_CAPS,
): DocumentPageFitStyle {
  const widthCaps = resolveDocumentPageFitCapsForWidth(boxWidth, caps)
  const scale =
    saved.scale >= DOCUMENT_FIT_SCALE_MIN ? Math.min(1, saved.scale) : 1
  if (!shouldRemeasureDocumentPageFitForWidth(saved.boxWidth, boxWidth)) {
    return {
      fontSize: Math.max(widthCaps.fontMin, Math.min(widthCaps.fontMax, round1(saved.fontSize))),
      lineHeight: saved.lineHeight,
      padding: Math.max(widthCaps.padMin, Math.min(widthCaps.padMax, Math.round(saved.padding))),
      scale,
    }
  }
  const previousCaps = resolveDocumentPageFitCapsForWidth(saved.boxWidth, caps)
  const span = Math.max(0.01, previousCaps.fontMax - previousCaps.fontMin)
  const t = Math.max(0, Math.min(1, (saved.fontSize - previousCaps.fontMin) / span))
  const nextFont = round1(
    widthCaps.fontMin + t * (widthCaps.fontMax - widthCaps.fontMin),
  )
  return {
    fontSize: Math.max(widthCaps.fontMin, Math.min(widthCaps.fontMax, nextFont)),
    lineHeight: saved.lineHeight,
    padding: Math.max(widthCaps.padMin, Math.min(widthCaps.padMax, Math.round(saved.padding))),
    scale: 1,
  }
}
