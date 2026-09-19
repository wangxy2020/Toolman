/** Split text into paragraphs for side-by-side alignment. */
export function splitTranslationParagraphs(text: string): string[] {
  const normalized = text.replace(/\r\n/g, '\n')
  if (!normalized.trim()) return ['']

  if (/\n\s*\n/.test(normalized)) {
    return normalized.split(/\n\s*\n+/).map((part) => part.replace(/\s+$/g, ''))
  }

  return normalized.split('\n').map((part) => part.replace(/\s+$/g, ''))
}

/** At most one blank line in the source; display spacing comes from paragraph CSS. */
export function normalizeTranslationDisplayText(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

const CJK_RE = /[\u3400-\u9fff\uf900-\ufaff]/
const LIST_OR_HEADING_RE = /^\s*(?:#{1,6}\s|\d+[\.、．)]\s|[a-zA-Z]\)\s|[-*+]\s|[（(]\d+[）)]\s)/
const LETTER_META_RE =
  /^(?:dear|yours|sincerely|faithfully|regards|to:|from:|date:|ref:|subject:|attn)\b|^(?:尊敬的|此致|敬礼|收件|发件|日期|编号|事由|主题|抄送|地址|电话|手机|传真|邮编|邮件|邮箱)/i
const DATE_LINE_RE =
  /(?:\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)|\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2})/i
const ADDRESS_PREFIX_RE = /^(?:no\.|tel\.|fax\.|p\.?o\.?\s*box|mobile)\b/i
const NEW_PARAGRAPH_START_RE =
  /^(?:因此|为此|故此|据此|综上|此外|另外|然而|但是|不过|同时|现将|现就|关于|根据|依据|鉴于|我方|我公司|本公司|特此|兹)|^(?:We\s+refer|We\s+hereby|We\s+write|In\s+accordance|Reference\s+is|This\s+letter|Accordingly|Therefore|However|Furthermore|Moreover)\b/i
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
const PHONE_RE = /(?:电话|手机|传真|Tel\.?|Fax\.?|Mobile|Phone)\s*[:：]|^\+\d{1,3}[\s-]?\d/i
const SECTION_HEADING_RE = /^\d+[\.、．]\s+\S.{0,90}$/

function displayLineLength(line: string): number {
  return Array.from(line.trim()).length
}

function looksLikeLetterMetaLine(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed) return false
  if (LETTER_META_RE.test(trimmed) || ADDRESS_PREFIX_RE.test(trimmed)) {
    return true
  }
  return displayLineLength(trimmed) <= 40 && DATE_LINE_RE.test(trimmed)
}

export function looksLikeContactLine(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed) return false
  if (EMAIL_RE.test(trimmed) || PHONE_RE.test(trimmed)) return true
  if (/^(?:中国|地址)[:：]?/.test(trimmed)) return true
  if (/\d+号/.test(trimmed) && /(?:路|街|道|巷|市)/.test(trimmed)) return true
  return looksLikeLetterMetaLine(trimmed)
}

function looksLikeHeadingOrList(line: string): boolean {
  return LIST_OR_HEADING_RE.test(line)
}

function looksLikeLabelLine(line: string): boolean {
  return /^.{1,12}[:：]/.test(line.trim())
}

function endsCompleteSentence(line: string): boolean {
  return /[。！？；.!?;:：」』]$/.test(line.trim())
}

function looksLikeNewParagraphStart(line: string): boolean {
  return NEW_PARAGRAPH_START_RE.test(line.trim())
}

function looksLikeEnglishParagraphStart(line: string): boolean {
  const trimmed = line.trim()
  return /^[A-Z]/.test(trimmed) && displayLineLength(trimmed) >= 24
}

function shouldKeepCjkLinesSeparate(previous: string, next: string): boolean {
  return (
    CJK_RE.test(previous) &&
    CJK_RE.test(next) &&
    endsCompleteSentence(previous) &&
    displayLineLength(next) >= 8
  )
}

export function looksLikeTranslationSectionHeading(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed || /[。！？]/.test(trimmed) || /\.\s*$/.test(trimmed)) return false
  return SECTION_HEADING_RE.test(trimmed) && displayLineLength(trimmed) <= 90
}

function isShortLetterheadLine(line: string): boolean {
  return (
    (looksLikeContactLine(line) || looksLikeLetterMetaLine(line)) &&
    displayLineLength(line) <= 88
  )
}

/** Unpack letterhead/body that the model glued onto one line. */
export function unpackTranslationLayoutHints(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/(@[A-Za-z0-9.-]+\.[A-Za-z]{2,})(?=因此|为此|故此|据此|综上|现将|我方|我们请求)/g, '$1\n')
    .replace(/([;；。！])(?=因此|为此|故此|据此|综上)/g, '$1\n')
    .replace(/(\d+号)(?=因此|为此|故此|据此|综上|现将|我方|我们请求)/g, '$1\n')
    .replace(/((?:\d{1,3},)*\d+(?:\.\d+)?)(?=因此|为此|故此|据此|综上)/g, '$1\n')
    .replace(/(主题[:：][^\n]{4,}?)(?=我方提及|我方参考|我方谨|现将|We\s+refer|Reference\s+is)/g, '$1\n')
    .replace(/(申请请求|来函如下|如下)(?=我方提及|我方参考|We\s+refer)/g, '$1\n')
    .replace(/([。！？])(\d+[\.、．]\s+\S)/g, '$1\n$2')
    .replace(
      /(^|\n)(\d+[\.、．]\s+[^\n。]{2,48}?)(?=(?:所有金额|根据|我方|现将|All amounts|The total|We ))/g,
      '$1$2\n',
    )
}

function shouldJoinTranslationLines(previous: string, next: string): boolean {
  if (!previous.trim() || !next.trim()) return false
  if (
    looksLikeHeadingOrList(next) ||
    looksLikeTranslationSectionHeading(next) ||
    looksLikeLetterMetaLine(next) ||
    looksLikeContactLine(next) ||
    looksLikeLabelLine(next) ||
    looksLikeNewParagraphStart(next)
  ) {
    return false
  }
  if (endsCompleteSentence(previous) && looksLikeEnglishParagraphStart(next)) return false
  if (shouldKeepCjkLinesSeparate(previous, next)) return false
  if (looksLikeHeadingOrList(previous) && displayLineLength(previous) <= 42) return false
  if (looksLikeTranslationSectionHeading(previous)) return false
  if (isShortLetterheadLine(previous)) return false
  if (CJK_RE.test(previous) && CJK_RE.test(next) && displayLineLength(previous) >= 8) {
    return true
  }
  if (displayLineLength(previous) < 42) return false
  return true
}

function joinTranslationLines(previous: string, next: string): string {
  if (CJK_RE.test(previous.slice(-1)) || CJK_RE.test(next[0] ?? '')) return previous + next
  if (/[-–—]$/.test(previous)) return previous + next
  return `${previous} ${next}`
}

function shouldBreakParagraph(previous: string, next: string): boolean {
  if (!previous || !next || previous === '' || next === '') return false
  if (looksLikeTranslationSectionHeading(next) || looksLikeTranslationSectionHeading(previous)) {
    return true
  }
  if (
    looksLikeNewParagraphStart(next) &&
    (endsCompleteSentence(previous) ||
      looksLikeContactLine(previous) ||
      looksLikeLetterMetaLine(previous) ||
      looksLikeLabelLine(previous))
  ) {
    return true
  }
  if (endsCompleteSentence(previous) && looksLikeEnglishParagraphStart(next)) return true
  if (shouldKeepCjkLinesSeparate(previous, next)) return true
  if (
    isShortLetterheadLine(previous) &&
    !looksLikeContactLine(next) &&
    !looksLikeLetterMetaLine(next) &&
    !looksLikeLabelLine(next)
  ) {
    return true
  }
  return false
}

/** Join model/PDF soft wraps so body text fills the page width; keep letter-head breaks. */
export function reflowTranslationDisplayLines(text: string): string {
  const lines = normalizeTranslationDisplayText(unpackTranslationLayoutHints(text)).split('\n')
  const output: string[] = []
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) {
      if (output.length === 0 || output[output.length - 1] !== '') output.push('')
      continue
    }
    const previous = output[output.length - 1]
    if (previous && previous !== '' && shouldJoinTranslationLines(previous, line)) {
      output[output.length - 1] = joinTranslationLines(previous, line)
      continue
    }
    if (previous && previous !== '' && shouldBreakParagraph(previous, line)) output.push('')
    output.push(line)
  }
  while (output[0] === '') output.shift()
  while (output[output.length - 1] === '') output.pop()
  return output.join('\n')
}

/** Split on blank lines so each block is a paragraph, not an empty row in pre-wrap. */
export function splitTranslationDisplayParagraphs(text: string): string[] {
  const normalized = reflowTranslationDisplayLines(text)
  if (!normalized) return []

  if (/\n\s*\n/.test(normalized)) {
    return normalized
      .split(/\n\s*\n+/)
      .map((part) => part.trim())
      .filter(Boolean)
  }

  return [normalized]
}

/**
 * CommonMark joins a single newline into a space. Letter heads and short
 * source lines must stay on their own row after markdown render.
 */
export function withMarkdownHardLineBreaks(text: string): string {
  return reflowTranslationDisplayLines(text).replace(/([^\n])\n(?!\n)/g, '$1  \n')
}

/** Keep newlines inside HTML text nodes (ODL often emits one `<p>` per page block). */
export function withHtmlTextLineBreaks(html: string): string {
  const withBreaks = html.replace(/\r\n/g, '\n').replace(/>([^<]+)</g, (_match, text: string) => {
    if (!text.includes('\n')) return `>${text}<`
    const reflowed = reflowTranslationDisplayLines(text)
    if (!reflowed.includes('\n')) return `>${reflowed}<`
    return `>${reflowed.replace(/\n+/g, '<br>')}<`
  })
  return withBreaks
    .replace(/<(p|div|h[1-6]|li)>\s*(?:<br\s*\/?>\s*)+/gi, '<$1>')
    .replace(/<p>\s*(?:<br\s*\/?>\s*)*<\/p>/gi, '')
    .replace(/<br\s*\/?>\s*<\/(p|div|h[1-6]|li)>/gi, '</$1>')
    .replace(/(?:<br\s*\/?>\s*){2,}/gi, '<br>')
}

export function joinTranslationParagraphs(paragraphs: string[]): string {
  // Word lists (one token per paragraph) keep single newlines — one model call, easy alignment.
  const allSingleLine = paragraphs.every((part) => !part.includes('\n'))
  return paragraphs.join(allSingleLine ? '\n' : '\n\n')
}

/**
 * Contrast view: prefer reflowed letter paragraphs, then raw newline splits.
 * Avoid treating a whole pasted page as one block opposite many target paragraphs.
 */
export function splitContrastParagraphs(text: string): string[] {
  const normalized = text.replace(/\r\n/g, '\n')
  if (!normalized.trim()) return ['']

  const display = splitTranslationDisplayParagraphs(normalized)
  if (display.length > 1) return display

  const raw = splitTranslationParagraphs(normalized)
  return raw.length > 0 ? raw : ['']
}
