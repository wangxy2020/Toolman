import {
  formatPdfPageMarker,
  isPdfPageMarkerOnly,
  splitPdfPagesByMarkers,
  stripPdfPageMarkers,
} from './pdf-page-markers.js'
import { isGappyCjkExtractedText } from './pdf-text-quality.js'

export type PdfPageQualityReason =
  | 'ok'
  | 'empty'
  | 'sparse'
  | 'gappy-cjk'
  | 'collapsed'
  | 'digit-noise'
  | 'mojibake'

/** Rendered pages below this ink ratio are header/page-number only — skip glm-ocr. */
export const PDF_OCR_BLANK_INK_RATIO = 0.004

export function isMostlyBlankOcrInk(inkRatio: number): boolean {
  return Number.isFinite(inkRatio) && inkRatio < PDF_OCR_BLANK_INK_RATIO
}

export interface PdfPageQuality {
  usable: boolean
  reason: PdfPageQualityReason
  letterCount: number
  cjkCount: number
}

export interface PdfPageRange {
  start: number
  end: number
}

const MIN_PAGE_LETTERS = 24
const MIN_PAGE_CJK = 12

function countCjk(text: string): number {
  return (text.match(/[\u4e00-\u9fff]/g) ?? []).length
}

function countLetters(text: string): number {
  return (text.match(/[A-Za-z\u4e00-\u9fff]/g) ?? []).length
}

/**
 * RapidOCR/Paddle often emits `证 券 分 析`. Join only single spaces / one-char CJK lines.
 * Native broken text layers use multi-space holes (`第2    析`) and must stay gappy.
 */
export function collapseSpacedCjkOcrText(text: string): string {
  const runs = text.match(/[\u4e00-\u9fff]+/g) ?? []
  const cjkCount = runs.reduce((count, run) => count + run.length, 0)
  if (cjkCount < 12) return text
  // Char-spaced RapidOCR averages ~1; broken native layers keep longer runs plus multi-space holes.
  if (cjkCount / runs.length >= 2.2) return text

  const joinedLines = text
    .split('\n')
    .reduce<string[]>((lines, line) => {
      const trimmed = line.trim()
      const prev = lines.at(-1)
      if (prev !== undefined && /^[\u4e00-\u9fff]{1,2}$/.test(prev) && /^[\u4e00-\u9fff]{1,2}$/.test(trimmed)) {
        lines[lines.length - 1] = `${prev}${trimmed}`
        return lines
      }
      lines.push(trimmed ? trimmed : line)
      return lines
    }, [])
    .join('\n')

  let current = joinedLines
  let previous = ''
  while (current !== previous) {
    previous = current
    current = current
      .replace(/([\u4e00-\u9fff]) (?=[\u4e00-\u9fff])/g, '$1')
      .replace(/([\u4e00-\u9fff]) (?=[，。！？；：、])/g, '$1')
      .replace(/([，。！？；：、]) (?=[\u4e00-\u9fff])/g, '$1')
  }
  return current
}

function isGappyCjkPage(text: string): boolean {
  if (isGappyCjkExtractedText(text)) return true
  const runs = text.match(/[\u4e00-\u9fff]+/g) ?? []
  const cjkCount = runs.reduce((count, run) => count + run.length, 0)
  if (cjkCount < 20) return false
  const latinCount = text.match(/[A-Za-z]/g)?.length ?? 0
  if (latinCount > 0 && cjkCount / (cjkCount + latinCount) < 0.45) return false
  return cjkCount / runs.length < 2.8
}

/**
 * Ghostscript / broken CID layers decode as CJK mixed with NKo, Greek, Khmer, etc.
 * Those pages look fine when rendered, so Hybrid OCR markdown must win over this layer.
 */
export function isMojibakeCjkText(text: string): boolean {
  const body = stripPdfPageMarkers(text)
  if (!body) return false
  const exotic =
    body.match(
      /[\u02b0-\u036f\u0370-\u03ff\u0400-\u052f\u0530-\u058f\u07c0-\u07ff\u0900-\u0d7f\u0d80-\u0dff\u0e00-\u0e7f\u1780-\u17ff\u1800-\u18af\u2c80-\u2cff\u2de0-\u2dff\ua000-\ua4cf\ua640-\ua69f]/g,
    )?.length ?? 0
  // Ghostscript/GBK soup mixes a few NKo/Cyrillic glyphs into otherwise long CJK runs.
  return exotic >= 8
}

function maxShortDuplicateRun(text: string): number {
  const lines = text
    .split('\n')
    .map((line) => line.trim().replace(/\s+/g, ''))
    .filter(Boolean)
  let maxRun = 0
  let run = 0
  let previous = ''
  for (const line of lines) {
    if (line.length > 8) {
      run = 0
      previous = ''
      continue
    }
    if (line === previous) run += 1
    else {
      run = 1
      previous = line
    }
    maxRun = Math.max(maxRun, run)
  }
  return maxRun
}

export function assessPdfPageTextQuality(text: string): PdfPageQuality {
  const body = stripPdfPageMarkers(text)
  const letterCount = countLetters(body)
  const cjkCount = countCjk(body)
  if (!body) {
    return { usable: false, reason: 'empty', letterCount, cjkCount }
  }
  if (isMojibakeCjkText(body)) {
    return { usable: false, reason: 'mojibake', letterCount, cjkCount }
  }
  if (isGappyCjkPage(body)) {
    return { usable: false, reason: 'gappy-cjk', letterCount, cjkCount }
  }
  if (maxShortDuplicateRun(body) >= 15) {
    return { usable: false, reason: 'collapsed', letterCount, cjkCount }
  }
  const digits = (body.match(/\d/g) ?? []).length
  if (letterCount < 16 && digits >= 8 && digits > letterCount * 2) {
    return { usable: false, reason: 'digit-noise', letterCount, cjkCount }
  }
  if (letterCount < MIN_PAGE_LETTERS && cjkCount < MIN_PAGE_CJK) {
    return { usable: false, reason: 'sparse', letterCount, cjkCount }
  }
  return { usable: true, reason: 'ok', letterCount, cjkCount }
}

export function isPdfPageTextUsable(text: string | undefined | null): boolean {
  return assessPdfPageTextQuality(text ?? '').usable
}

/** glm-ocr sometimes repeats a short page (cover/copyright) until the token cap. Keep the first copy. */
export function collapseRepeatedOcrText(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) return ''

  const collapsedLines: string[] = []
  let previous = ''
  for (const line of trimmed.split('\n')) {
    const key = line.trim()
    if (key && key === previous) continue
    previous = key
    collapsedLines.push(line)
  }
  let next = collapsedLines.join('\n').trim()
  if (isPdfPageMarkerOnly(next)) return ''

  if (next.length < 120) return next
  const paragraphs = next
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
  if (paragraphs.length < 4) return next
  const unique: string[] = []
  const seen = new Set<string>()
  for (const paragraph of paragraphs) {
    if (seen.has(paragraph)) continue
    seen.add(paragraph)
    unique.push(paragraph)
  }
  if (unique.length > 0 && unique.length <= paragraphs.length / 3) {
    next = unique.join('\n\n')
  }
  return isPdfPageMarkerOnly(next) ? '' : next
}

export function finalizeGlmOcrText(text: string): string {
  return collapseSpacedCjkOcrText(collapseRepeatedOcrText(text))
}

export function shouldSkipGlmOcrForBlankPage(inkRatio: number | undefined): boolean {
  return inkRatio !== undefined && isMostlyBlankOcrInk(inkRatio)
}

/** Marker-loop / empty glm output on a page that still has ink gets one tighter decode. */
export function shouldRetryGlmOcrPage(text: string, inkRatio?: number): boolean {
  if (shouldSkipGlmOcrForBlankPage(inkRatio)) return false
  return !isPdfPageTextUsable(text)
}

/**
 * Hybrid already returned a broken CID/GBK layer. Sending those pages to glm-ocr
 * would re-OCR hundreds of pages that Fast OCR already attempted.
 */
export function shouldSendPageToGlmOcr(options: { hybridText?: string }): boolean {
  const hybrid = options.hybridText?.trim() ?? ''
  if (!hybrid) return true
  if (isPdfPageTextUsable(hybrid)) return false
  return !isMojibakeCjkText(hybrid)
}

export function groupPageNumbersIntoRanges(pageNumbers: number[], maxSpan: number): PdfPageRange[] {
  const span = Math.max(1, maxSpan)
  const pages = [...new Set(pageNumbers.filter((page) => Number.isInteger(page) && page >= 1))].sort(
    (left, right) => left - right,
  )
  if (pages.length === 0) return []

  const ranges: PdfPageRange[] = []
  let start = pages[0]!
  let prev = start
  for (let index = 1; index < pages.length; index += 1) {
    const page = pages[index]!
    if (page === prev + 1 && page - start + 1 <= span) {
      prev = page
      continue
    }
    ranges.push({ start, end: prev })
    start = page
    prev = page
  }
  ranges.push({ start, end: prev })
  return ranges
}

export function pageHasTable(content: string): boolean {
  return /<table\b/i.test(content) || /^\s*\|.+\|/m.test(content)
}

export function extractMarkdownHeading(content: string): string | undefined {
  const match = content.match(/^\s{0,3}#{1,3}\s+(.+)$/m)
  const heading = match?.[1]?.replace(/[#*_`]+/g, '').trim()
  if (!heading || heading.length < 2 || heading.length > 80) return undefined
  return heading
}

function pickBetterChannel(existing: string, next: string): string {
  if (!next) return existing
  if (!existing) return next
  const existingOk = isPdfPageTextUsable(existing)
  const nextOk = isPdfPageTextUsable(next)
  if (nextOk && !existingOk) return next
  if (existingOk && !nextOk) return existing
  return next.length > existing.length ? next : existing
}

/** Prefer a usable OCR/markdown channel over a longer broken PDF text layer. */
export function pickIngestPageBody(page: { text?: string; markdown?: string }): string {
  const markdown = page.markdown?.trim() ?? ''
  const text = page.text?.trim() ?? ''
  if (pageHasTable(markdown)) return markdown
  const markdownUsable = Boolean(markdown) && isPdfPageTextUsable(markdown)
  const textUsable = Boolean(text) && isPdfPageTextUsable(text)
  if (markdownUsable && !textUsable) return markdown
  if (textUsable && !markdownUsable) return text
  if (markdownUsable && textUsable) {
    return markdown.length >= text.length ? markdown : text
  }
  return markdown.length >= text.length ? markdown : text
}

export function formatIngestPdfPage(options: {
  pageNumber: number
  totalPages: number
  body: string
  heading?: string
}): string {
  const body = options.body.trim()
  if (!body) return ''
  const heading =
    options.heading && !body.includes(options.heading) ? `## ${options.heading}\n` : ''
  return `${formatPdfPageMarker(options.pageNumber, options.totalPages)}\n${heading}${body}`.trim()
}

export function collectPagesFromChannels(options: {
  pages?: Array<{ pageNumber: number; text?: string; markdown?: string }>
  plainText?: string
  markdown?: string
  totalPages: number
}): Map<number, { pageNumber: number; text: string; markdown?: string }> {
  const map = new Map<number, { pageNumber: number; text: string; markdown?: string }>()
  const remember = (pageNumber: number, text: string, markdown?: string) => {
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > options.totalPages) return
    const existing = map.get(pageNumber)
    const nextText = text.trim()
    const nextMarkdown = markdown?.trim() ?? ''
    if (!existing) {
      if (!nextText && !nextMarkdown) return
      map.set(pageNumber, {
        pageNumber,
        text: nextText,
        ...(nextMarkdown ? { markdown: nextMarkdown } : {}),
      })
      return
    }
    existing.text = pickBetterChannel(existing.text, nextText)
    const nextMd = pickBetterChannel(existing.markdown ?? '', nextMarkdown)
    if (nextMd) existing.markdown = nextMd
  }

  for (const page of options.pages ?? []) {
    remember(page.pageNumber, page.text ?? '', page.markdown)
  }
  for (const page of splitPdfPagesByMarkers(options.plainText ?? '')) {
    remember(page.pageNumber, page.text)
  }
  for (const page of splitPdfPagesByMarkers(options.markdown ?? '')) {
    remember(page.pageNumber, page.text, page.text)
  }
  return map
}

export function listPagesNeedingOcr(
  pages: Map<number, { text?: string; markdown?: string }>,
  totalPages: number,
): number[] {
  const needed: number[] = []
  for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
    const page = pages.get(pageNumber)
    if (!isPdfPageTextUsable(pickIngestPageBody(page ?? { text: '' }))) needed.push(pageNumber)
  }
  return needed
}
