import { isUsableOdlPreviewContent, stripOcrCollapsedContent } from '@toolman/shared'
import { reflowTranslationDisplayLines } from './translation-paragraphs'

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

/**
 * ODL often jams a whole GFM table onto one line:
 * `|Item|Entry| |---|---| |row|...|` → proper multiline rows for remark-gfm / HTML.
 */
export function normalizeGfmTableMarkup(text: string): string {
  let body = text.replace(/\r\n/g, '\n')
  if (!body.trim() || !/\|/.test(body)) return body.trim()
  // Break jammed rows only: "|Entry| |---|---|---| |Employer|..." → one row per line.
  // Do not rewrite separator cells themselves — that previously shredded `|---|---|`.
  // Keep blank lines so prose around tables does not mash into one paragraph.
  body = body.replace(/\|\s+(?=\|)/g, '|\n')
  return body
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** GFM pipe table — must not fall back to plain text or `|` / `---` stay visible. */
export function hasGfmTableMarkup(text: string): boolean {
  const body = normalizeGfmTableMarkup(text)
  if (!body) return false
  return /^\s*\|.+\|/m.test(body) && /\|[-: ]{3,}\|/.test(body)
}

function splitGfmRowCells(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  return trimmed.split('|').map((cell) => cell.trim())
}

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const GFM_PIPE_ROW_RE = /^\s*\|.+\|\s*$/
const GFM_SEP_ROW_RE = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/
/**
 * Narrow first-column headers: S/N, SIN, Item, 序号, …
 * Ambiguous labels like "Item" also require mostly numeric first-column bodies.
 */
const SERIAL_NUMBER_HEADER_RE =
  /^(?:s\s*\/\s*n|s\.?\s*\/?\s*n\.?|sin|s\.?n\.?|no\.?|number|#|item|items?|序号|编号|项次|序号列)$/i
const AMBIGUOUS_SERIAL_HEADER_RE = /^(?:item|items?|no\.?|number)$/i

function isGfmDataPipeRow(line: string): boolean {
  const trimmed = line.trim()
  if (GFM_SEP_ROW_RE.test(trimmed)) return false
  // Require at least two pipes; trailing pipe may be missing on ODL dumps.
  if ((trimmed.match(/\|/g) ?? []).length < 2) return false
  if (!/^\s*\|/.test(trimmed)) return false
  const cells = splitGfmRowCells(trimmed.endsWith('|') ? trimmed : `${trimmed}|`)
  return cells.some((cell) => cell.length > 0)
}

function htmlRowFromCells(cells: string[], colCount: number, tag: 'td' | 'th' = 'td'): string {
  const pad = Array.from({ length: Math.max(1, colCount) }, (_, index) => cells[index] ?? '')
  return `<tr>${pad.map((cell) => `<${tag}>${escapeHtmlText(cell)}</${tag}>`).join('')}</tr>`
}

function countTableColumns(tableHtml: string): number {
  const firstRow = tableHtml.match(/<tr\b[^>]*>([\s\S]*?)<\/tr>/i)
  if (!firstRow) return 0
  const cells = firstRow[1]!.match(/<(?:th|td)\b/gi)
  return cells?.length ?? 0
}

function unwrapPipeLineCandidate(chunk: string): string {
  return chunk
    .replace(/^\s*<(?:p|div|span|pre|code)[^>]*>\s*/i, '')
    .replace(/\s*<\/(?:p|div|span|pre|code)>\s*$/i, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/&nbsp;/gi, ' ')
    .trim()
}

/** ODL often jams several logical rows onto one `|a|b|c|d|e|f|` line — chunk by colCount. */
export function chunkPipeCellsIntoRows(cells: string[], colCount: number): string[][] {
  const width = Math.max(1, colCount)
  if (cells.length === 0) return []
  if (cells.length <= width + 1) return [cells]
  const rows: string[][] = []
  for (let index = 0; index < cells.length; index += width) {
    const row = cells.slice(index, index + width)
    if (row.some((cell) => cell.trim())) rows.push(row)
  }
  return rows
}

function extractPipeRowsFromTail(tail: string, colCount: number): {
  rows: string[][]
  remainder: string
} {
  // Do NOT run normalizeGfmTableMarkup here — it turns `| |Work|` into a lone `|`
  // line and drops the empty S/N cell, which aborts the merge.
  const normalizedTail = tail
    .replace(/<\/?(?:p|div|span|pre|code)[^>]*>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/&nbsp;/gi, ' ')
  const lines = normalizedTail.split('\n')
  let lineIndex = 0
  while (lineIndex < lines.length && !lines[lineIndex]!.trim()) lineIndex += 1

  const cells: string[] = []
  while (lineIndex < lines.length) {
    const line = unwrapPipeLineCandidate(lines[lineIndex]!).trim()
    if (!line) {
      const lookAhead = lines.slice(lineIndex + 1).find((entry) => entry.trim())
      if (!lookAhead || !isGfmDataPipeRow(unwrapPipeLineCandidate(lookAhead).trim())) break
      lineIndex += 1
      continue
    }
    if (/^\|+\s*$/.test(line)) {
      cells.push('')
      lineIndex += 1
      continue
    }
    if (!isGfmDataPipeRow(line)) break
    const normalized = line.endsWith('|') ? line : `${line}|`
    cells.push(...splitGfmRowCells(normalized))
    lineIndex += 1
  }

  if (cells.length < Math.max(2, colCount - 1)) {
    return { rows: [], remainder: normalizedTail }
  }
  const rows = chunkPipeCellsIntoRows(cells, colCount)
  if (rows.length === 0) return { rows: [], remainder: normalizedTail }
  return { rows, remainder: lines.slice(lineIndex).join('\n') }
}

function firstColumnBodyValues(tableHtml: string): string[] {
  const values: string[] = []
  const rowRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi
  let isHeader = true
  for (const match of tableHtml.matchAll(rowRe)) {
    const row = match[1]!
    const cell = row.match(/<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/i)
    if (!cell) continue
    const text = cell[1]!.replace(/<[^>]+>/g, '').replace(/&nbsp;/gi, ' ').trim()
    if (isHeader) {
      isHeader = false
      continue
    }
    values.push(text)
  }
  return values
}

function firstColumnLooksLikeSerial(values: string[]): boolean {
  if (values.length === 0) return true
  const serial = values.filter((value) => !value || /^\d{1,4}[.)]?$/.test(value))
  return serial.length / values.length >= 0.6
}

/**
 * ODL often closes an HTML table mid-page, then dumps the rest as `|row|…|` pipes
 * (sometimes jammed onto one line). Fold those rows back into the preceding table.
 */
export function mergeTrailingPipeRowsIntoHtmlTables(html: string): string {
  if (!/<table\b/i.test(html) || !/\|/.test(html)) return html

  return html.replace(
    /(<table\b[\s\S]*?<\/table>)(\s*<\/div>)?([\s\S]*?)(?=<table\b|$)/gi,
    (full, tableHtml: string, closeWrap = '', tail: string) => {
      if (!/\|/.test(tail)) return full
      const colCount = Math.max(1, countTableColumns(tableHtml))
      const { rows, remainder } = extractPipeRowsFromTail(tail, colCount)
      if (rows.length === 0) return full

      const rowsHtml = rows.map((row) => htmlRowFromCells(row, colCount)).join('')
      const mergedTable = /<\/tbody>/i.test(tableHtml)
        ? tableHtml.replace(/<\/tbody>/i, `${rowsHtml}</tbody>`)
        : tableHtml.replace(/<\/table>/i, `${rowsHtml}</table>`)
      return `${mergedTable}${closeWrap}${remainder}`
    },
  )
}

/** Mark tables whose first header is S/N / Item / 序号 so CSS can keep that column narrow. */
export function markSerialNumberTableColumns(html: string): string {
  if (!/<table\b/i.test(html)) return html
  return html.replace(/<table\b[^>]*>[\s\S]*?<\/table>/gi, (table) => {
    const headerCell = table.match(/<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/i)
    if (!headerCell) return table
    const label = headerCell[1]!.replace(/<[^>]+>/g, '').replace(/&nbsp;/gi, ' ').trim()
    if (!SERIAL_NUMBER_HEADER_RE.test(label)) return table
    if (AMBIGUOUS_SERIAL_HEADER_RE.test(label) && !firstColumnLooksLikeSerial(firstColumnBodyValues(table))) {
      return table
    }
    if (/\btm-translation-doc-table--sn-first\b/.test(table)) return table
    if (/\bclass\s*=/.test(table)) {
      return table.replace(/\bclass\s*=\s*(["'])/i, 'class=$1tm-translation-doc-table--sn-first ')
    }
    return table.replace(/<table\b/i, '<table class="tm-translation-doc-table--sn-first"')
  })
}

function inferOrphanPipeColumnCount(cells: string[]): number {
  // Prefer serial-number cadence: empty/digit in positions 0,3,6… → width 3.
  for (const width of [3, 4, 2, 5, 6]) {
    if (cells.length < width * 2) continue
    if (cells.length % width !== 0 && cells.length % width < width - 1) continue
    const starts = Array.from(
      { length: Math.floor(cells.length / width) },
      (_, index) => cells[index * width] ?? '',
    )
    if (firstColumnLooksLikeSerial(starts)) return width
  }
  if (cells.length >= 6 && cells.length % 3 === 0) return 3
  if (cells.length >= 8 && cells.length % 4 === 0) return 4
  return Math.min(6, Math.max(2, Math.round(cells.length / Math.max(2, Math.floor(cells.length / 3)))))
}

/**
 * If a page is mostly pipe rows without a leading HTML table (continuation pages),
 * build a table using the first row as header when it looks like labels.
 */
export function promoteOrphanPipeRowsToHtmlTables(text: string): string {
  const raw = text.trim()
  if (!raw || /<table\b/i.test(raw) || !/\|/.test(raw)) return text
  if (hasGfmTableMarkup(raw)) return gfmTablesToHtml(raw)

  // Keep jammed one-line dumps intact — normalizeGfmTableMarkup would split `| |`
  // into a lone `|` and break column recovery.
  // Also unwrap `<p>|8|…|</p>` so continuation pages wrapped by ODL still promote.
  const lines = raw
    .replace(/\r\n/g, '\n')
    .replace(/<\/?(?:p|div|span|pre|code)[^>]*>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/&nbsp;/gi, ' ')
    .split('\n')
    .map((line) => unwrapPipeLineCandidate(line))
    .filter(Boolean)
  const pipeLines = lines.filter((line) => isGfmDataPipeRow(line) || /^\|+\s*$/.test(line))
  if (pipeLines.length === 0) return text

  const cells: string[] = []
  for (const line of pipeLines) {
    if (/^\|+\s*$/.test(line)) {
      cells.push('')
      continue
    }
    const normalized = line.endsWith('|') ? line : `${line}|`
    cells.push(...splitGfmRowCells(normalized))
  }
  if (cells.length < 4) return text

  let rows: string[][]
  let colCount: number
  if (pipeLines.length >= 2 && pipeLines.every((line) => isGfmDataPipeRow(line))) {
    rows = pipeLines
      .filter((line) => isGfmDataPipeRow(line))
      .map((line) => splitGfmRowCells(line.endsWith('|') ? line : `${line}|`))
    colCount = Math.max(...rows.map((row) => row.length), 1)
  } else {
    colCount = inferOrphanPipeColumnCount(cells)
    rows = chunkPipeCellsIntoRows(cells, colCount)
  }
  if (colCount < 2 || rows.length < 2) return text

  // First row as header only when it looks like labels — empty / numeric S/N
  // first cells are continuation data, not headers.
  const first = rows[0]!
  const firstCell = (first[0] ?? '').trim()
  const firstIsData =
    !firstCell ||
    (firstColumnLooksLikeSerial([firstCell]) && /^\d{1,4}$/.test(firstCell))
  const header = firstIsData
    ? Array.from({ length: colCount }, (_, index) => (index === 0 ? 'S/N' : `Col ${index + 1}`))
    : first
  const bodyRows = firstIsData ? rows : rows.slice(1)
  if (bodyRows.length === 0) return text

  const headerHtml = header
    .concat(Array.from({ length: Math.max(0, colCount - header.length) }, () => ''))
    .slice(0, colCount)
    .map((cell) => `<th>${escapeHtmlText(cell)}</th>`)
    .join('')
  const bodyHtml = bodyRows.map((row) => htmlRowFromCells(row, colCount)).join('')
  return `<div class="tm-translation-doc-table-wrap"><table class="tm-translation-doc-table"><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table></div>`
}

/** Single entry: merge mid-page pipes, promote orphan pipes, mark S/N columns. */
export function repairDocumentPreviewTables(html: string): string {
  if (!html.trim()) return html
  let next = html
  if (!/<table\b/i.test(next) && /\|/.test(next)) {
    next = promoteOrphanPipeRowsToHtmlTables(next)
  }
  next = mergeTrailingPipeRowsIntoHtmlTables(next)
  next = markSerialNumberTableColumns(next)
  return next
}

/**
 * Convert real GFM pipe tables to HTML so the right pane always uses table CSS
 * (remark-gfm fails when ODL emits compacted one-line tables).
 */
function flushGfmProseBuffer(buffer: string[], out: string[]) {
  const text = buffer.join('\n').trim()
  buffer.length = 0
  if (!text) return
  for (const paragraph of text.split(/\n\s*\n+/)) {
    const lines = paragraph
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
    if (lines.length === 0) continue
    const html = lines
      .map((line) =>
        escapeHtmlText(line.replace(/^#{1,6}\s+/, '').replace(/\*\*([^*]+)\*\*/g, '$1')),
      )
      .join('<br>')
    out.push(`<p>${html}</p>`)
  }
}

export function gfmTablesToHtml(text: string): string {
  const body = normalizeGfmTableMarkup(text)
  if (!hasGfmTableMarkup(body)) return body
  const lines = body.split('\n')
  const out: string[] = []
  const prose: string[] = []
  let index = 0
  while (index < lines.length) {
    const line = lines[index]!
    const next = lines[index + 1] ?? ''
    if (GFM_PIPE_ROW_RE.test(line) && GFM_SEP_ROW_RE.test(next)) {
      flushGfmProseBuffer(prose, out)
      const headers = splitGfmRowCells(line)
      index += 2
      const rows: string[][] = []
      while (index < lines.length && isGfmDataPipeRow(lines[index]!)) {
        rows.push(splitGfmRowCells(lines[index]!))
        index += 1
      }
      const colCount = Math.max(headers.length, ...rows.map((row) => row.length), 1)
      const pad = (cells: string[]) =>
        Array.from({ length: colCount }, (_, cellIndex) => cells[cellIndex] ?? '')
      const headerHtml = pad(headers)
        .map((cell) => `<th>${escapeHtmlText(cell)}</th>`)
        .join('')
      const bodyHtml = rows
        .map((row) => `<tr>${pad(row).map((cell) => `<td>${escapeHtmlText(cell)}</td>`).join('')}</tr>`)
        .join('')
      out.push(
        `<div class="tm-translation-doc-table-wrap"><table class="tm-translation-doc-table"><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table></div>`,
      )
      continue
    }
    prose.push(line)
    index += 1
  }
  flushGfmProseBuffer(prose, out)
  return out.join('\n')
}

/**
 * ODL title/cover pages sometimes arrive as sparse pipe "tables" (one token per
 * cell) plus a dangling `|---` row. Those must not render as GFM or dump `|`.
 */
export function isLayoutGfmTable(text: string): boolean {
  const body = text.trim()
  if (!body || !/\|/.test(body)) return false
  const lines = body.split('\n').map((line) => line.trim()).filter(Boolean)
  const pipeLines = lines.filter((line) => line.includes('|'))
  const dataLines = pipeLines.filter((line) => !/\|[-: ]{3,}\|/.test(line))
  const colCounts = dataLines.map(
    (line) => line.split('|').map((cell) => cell.trim()).filter(Boolean).length,
  )
  const avgCols =
    colCounts.length > 0 ? colCounts.reduce((sum, n) => sum + n, 0) / colCounts.length : 0
  const consistentCols =
    colCounts.length >= 2 && colCounts.every((count) => Math.abs(count - colCounts[0]!) <= 1)
  // Proper data tables (with or without a separator row) stay rich.
  if (hasGfmTableMarkup(body)) {
    if (avgCols >= 2 && avgCols <= 6 && dataLines.length >= 2) return false
    // Dangling `|---` with no real grid (cover-page dumps) → flatten.
    return true
  }
  // Continuation pages: consistent 2–6 col pipe grids (often short S/N cells).
  if (consistentCols && avgCols >= 2 && avgCols <= 6 && dataLines.length >= 2) {
    const firstCells = dataLines.map(
      (line) => line.split('|').map((cell) => cell.trim()).filter(Boolean)[0] ?? '',
    )
    if (firstColumnLooksLikeSerial(firstCells) || avgCols <= 4) return false
  }
  if (pipeLines.length < 2) {
    // Jammed one-line dumps still look like real tables when cell count is high.
    const jammedCells = splitGfmRowCells(body.endsWith('|') ? body : `${body}|`).filter(Boolean)
    if (jammedCells.length >= 6) return false
    return /\|[-: ]{3,}\|/.test(body) || /^\s*\|\s*\d+\s*$/m.test(body)
  }
  const cells = pipeLines.flatMap((line) =>
    line
      .split('|')
      .map((cell) => cell.trim())
      .filter((cell) => cell && !/^:?-{2,}:?$/.test(cell)),
  )
  if (cells.length === 0) return true
  const short = cells.filter((cell) => Array.from(cell).length <= 12).length
  const emptyish = pipeLines.some((line) => /^\|\s*(\|\s*)+$/.test(line) || /^\|\s*$/.test(line))
  // Sparse cover dumps: mostly tiny tokens with inconsistent / very wide structure.
  if (emptyish) return true
  if (avgCols >= 8) return true
  if (short / cells.length >= 0.7 && avgCols >= 5 && !consistentCols) return true
  return false
}

/** Remove dangling pipe / separator noise left by layout GFM dumps. */
export function stripBrokenGfmTableNoise(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/^\s*\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)*\|?\s*$/gm, '')
    .replace(/^\s*\|+\s*/gm, '')
    .replace(/\s*\|+\s*$/gm, '')
    .replace(/\|/g, ' ')
    // After pipes are gone, drop leftover GFM separator rows (`---`).
    .replace(/^\s*:?-{2,}:?\s*$/gm, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
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

function cellInnerText(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * ODL often emits page-layout tables (many empty cells / wide grids). Those
 * crush into a one-word-wide column under `table-layout: fixed`. Flatten them
 * to plain text instead of rendering as rich tables.
 */
export function isLayoutHtmlTable(html: string): boolean {
  if (!/<table\b/i.test(html)) return false
  const rows = html.match(/<tr\b[^>]*>/gi) ?? []
  const cellHtml = [...html.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)]
  if (cellHtml.length === 0) return true
  const texts = cellHtml.map((match) => cellInnerText(match[1]!))
  const nonEmpty = texts.filter((text) => text.length > 0).length
  const emptyRatio = 1 - nonEmpty / texts.length
  const avgCols = texts.length / Math.max(1, rows.length)
  // Only treat wide/empty grids as page-layout scaffolding. Dense data tables
  // (even 6-col schedules with few blanks) must stay rich.
  if (avgCols >= 8) return true
  if (avgCols >= 6 && emptyRatio >= 0.25) return true
  if (avgCols >= 5 && emptyRatio >= 0.35) return true
  if (emptyRatio >= 0.7 && avgCols >= 4) return true
  return false
}

/** Collapse ODL layout tables into readable prose (one line per row). */
export function flattenLayoutHtmlTable(html: string): string {
  const rowParts = html.split(/<\/tr>/i)
  const lines: string[] = []
  for (const part of rowParts) {
    if (!/<t[dh]\b/i.test(part)) continue
    const cells = [...part.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)(?:<\/t[dh]|$)/gi)]
      .map((match) => cellInnerText(match[1]!))
      .filter((text) => text.length > 0)
    if (cells.length > 0) lines.push(cells.join(' '))
  }
  if (lines.length === 0) return htmlPreviewToVisibleText(html)
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** Many tiny block tags = coordinate dump, not a document worth rendering as HTML. */
function isFragmentedHtmlBlocks(html: string): boolean {
  const blocks = [...html.matchAll(/<(?:p|div|li|span|td|th)\b[^>]*>([\s\S]*?)<\/(?:p|div|li|span|td|th)>/gi)]
  if (blocks.length < 8) return false
  const texts = blocks
    .map((match) => cellInnerText(match[1]!))
    .filter((text) => text.length > 0)
  if (texts.length < 8) return false
  const short = texts.filter((text) => Array.from(text).length <= 18).length
  return short / texts.length >= 0.55
}

/**
 * Real data tables / images keep the HTML renderer. Layout tables, fragmented
 * ODL dumps, and letters use the same reading-layout paragraphs as IMA dual view.
 */
export function usesRichDocumentPagePreview(text: string, markdown?: string): boolean {
  const body = (markdown ?? text).trim()
  if (!body) return false
  if (hasHtmlMarkup(body)) {
    if (/<img\b/i.test(body)) return true
    // Decide table richness before fragmented-cell heuristics (short td/th
    // cells would otherwise demote real 3–4 column data tables).
    if (/<table\b/i.test(body)) return !isLayoutHtmlTable(body)
    if (isFragmentedHtmlBlocks(body)) return false
    return false
  }
  if (isLayoutGfmTable(body)) return false
  if (hasGfmTableMarkup(body)) return true
  if (/^#{1,6}\s/m.test(body)) return true
  if (/^\s*[-*+]\s+/m.test(body)) return true
  return false
}

/** Real data tables start from a lower 字号 cap so a full grid still fits. */
export function usesDocumentPageTableFit(text: string, markdown?: string): boolean {
  const body = (markdown ?? text).trim()
  if (!body) return false
  if (hasGfmTableMarkup(body)) return true
  if (/<table\b/i.test(body)) return !isLayoutHtmlTable(body)
  return false
}

export function resolveDocumentPageDisplayText(raw: string, rich: boolean): string {
  const body = raw.trim()
  if (!body) return ''
  if (rich) return body
  const plain =
    hasHtmlMarkup(body) && isLayoutHtmlTable(body)
      ? flattenLayoutHtmlTable(body)
      : hasHtmlMarkup(body)
        ? htmlPreviewToVisibleText(body)
        : isLayoutGfmTable(body) || /\|/.test(body)
          ? stripBrokenGfmTableNoise(body)
          : body
  // IMA / BabelDOC-style reading layout: merge ODL one-token lines into prose.
  return reflowTranslationDisplayLines(plain)
}

/** Real data tables stay rich; layout HTML / letters use the plain paragraph path. */
export function isRichMarkdownPreview(text: string, markdown?: string): boolean {
  return usesRichDocumentPagePreview(text, markdown)
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
  const cleaned = html
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
  // Fold mid-page `|row|` leftovers / orphan pipes into HTML tables, then wrap.
  const repaired = repairDocumentPreviewTables(cleaned)
  return repaired.replace(
    /(<div\b[^>]*class="[^"]*tm-translation-doc-table-wrap[^"]*"[^>]*>\s*)?<table\b[\s\S]*?<\/table>(?:\s*<\/div>)?/gi,
    (match) => {
      if (/tm-translation-doc-table-wrap/i.test(match) && /<\/div>\s*$/i.test(match)) {
        return match
      }
      const tableMatch = match.match(/<table\b[\s\S]*?<\/table>/i)
      if (!tableMatch) return match
      let table = tableMatch[0]
      if (/\bclass\s*=/i.test(table)) {
        table = table.replace(/\bclass\s*=\s*(["'])/i, 'class=$1tm-translation-doc-table ')
      } else {
        table = table.replace(/<table\b/i, '<table class="tm-translation-doc-table"')
      }
      return `<div class="tm-translation-doc-table-wrap">${table}</div>`
    },
  )
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
