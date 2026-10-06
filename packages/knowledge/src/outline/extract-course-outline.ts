export type CourseOutlineEntry = {
  title: string
  /** 1-based depth; 1 = top-level chapter. */
  level: number
}

const MAX_OUTLINE_ENTRIES = 80
const MIN_TITLE_LEN = 2
const MAX_TITLE_LEN = 80

const MARKDOWN_HEADING = /^(#{1,3})\s+(.+?)\s*$/
const CN_CHAPTER =
  /^(第[一二三四五六七八九十百千零〇两0-9]+[章节篇讲课部回]|第\s*\d+\s*[章节篇讲课部回])([：:\s].{0,60})?$/
const EN_CHAPTER = /^(Chapter|Section|Part|Lesson|Unit)\s+[\dIVXLC]+([.:：\s].{0,60})?$/i
const NUMBERED_TITLE = /^(\d{1,2}([.、]\d{1,2}){0,2})[.、\s]+(.{2,60})$/
const TOC_HEADING = /^(目\s*录|contents|table of contents)$/i
/** Trailing page number with leaders: `标题 …… 12` / `Title ..... 3` */
const TOC_LINE_PAGE =
  /^(.*?)(?:\s*[\.·．…⋯﹣\-—_]{2,}\s*|\s+)(\d{1,4})\s*$/
const PAGE_MARKER_LINE = /^【第\s*\d+\s*页(?:\/\d+)?】/

function cleanTitle(raw: string): string {
  return raw
    // PDF.js bookmarks often append NUL / other controls to titles.
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/^【第\s*\d+\s*页(?:\/\d+)?】\s*/g, '')
    .replace(/^#+\s*/, '')
    .replace(/[\.·．…⋯﹣\-—_]{2,}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Compact form for matching front-matter noise (封面 / 目录 / …). */
function normalizeNoiseKey(title: string): string {
  return title
    .normalize('NFKC')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\.[A-Za-z0-9]{1,8}$/i, '')
    .replace(/[《》〈〉【】\[\]（）()「」『』"'“”‘’]/g, '')
    .replace(/\s+/g, '')
    .toLowerCase()
}

const OUTLINE_NOISE_KEYS = new Set([
  '封面',
  '封面页',
  '封面图',
  '封底',
  '封底页',
  '版权页',
  '版权',
  '目录',
  '目录页',
  '目次',
  'contents',
  'tableofcontents',
  'toc',
  '索引',
  '前言',
  '序言',
  '序',
  '跋',
  '内封',
  '绪言',
  '绪论',
  '引言',
  '导言',
  '导论',
])

/** True for front-matter titles that must never become sidebar chapters. */
export function isCourseOutlineNoiseTitle(title: string): boolean {
  const cleaned = cleanTitle(title)
  if (!cleaned) return true
  if (cleaned.length > MAX_TITLE_LEN) return true
  if (/^[\d\s./\-—–]+$/.test(cleaned)) return true
  const key = normalizeNoiseKey(cleaned)
  if (!key) return true
  if (OUTLINE_NOISE_KEYS.has(key)) return true
  // e.g. "封面 1", "目录i", "Cover", "Table of Contents"
  if (/^(封面|封底|目录|目次|版权页?)(\d+|[ivxlc]+|页|图)?$/i.test(key)) return true
  if (/^(cover|contents?|tableofcontents|toc)$/i.test(key)) return true
  // 绪言 is front matter, not a teachable chapter, even with a subtitle.
  if (/^(绪言|绪论|引言|导言|导论)/.test(key)) return true
  return false
}

function isNoiseTitle(title: string): boolean {
  if (isCourseOutlineNoiseTitle(title)) return true
  return title.length < MIN_TITLE_LEN || title.length > MAX_TITLE_LEN
}

const EMBEDDED_UNIT = /第[一二三四五六七八九十百千零〇两0-9]+\s*[章节篇讲课部回]/g
const REVIEW_TAIL =
  /^(.*?)\s+\d{1,4}\s+(整理与提升|本章小结|本章复习|复习与提高|实验活动|实践活动|本章测评|复习题)(.*)$/

function stripTrailingPage(part: string): string {
  return part.replace(/\s+\d{1,4}\s*$/, '').trim()
}

/** Split a TOC row that glued several 节 (and a trailing 整理与提升) into one title. */
export function splitGluedTocTitle(raw: string): string[] {
  const text = raw
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!text) return []

  const indexes: number[] = []
  for (const match of text.matchAll(EMBEDDED_UNIT)) {
    if (match.index != null) indexes.push(match.index)
  }
  const hasReview = REVIEW_TAIL.test(text)
  // A single heading in the middle of a sentence is not a glued TOC row.
  if (indexes.length < 2 && !hasReview) return [text]

  const chunks: string[] =
    indexes.length < 2
      ? [text]
      : [
          ...(indexes[0]! > 0 ? [text.slice(0, indexes[0])] : []),
          ...indexes.map((start, index) => text.slice(start, indexes[index + 1] ?? text.length)),
        ]

  const pieces: string[] = []
  for (const chunk of chunks) {
    const review = chunk.trim().match(REVIEW_TAIL)
    if (review) {
      pieces.push(stripTrailingPage(review[1] ?? ''), `${review[2] ?? ''}${review[3] ?? ''}`.trim())
    } else {
      pieces.push(stripTrailingPage(chunk))
    }
  }
  return pieces.map((piece) => piece.trim()).filter((piece) => piece.length >= MIN_TITLE_LEN)
}

function pushUnique(
  entries: CourseOutlineEntry[],
  seen: Set<string>,
  title: string,
  level: number,
): void {
  const pieces = splitGluedTocTitle(title)
  const units = pieces.length > 0 ? pieces : [title]
  for (const piece of units) {
    const cleaned = cleanTitle(piece)
    if (isNoiseTitle(cleaned)) continue
    const key = cleaned.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    const pieceLevel = units.length > 1 ? inferLevel(cleaned) : level
    entries.push({ title: cleaned, level: Math.max(1, Math.min(3, pieceLevel)) })
  }
}

function inferLevel(title: string): number {
  if (/^第[一二三四五六七八九十百千零〇两0-9]+章/.test(title)) return 1
  if (/^第\s*\d+\s*章/.test(title)) return 1
  if (/^Chapter\s+/i.test(title)) return 1
  if (/^第[一二三四五六七八九十百千零〇两0-9]+[节讲课]/.test(title)) return 2
  if (/^第\s*\d+\s*[节讲课]/.test(title)) return 2
  if (/^\d+\.\d+/.test(title)) return 2
  if (/^[（(]?[一二三四五六七八九十]+[)）]、/.test(title)) return 2
  if (/^[一二三四五六七八九十]+[、.．]/.test(title)) return 2
  return 1
}

function looksLikeTocEntry(line: string): boolean {
  const cleaned = cleanTitle(line)
  if (isNoiseTitle(cleaned)) return false
  if (CN_CHAPTER.test(cleaned) || EN_CHAPTER.test(cleaned)) return true
  if (NUMBERED_TITLE.test(cleaned)) return true
  if (TOC_LINE_PAGE.test(line) && cleaned.length >= MIN_TITLE_LEN) return true
  // Short title lines common inside TOC blocks (no page number after OCR).
  if (cleaned.length <= 40 && /[\u4e00-\u9fff]/.test(cleaned) && !/[。！？；]/.test(cleaned)) {
    return /^(第|[一二三四五六七八九十]|[（(]?\d|[（(]?[一二三四五六七八九十]+[)）])/.test(
      cleaned,
    )
  }
  return false
}

function parseTocEntryTitle(rawLine: string): string | null {
  const trimmed = rawLine.trim()
  if (!trimmed || PAGE_MARKER_LINE.test(trimmed) || TOC_HEADING.test(cleanTitle(trimmed))) {
    return null
  }

  const withPage = trimmed.match(TOC_LINE_PAGE)
  const candidate = withPage ? withPage[1]! : trimmed
  const title = cleanTitle(candidate)
  if (isNoiseTitle(title)) return null
  if (!looksLikeTocEntry(trimmed) && !looksLikeTocEntry(title)) return null
  return title
}

/**
 * Extract entries from an in-document 目录 / Contents block (most textbooks use this
 * instead of PDF bookmarks).
 */
export function extractOutlineFromTocSection(plainText: string): CourseOutlineEntry[] {
  const text = plainText.replace(/\r\n/g, '\n')
  if (!text.trim()) return []

  const lines = text.split('\n')
  let start = -1
  for (let i = 0; i < lines.length; i += 1) {
    const line = cleanTitle(lines[i] ?? '')
    if (TOC_HEADING.test(line)) {
      start = i + 1
      break
    }
  }
  if (start < 0) return []

  const entries: CourseOutlineEntry[] = []
  const seen = new Set<string>()
  let misses = 0
  const maxMisses = 8
  // TOC is near the front; stop after enough content past the heading.
  const end = Math.min(lines.length, start + 400)

  for (let i = start; i < end; i += 1) {
    if (entries.length >= MAX_OUTLINE_ENTRIES) break
    const raw = (lines[i] ?? '').trim()
    if (!raw) {
      // Blank lines are common between TOC rows; don't count as miss yet.
      if (entries.length > 0) misses += 1
      if (misses >= maxMisses && entries.length >= 2) break
      continue
    }

    // Leaving the TOC into body prose / next major front-matter.
    if (
      entries.length >= 2 &&
      (/^(前言|序言|引言|绪论|正文|自序|写在前面)/.test(cleanTitle(raw)) ||
        (raw.length > 60 && /[。！？]/.test(raw)))
    ) {
      break
    }

    const glued = splitGluedTocTitle(raw)
    if (glued.length > 1) {
      misses = 0
      for (const piece of glued) pushUnique(entries, seen, piece, inferLevel(piece))
      continue
    }

    const title = parseTocEntryTitle(raw)
    if (!title) {
      misses += 1
      if (misses >= maxMisses && entries.length >= 2) break
      continue
    }

    misses = 0
    pushUnique(entries, seen, title, inferLevel(title))
  }

  return entries
}

/**
 * Heuristic course outline from whole-document headings (fallback when no 目录 block).
 */
export function extractCourseOutlineFromText(plainText: string): CourseOutlineEntry[] {
  const text = plainText.replace(/\r\n/g, '\n')
  if (!text.trim()) return []

  const entries: CourseOutlineEntry[] = []
  const seen = new Set<string>()
  const lines = text.split('\n')

  for (const rawLine of lines) {
    if (entries.length >= MAX_OUTLINE_ENTRIES) break
    const trimmed = rawLine.trim()
    if (!trimmed) continue

    const md = trimmed.match(MARKDOWN_HEADING)
    if (md) {
      pushUnique(entries, seen, md[2]!, md[1]!.length)
      continue
    }

    const line = cleanTitle(trimmed)
    if (!line) continue

    const glued = splitGluedTocTitle(line)
    if (glued.length > 1) {
      for (const piece of glued) pushUnique(entries, seen, piece, inferLevel(piece))
      continue
    }

    if (CN_CHAPTER.test(line)) {
      pushUnique(entries, seen, line, inferLevel(line))
      continue
    }

    if (EN_CHAPTER.test(line)) {
      pushUnique(entries, seen, line, 1)
      continue
    }

    const numbered = line.match(NUMBERED_TITLE)
    if (numbered && line.length <= 40) {
      pushUnique(entries, seen, line, numbered[2] ? 2 : 1)
    }
  }

  return entries
}

export type PdfOutlineNode = {
  title?: string | null
  items?: PdfOutlineNode[] | null
}

/** Flatten PDF bookmark tree into sidebar-friendly chapter rows. */
export function flattenPdfOutline(
  nodes: PdfOutlineNode[] | null | undefined,
  options?: { maxDepth?: number; maxEntries?: number },
): CourseOutlineEntry[] {
  const maxDepth = options?.maxDepth ?? 2
  const maxEntries = options?.maxEntries ?? MAX_OUTLINE_ENTRIES
  const entries: CourseOutlineEntry[] = []
  const seen = new Set<string>()

  const walk = (list: PdfOutlineNode[] | null | undefined, depth: number) => {
    if (!list || depth > maxDepth || entries.length >= maxEntries) return
    for (const node of list) {
      if (entries.length >= maxEntries) break
      pushUnique(entries, seen, node.title ?? '', depth)
      if (node.items?.length) walk(node.items, depth + 1)
    }
  }

  walk(nodes, 1)
  return entries
}

/** Prefer PDF bookmarks → in-body 目录 block → scattered heading heuristics. */
export function resolveCourseOutline(options: {
  pdfOutline?: PdfOutlineNode[] | null
  plainText?: string | null
}): CourseOutlineEntry[] {
  const fromPdf = flattenPdfOutline(options.pdfOutline)
  if (fromPdf.length >= 2) return fromPdf

  const text = options.plainText ?? ''
  const fromToc = extractOutlineFromTocSection(text)
  if (fromToc.length >= 2) return fromToc

  const fromText = extractCourseOutlineFromText(text)
  if (fromText.length >= 2) return fromText

  return fromPdf.length > 0 ? fromPdf : fromToc.length > 0 ? fromToc : fromText
}
