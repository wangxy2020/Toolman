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
/** Arabic / letter / roman list markers (i. ii. iii. iv …). Longer roman first. */
const ROMAN_LIST_MARKER_RE =
  /(?:xiv|xv|xiii|xii|viii|vii|iii|ii|iv|ix|vi|xi|x|v|i)(?:\s*[.、．:：)]\s*|\s+)(?=[A-Z(\u3400-\u9fff])/i
/**
 * Heading / list starters. No global `i` flag. Digit+space without `.` only
 * matches OCR section titles like "3 DISCUSSION" (2+ consecutive caps / CJK),
 * not date wraps like "5 September 2026".
 */
const OUTLINE_STARTER_CHARS = String.raw`[A-Z(\u3400-\u9fff"“]`
const ROMAN_LOWER_RE = '(?:xiv|xv|xiii|xii|viii|vii|iii|ii|iv|ix|vi|xi|x|v|i)'
/** Nested outline markers: `1.1 Text`, `1.1.1 Text`, `(a) text`, `(ii) text`, `i. text`, `a. Text`. */
const NESTED_OUTLINE_START_SRC = [
  String.raw`\d{1,2}(?:\.\d{1,2}){1,4}\.?\s+(?=${OUTLINE_STARTER_CHARS})`,
  String.raw`[（(](?:\d{1,2}|[a-z]|[A-Z]|[ivxlc]{1,6})[）)]\s*(?=\S)`,
  String.raw`${ROMAN_LOWER_RE}[.)]\s+(?=[a-z])`,
  String.raw`[a-z]\.\s+(?=${OUTLINE_STARTER_CHARS})`,
].join('|')
/** Marker-only line (`1.1`, `(a)`, `ii.`) — text follows on the next line. */
const NESTED_OUTLINE_MARKER_ONLY_RE = new RegExp(
  String.raw`^(?:\d{1,2}(?:\.\d{1,2}){1,4}\.?|[（(](?:\d{1,2}|[a-zA-Z]|[ivxlc]{1,6})[）)]|${ROMAN_LOWER_RE}[.)]|[a-z][.)])$`,
)
const LIST_OR_HEADING_RE = new RegExp(
  String.raw`^\s*(?:#{1,6}\s|\d{1,2}[.、．)]\s+|\d{1,2}\s+(?=[A-Z]{2,}|[\u3400-\u9fff])|[a-zA-Z]\)\s|[-*+]\s|[（(]\d+[）)]\s|${NESTED_OUTLINE_START_SRC}|${ROMAN_LIST_MARKER_RE.source})`,
)
const LETTER_META_RE =
  /^(?:dear|yours|sincerely|faithfully|regards|to:|from:|date:|ref:|subject:|attn)\b|^(?:尊敬的|此致|敬礼|收件|发件|日期|编号|事由|主题|抄送|地址|电话|手机|传真|邮编|邮件|邮箱)/i
const DATE_LINE_RE =
  /(?:\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)|\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2})/i
const ADDRESS_PREFIX_RE = /^(?:no\.|tel\.|fax\.|p\.?o\.?\s*box|mobile)\b/i
const NEW_PARAGRAPH_START_RE =
  /^(?:因此|为此|故此|据此|综上|此外|另外|然而|但是|不过|同时|现将|现就|关于|根据|依据|鉴于|我方|我公司|本公司|特此|兹)|^(?:We\s+refer|We\s+hereby|We\s+write|In\s+accordance|Reference\s+is|This\s+letter|Accordingly|Therefore|However|Furthermore|Moreover)\b/i
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
const PHONE_RE = /(?:电话|手机|传真|Tel\.?|Fax\.?|Mobile|Phone)\s*[:：]|^\+\d{1,3}[\s-]?\d/i
/** "3. DISCUSSION…" or OCR-lossy "3 DISCUSSION…" */
const SECTION_HEADING_RE = /^\d{1,2}(?:[.、．]\s*|\s+)[A-Z\u3400-\u9fff].{0,90}$/

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
  const trimmed = line.trim()
  if (!trimmed) return false
  if (ROMAN_LIST_MARKER_RE.test(trimmed)) return true
  return LIST_OR_HEADING_RE.test(trimmed)
}

/** A marker-only line (`1.1`, `(a)`) starts a new outline row — never glue it onto the previous line. */
function startsOutlineRow(line: string): boolean {
  return looksLikeHeadingOrList(line) || NESTED_OUTLINE_MARKER_ONLY_RE.test(line.trim())
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
  if (!/^[A-Z]/.test(trimmed) || displayLineLength(trimmed) < 24) return false
  // Prefer discourse/sentence openers — not mid-wrap Proper Nouns ("Same and Bukoba").
  return /^(?:The|This|That|These|Those|We|You|Your|Our|I|It|They|He|She|A|An|In|On|At|For|With|Without|According|Accordingly|However|Therefore|Furthermore|Moreover|Additionally|Please|Kindly|Reference|Regarding|Subject|Dear|Yours|Payment|Work|Employer|Contractor|Scope|Item|All|Any|No|Neither|Either)\b/.test(
    trimmed,
  )
}

/** Previous line likely soft-wrapped (ends with a function word / preposition). */
const ENGLISH_SOFT_WRAP_END_RE =
  /\b(?:a|an|the|and|or|but|of|to|for|in|on|at|by|with|from|as|into|about|than|then|that|which|who|whom|whose|is|are|was|were|be|been|being|have|has|had|will|would|shall|should|can|could|may|might|must|regarding|concerning)$/i

function looksLikeCjkParagraphStart(line: string): boolean {
  return /^(?:因此|为此|故此|据此|综上|此外|另外|然而|但是|不过|同时|现将|现就|关于|根据|依据|鉴于|我方|我公司|本公司|特此|兹|雇主|承包商|付款|合同|双方|各方|顾问)/.test(
    line.trim(),
  )
}

function shouldKeepCjkLinesSeparate(previous: string, next: string): boolean {
  if (!CJK_RE.test(previous) || !CJK_RE.test(next)) return false
  if (endsCompleteSentence(previous) && displayLineLength(next) >= 8) return true
  // ODL often drops `。` — separate long blocks only when the next line looks new.
  if (displayLineLength(previous) >= 18 && displayLineLength(next) >= 12) {
    if (/[，、；,;的了和与及或为在将等与以把被从上到对把下]$/.test(previous.trim())) return false
    if (looksLikeCjkParagraphStart(next) || looksLikeNewParagraphStart(next)) return true
    return false
  }
  return false
}

export function looksLikeTranslationSectionHeading(line: string): boolean {
  // Strip markdown ATX markers so "# 1. Breakdown of the Claim" counts as a body heading.
  const trimmed = line.trim().replace(/^#{1,6}\s+/, '')
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
    // Glued roman-numeral list items: "...company. ii Performance Security:"
    .replace(
      /([.!?。！？])\s*((?:xiv|xv|xiii|xii|viii|vii|iii|ii|iv|ix|vi|xi|x|v|i)\s*[.、．:：)]?\s*)(?=[A-Z])/gi,
      '$1\n$2',
    )
    .replace(
      /([a-z)\]])\s+((?:xiv|xv|xiii|xii|viii|vii|iii|ii|iv|ix|vi|xi|x|v|i)\s*[.、．:：)]?\s+)(?=[A-Z][a-zA-Z])/gi,
      '$1\n$2',
    )
    // OCR-lossy "1 Power of Attorney" / "3 DISCUSSION" section starts mid-stream.
    // `(?<!\d)`: the dot in outline numbers like "1.1 The…" is not a sentence end.
    .replace(/(?<!\d)([.!?。！？])\s*(\d{1,2}\s+)(?=[A-Z][A-Za-z]{2,})/g, '$1\n$2')
    // Glued nested outline markers: "… Works. 1.1 The …", "…; (a) design".
    .replace(
      /([.!?;；:。！？])\s+(\d{1,2}(?:\.\d{1,2}){1,4}\.?\s+)(?=[A-Z(\u3400-\u9fff])/g,
      '$1\n$2',
    )
    .replace(/([.!?;；:。！？])\s+([（(](?:[a-z]|[ivxlc]{1,6}|\d{1,2})[）)]\s+)(?=[A-Za-z])/g, '$1\n$2')
    .replace(
      /(^|\n)(\d+[\.、．]\s+[^\n。]{2,48}?)(?=(?:所有金额|根据|我方|现将|All amounts|The total|We ))/g,
      '$1$2\n',
    )
}

/** ODL/OCR title pages often emit one token per line — median length stays tiny. */
export function isFragmentedLineLayout(lines: string[]): boolean {
  const nonEmpty = lines.map((line) => line.trim()).filter(Boolean)
  if (nonEmpty.length < 8) return false
  const lengths = nonEmpty.map(displayLineLength)
  const short = lengths.filter((length) => length <= 18).length
  if (short / lengths.length >= 0.55) return true
  const sorted = [...lengths].sort((left, right) => left - right)
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0
  return median <= 12 && nonEmpty.length >= 10
}

const FIELD_LABEL_LINE_RE =
  /^(?:PROJECT|EMPLOYER|CONTRACTOR|CONTRACT(?:\s+TITLE|\s+REF\.?)?|CLIENT|OWNER|DATE|REF|SUBJECT|GOVERNING\s+CONTRACT)[:：]/i

function isFieldLabelLine(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed || displayLineLength(trimmed) > 42) return false
  return FIELD_LABEL_LINE_RE.test(trimmed)
}

function looksLikeTitlePageToken(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed || displayLineLength(trimmed) > 48) return false
  if (isFieldLabelLine(trimmed)) return false
  return /^[A-Z0-9][A-Z0-9\s/&.,'()-]{0,47}$/.test(trimmed)
}

function shouldJoinFragmentedLines(previous: string, next: string): boolean {
  if (!previous.trim() || !next.trim()) return false
  if (
    startsOutlineRow(next) ||
    looksLikeTranslationSectionHeading(next) ||
    looksLikeLetterMetaLine(next) ||
    looksLikeContactLine(next) ||
    looksLikeNewParagraphStart(next)
  ) {
    return false
  }
  // New field label starts a block — do not glue onto the previous value.
  if (isFieldLabelLine(next) || (looksLikeLabelLine(next) && displayLineLength(next) <= 48)) {
    return false
  }
  // ODL cover pages emit one ALL-CAPS token per line — join into readable phrases.
  if (looksLikeTitlePageToken(previous) && looksLikeTitlePageToken(next)) return true
  if ((isFieldLabelLine(previous) || looksLikeLabelLine(previous)) && looksLikeTitlePageToken(next)) {
    return true
  }
  if (endsCompleteSentence(previous) && looksLikeEnglishParagraphStart(next)) return false
  if (shouldKeepCjkLinesSeparate(previous, next)) return false
  if (looksLikeHeadingOrList(previous) && displayLineLength(previous) <= 42) return false
  if (looksLikeTranslationSectionHeading(previous)) return false
  if (isShortLetterheadLine(previous)) return false
  // Keep joining the value after a short "LABEL:" line.
  if (looksLikeLabelLine(previous) && displayLineLength(previous) <= 28) return true
  return true
}

function shouldJoinTranslationLines(
  previous: string,
  next: string,
  fragmented = false,
): boolean {
  if (!previous.trim() || !next.trim()) return false
  if (fragmented) return shouldJoinFragmentedLines(previous, next)
  if (
    startsOutlineRow(next) ||
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
  // Soft-wrapped CJK: join mid-phrase wraps; stop on discourse openers.
  if (CJK_RE.test(previous) && CJK_RE.test(next)) {
    if (looksLikeCjkParagraphStart(next) || looksLikeNewParagraphStart(next)) return false
    return true
  }
  // Soft-wrapped English: short previous line + lowercase continuation.
  if (displayLineLength(previous) < 42) {
    return /^[a-z(]/.test(next.trim())
  }
  // Soft wrap when the previous line ends mid-phrase ("… equipment at").
  if (ENGLISH_SOFT_WRAP_END_RE.test(previous.trim())) return true
  // Long Latin line + discourse opener = new paragraph (ODL often drops trailing `.`).
  if (looksLikeEnglishParagraphStart(next)) return false
  // Soft wrap only when the next line clearly continues the sentence.
  return /^[a-z(]/.test(next.trim())
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
  // Roman / numbered list items must become their own display paragraphs.
  if (startsOutlineRow(next)) return true
  if (isFieldLabelLine(next)) return true
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
  // Capital-start English after a long previous line — even without terminal `.`.
  if (displayLineLength(previous) >= 42 && looksLikeEnglishParagraphStart(next)) return true
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

/** Strip PDF dingbat / Wingdings bullets that render as black squares. */
export function stripPreviewBulletNoise(text: string): string {
  return text
    .replace(/^[\s]*(?:[■□▪▫●•◦‣⁃◆◇★☆]|[\uF000-\uF8FF])\s*/gm, '')
    .replace(/[ \t]+\n/g, '\n')
}

/**
 * Join model/PDF soft wraps (and ODL one-token-per-line pages) so body text
 * fills the pane width — same reading-layout idea as IMA / BabelDOC dual view.
 */
export function reflowTranslationDisplayLines(text: string): string {
  const cleaned = stripPreviewBulletNoise(
    normalizeTranslationDisplayText(unpackTranslationLayoutHints(text)),
  )
  const lines = cleaned.split('\n')
  const fragmented = isFragmentedLineLayout(lines)
  const output: string[] = []
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) {
      if (output.length === 0 || output[output.length - 1] !== '') output.push('')
      continue
    }
    const previous = output[output.length - 1]
    if (previous && previous !== '' && shouldJoinTranslationLines(previous, line, fragmented)) {
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
 * Never reflow GFM/HTML tables — that collapsed Contract Data into pipe soup.
 */
export function withMarkdownHardLineBreaks(text: string): string {
  const body = text.replace(/\r\n/g, '\n')
  if (/<table\b/i.test(body) || (/\|.+\|/.test(body) && /\|[-: ]{3,}\|/.test(body))) {
    return body
  }
  return reflowTranslationDisplayLines(body).replace(/([^\n])\n(?!\n)/g, '$1  \n')
}

function applyHtmlTextLineBreaksChunk(html: string): string {
  return html.replace(/>([^<]+)</g, (_match, text: string) => {
    if (!text.includes('\n')) return `>${text}<`
    const reflowed = reflowTranslationDisplayLines(text)
    if (!reflowed.includes('\n')) return `>${reflowed}<`
    return `>${reflowed.replace(/\n+/g, '<br>')}<`
  })
}

/**
 * ODL table cells often arrive as one OCR token per line. Turning those into
 * `<br>` piles body text vertically under a fine-looking header row. Collapse
 * cell whitespace to spaces so the grid CSS can wrap normally.
 */
function normalizeHtmlTableCellWhitespace(tableHtml: string): string {
  return tableHtml.replace(/>([^<]+)</g, (_match, text: string) => {
    if (!/\n/.test(text)) return `>${text}<`
    const collapsed = text.replace(/[ \t]*\n+[ \t]*/g, ' ').replace(/ {2,}/g, ' ')
    return `>${collapsed}<`
  })
}

/** Keep newlines inside HTML text nodes (ODL often emits one `<p>` per page block). */
export function withHtmlTextLineBreaks(html: string): string {
  const normalized = html.replace(/\r\n/g, '\n')
  const parts: string[] = []
  const tableRe = /<table\b[\s\S]*?<\/table>/gi
  let lastIndex = 0
  for (const match of normalized.matchAll(tableRe)) {
    const index = match.index ?? 0
    if (index > lastIndex) {
      parts.push(applyHtmlTextLineBreaksChunk(normalized.slice(lastIndex, index)))
    }
    parts.push(normalizeHtmlTableCellWhitespace(match[0]))
    lastIndex = index + match[0].length
  }
  if (lastIndex < normalized.length) {
    parts.push(applyHtmlTextLineBreaksChunk(normalized.slice(lastIndex)))
  }
  return parts
    .join('')
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
