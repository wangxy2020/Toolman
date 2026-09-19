import { formatPdfPageMarker } from '../parsers/pdf-page-markers.js'

const DOCUMENT_EXT_PATTERN = /\.(pdf|docx?|txt|markdown|md|pptx|xlsx?|csv)$/i

const CN_DIGIT_VALUES: Record<string, number> = {
  零: 0,
  〇: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
}

export interface ChapterQueryHint {
  chapterNumber: number
  labels: string[]
}

export function parseChapterNumberToken(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (/^\d+$/.test(trimmed)) {
    const value = Number(trimmed)
    return Number.isFinite(value) && value > 0 ? value : null
  }

  if (trimmed === '十') return 10
  if (trimmed.startsWith('十')) {
    const ones = CN_DIGIT_VALUES[trimmed.slice(1)]
    return ones != null ? 10 + ones : null
  }
  if (trimmed.endsWith('十') && trimmed.length === 2) {
    const tens = CN_DIGIT_VALUES[trimmed[0]!]
    return tens != null ? tens * 10 : null
  }
  if (trimmed.includes('十')) {
    const [tensToken, onesToken] = trimmed.split('十')
    const tens = CN_DIGIT_VALUES[tensToken ?? '']
    const ones = CN_DIGIT_VALUES[onesToken ?? '']
    if (tens != null && ones != null) return tens * 10 + ones
  }
  const single = CN_DIGIT_VALUES[trimmed]
  return single != null && single > 0 ? single : null
}

function chapterNumberToChinese(n: number): string {
  if (n <= 10) {
    return ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'][n] ?? String(n)
  }
  if (n < 20) return `十${['', '一', '二', '三', '四', '五', '六', '七', '八', '九'][n - 10]}`
  const tens = Math.floor(n / 10)
  const ones = n % 10
  const tensLabel = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'][tens] ?? String(tens)
  if (ones === 0) return `${tensLabel}十`
  const onesLabel = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'][ones] ?? String(ones)
  return `${tensLabel}十${onesLabel}`
}

const EN_CHAPTER_WORDS = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
]

export function chapterQueryLabels(chapterNumber: number): string[] {
  const chinese = chapterNumberToChinese(chapterNumber)
  const labels = [
    `第${chinese}章`,
    `第 ${chinese} 章`,
    `第${chapterNumber}章`,
    `第 ${chapterNumber} 章`,
    `Chapter ${chapterNumber}`,
  ]
  const word = EN_CHAPTER_WORDS[chapterNumber]
  if (word) labels.push(`Chapter ${word}`)
  return labels
}

/** Chapter queries such as 「第五章」/「第5章」/「Chapter 5」. Does not treat 页 as a chapter. */
export function extractChapterQueryHint(query: string): ChapterQueryHint | null {
  const trimmed = query.trim()
  if (!trimmed) return null

  const cnMatch = trimmed.match(/第\s*([一二三四五六七八九十百零〇两\d]+)\s*章/)
  if (cnMatch?.[1]) {
    const chapterNumber = parseChapterNumberToken(cnMatch[1])
    if (chapterNumber) {
      return { chapterNumber, labels: chapterQueryLabels(chapterNumber) }
    }
  }

  const enMatch = trimmed.match(/\b(?:chapter|ch\.?)\s*(\d+)\b/i)
  if (enMatch?.[1]) {
    const chapterNumber = Number(enMatch[1])
    if (Number.isFinite(chapterNumber) && chapterNumber > 0) {
      return { chapterNumber, labels: chapterQueryLabels(chapterNumber) }
    }
  }

  const enWordMatch = trimmed.match(
    /\b(?:chapter|ch\.?)\s+(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/i,
  )
  if (enWordMatch?.[1]) {
    const word = enWordMatch[1].toLowerCase()
    const chapterNumber = EN_CHAPTER_WORDS.findIndex((item) => item.toLowerCase() === word)
    if (chapterNumber > 0) {
      return { chapterNumber, labels: chapterQueryLabels(chapterNumber) }
    }
  }

  return null
}

export function chunkTextMatchesChapter(text: string, hint: ChapterQueryHint): boolean {
  if (new RegExp(`第\\s*${hint.chapterNumber}(?!\\d)\\s*章`).test(text)) return true
  if (new RegExp(`\\bChapter\\s+${hint.chapterNumber}\\b`, 'i').test(text)) return true
  const word = EN_CHAPTER_WORDS[hint.chapterNumber]
  if (word && new RegExp(`\\bChapter\\s+${word}\\b`, 'i').test(text)) return true

  for (const match of text.matchAll(/第\s*([一二三四五六七八九十百零〇两\d]+)\s*章/g)) {
    if (parseChapterNumberToken(match[1] ?? '') === hint.chapterNumber) return true
  }
  return false
}

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

  const bookTitle = trimmed.match(/《([^》]{2,80})》/)
  if (bookTitle?.[1]) return bookTitle[1].trim()

  const withFileBeforePage = trimmed.match(
    /(?:本地)?知识库\s*中\s*(.+?)\s*(?:文件|文档)\s*第\s*\d+\s*页/i,
  )
  if (withFileBeforePage?.[1]) {
    const candidate = withFileBeforePage[1].trim()
    if (candidate.length >= 3) return candidate
  }

  const beforeChapter = trimmed.match(
    /(.+?)(?:中|里|内)?[，,]?\s*第\s*[一二三四五六七八九十百零〇两\d]+\s*章/,
  )
  if (beforeChapter?.[1]) {
    const candidate = beforeChapter[1]
      .replace(/^(?:搜索|查找|在|从|本地知识库|知识库|中|\s)+/u, '')
      .replace(/\s*(?:文件|文档|这本书|该书)$/u, '')
      .replace(/[《》]/g, '')
      .trim()
    if (candidate.length >= 2 && candidate.length <= 80) return candidate
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

  const chapterHint = extractChapterQueryHint(query)
  if (chapterHint) {
    for (const label of chapterHint.labels) {
      if (!enhanced.includes(label)) {
        enhanced = `${enhanced} ${label}`
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
