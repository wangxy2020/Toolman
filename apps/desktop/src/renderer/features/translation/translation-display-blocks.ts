import {
  looksLikeContactLine,
  looksLikeTranslationSectionHeading,
  splitTranslationDisplayParagraphs,
} from './translation-paragraphs'
import { looksLikeMoneyCell, reconstructTranslationTable } from './translation-display-table'

export type TranslationDisplayBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; text: string }
  | { type: 'meta'; text: string }
  | { type: 'table'; headers: string[]; rows: string[][] }

function isShortMetaLine(line: string): boolean {
  const trimmed = line.trim()
  return looksLikeContactLine(trimmed) && Array.from(trimmed).length <= 88
}

const FIELD_LABEL_RE =
  /^(?:PROJECT|EMPLOYER|CONTRACTOR|CONTRACT|CLIENT|OWNER|DATE|REF|SUBJECT|TITLE|项目|雇主|承包商|合同|日期|编号|事由|主题)[:：]/i
const TITLE_PAGE_RE =
  /^(?:FORM\s+OF\s+AGREEMENT|CONTRACT\s+AGREEMENT|EPC\s*\/?\s*TURNKEY|协议|合同|工程承包合同)\b/i

function looksLikeFieldLabelLine(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed || trimmed.length > 64) return false
  return FIELD_LABEL_RE.test(trimmed) || /^[A-Z][A-Z0-9 /&-]{1,24}:\s+\S/.test(trimmed)
}

function looksLikeTitlePageLine(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed || /[。！？.!?]$/.test(trimmed)) return false
  const len = Array.from(trimmed).length
  if (len < 3 || len > 56) return false
  if (TITLE_PAGE_RE.test(trimmed)) return true
  if (/^[A-Z0-9][A-Z0-9\s/&.,'()-]{2,55}$/.test(trimmed) && len <= 48) return true
  return false
}

function classifyParagraph(text: string): Exclude<TranslationDisplayBlock, { type: 'table' }> {
  const trimmed = text.trim()
  if (looksLikeTranslationSectionHeading(trimmed) || looksLikeTitlePageLine(trimmed)) {
    return { type: 'heading', text: trimmed }
  }
  if (looksLikeFieldLabelLine(trimmed)) return { type: 'meta', text: trimmed }
  const lines = trimmed.split('\n').filter((line) => line.trim())
  if (lines.length > 0 && lines.every((line) => isShortMetaLine(line) || looksLikeFieldLabelLine(line))) {
    return { type: 'meta', text: trimmed }
  }
  if (isShortMetaLine(trimmed)) return { type: 'meta', text: trimmed }
  return { type: 'paragraph', text: trimmed }
}

function blocksFromProse(text: string): TranslationDisplayBlock[] {
  const blocks: TranslationDisplayBlock[] = []
  for (const part of splitTranslationDisplayParagraphs(text)) {
    if (!part.trim()) continue
    const lines = part.split('\n')
    let buffer: string[] = []
    const flush = () => {
      const joined = buffer.join('\n').trim()
      if (joined) blocks.push(classifyParagraph(joined))
      buffer = []
    }
    for (const line of lines) {
      if (looksLikeTranslationSectionHeading(line) && !line.includes('|')) {
        flush()
        blocks.push({ type: 'heading', text: line.trim() })
        continue
      }
      buffer.push(line)
    }
    flush()
  }
  return blocks
}

/** Turn translated/parsed plain text into letter-like blocks (paragraphs, headings, tables). */
export function buildTranslationDisplayBlocks(text: string): TranslationDisplayBlock[] {
  const trimmed = text.trim()
  if (!trimmed) return []

  const table = reconstructTranslationTable(trimmed)
  if (table) {
    return [
      ...blocksFromProse(table.intro),
      { type: 'table', headers: table.headers, rows: table.rows },
      ...blocksFromProse(table.outro),
    ]
  }

  return blocksFromProse(trimmed)
}

export function isNumericDisplayCell(cell: string): boolean {
  return looksLikeMoneyCell(cell)
}

export function isTotalDisplayRow(row: string[]): boolean {
  return /合计|总计|Total/i.test(row[0] ?? '')
}
