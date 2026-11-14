import {
  isUsableOdlPreviewContent,
  odlPreviewToPlainLines,
  stripOcrCollapsedContent,
} from '@toolman/shared'
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
  const body = text.replace(/\r\n/g, '\n')
  if (!body.trim() || !/\|/.test(body)) return body.trim()
  // Break jammed rows only: "|Entry| |---|---|---| |Employer|..." → one row per line.
  // The header/separator width fixes the column count, so empty cells inside a row
  // (`|Total| | |122|`) stay put — a blind `| |` → newline split used to shred them
  // into lone `|` lines and drop the table body.
  // Keep blank lines so prose around tables does not mash into one paragraph.
  const out: string[] = []
  let colCount = 0
  const pushRow = (cells: string[]) => out.push(`|${cells.join('|')}|`)
  const pushJammedRows = (cells: string[]) => {
    let index = 0
    while (index < cells.length) {
      pushRow(cells.slice(index, index + colCount))
      index += colCount
      if (cells[index] === '') index += 1 // lone empty cell = row separator
    }
  }
  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim()
    if (!line.includes('|')) {
      colCount = 0
      out.push(line)
      continue
    }
    const cells = splitGfmRowCells(line)
    const sepStart = cells.findIndex((cell) => GFM_SEP_CELL_RE.test(cell))
    if (sepStart >= 0) {
      let sepEnd = sepStart
      while (sepEnd < cells.length && GFM_SEP_CELL_RE.test(cells[sepEnd]!)) sepEnd += 1
      colCount = sepEnd - sepStart
      const header = cells.slice(0, sepStart)
      if (header[header.length - 1] === '') header.pop()
      if (header.length > 0) pushRow(header)
      pushRow(cells.slice(sepStart, sepEnd))
      const rest = cells.slice(sepEnd)
      if (rest[0] === '') rest.shift()
      pushJammedRows(rest)
    } else if (colCount > 0 && cells.length >= colCount * 2) {
      pushJammedRows(cells)
    } else {
      out.push(line)
    }
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
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

/**
 * ODL GFM cells often embed `<br>` for wrapped headers/body. Escape text but keep
 * real line-break tags so the table does not show literal `&lt;br&gt;`.
 */
function escapeHtmlCellText(value: string): string {
  const BR = '\u0000BR\u0000'
  const withMarks = value.replace(/<br\s*\/?>/gi, BR)
  return escapeHtmlText(withMarks).replaceAll(BR, '<br>')
}

const GFM_PIPE_ROW_RE = /^\s*\|.+\|\s*$/
const GFM_SEP_CELL_RE = /^:?-{3,}:?$/
// Allow 1-column separators (`|---|`) — ODL uses them for address letterheads.
const GFM_SEP_ROW_RE = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)*\|?\s*$/
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
  return `<tr>${pad.map((cell) => `<${tag}>${escapeHtmlCellText(cell)}</${tag}>`).join('')}</tr>`
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
  const chunked = chunkPipeCellsIntoRows(cells, colCount)
  if (chunked.length === 0) return { rows: [], remainder: normalizedTail }
  // Never fold letter paragraphs that follow a closed HTML table back into it.
  const rows = chunked.filter((row) => !looksLikeProsePipeRow(row, colCount))
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

const JAMMED_MONEY_CELL_RE = /^[\d,]+(?:\.\d+)?$/
const PIPE_TABLE_HEADER_HINT_RE =
  /项目|金额|索赔|依据|数量|单价|合计|名称|Item|Amount|Claim|Basis|Description|Qty|Unit|Total|Invoice|Remark|Entry|Sub-Clause/i
/** Letter / body sentences ODL sometimes wraps as `|paragraph|` next to a real grid. */
const PROSE_PIPE_START_RE =
  /^(?:Dear\b|We\s+refer|In\s+our\s+(?:letter|view)|Through\s+letters?|Accordingly\b|Therefore\b|Following\b|The\s+Contractor|I\s+refer|Please\s+note|尊敬|敬启|我方|根据贵|因此|为此|综上)/i

function cellTextForProseCheck(cell: string): string {
  return cell.replace(/<br\s*\/?>/gi, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * True when a pipe row is a letter paragraph (or heading), not a claim/schedule
 * data row — must stay outside <table>.
 */
export function looksLikeProsePipeRow(cells: string[], expectedCols = 0): boolean {
  const filled = cells.map(cellTextForProseCheck).filter(Boolean)
  if (filled.length === 0) return false
  if (filled.some((cell) => JAMMED_MONEY_CELL_RE.test(cell))) return false
  if (looksLikePipeTableHeaderCells(cells)) return false
  const primary = filled[0] ?? ''
  const primaryLen = Array.from(primary).length
  const onlyFirstFilled =
    filled.length === 1 ||
    (expectedCols >= 3 &&
      cells.filter((cell) => cellTextForProseCheck(cell)).length === 1 &&
      cellTextForProseCheck(cells[0] ?? '') === primary)
  if (onlyFirstFilled && primaryLen >= 48) {
    if (PROSE_PIPE_START_RE.test(primary)) return true
    if (primaryLen >= 90 && /[,.;:，。；：]/.test(primary)) return true
  }
  // Numbered letter headings dumped as a single pipe cell.
  if (filled.length === 1 && /^\d+\.\s+\S/.test(primary) && primaryLen <= 80) return true
  return false
}

function looksLikePipeTableHeaderCells(cells: string[]): boolean {
  if (cells.length < 2) return false
  const joined = cells.join(' ')
  if (!PIPE_TABLE_HEADER_HINT_RE.test(joined)) return false
  // Headers are short labels, not paragraph prose.
  const longCells = cells.filter((cell) => Array.from(cell.trim()).length > 48).length
  return longCells === 0
}

/** Keep leading/trailing letter rows out of the data grid. */
function partitionDataPipeRows(
  rows: string[][],
  expectedCols: number,
): { leadingProse: string[][]; dataRows: string[][]; trailingProse: string[][] } {
  const leadingProse: string[][] = []
  const dataRows: string[][] = []
  const trailingProse: string[][] = []
  let seenData = false
  for (const row of rows) {
    if (looksLikeProsePipeRow(row, expectedCols)) {
      if (!seenData) leadingProse.push(row)
      else trailingProse.push(row)
      continue
    }
    if (trailingProse.length > 0) {
      // Prose appeared mid-grid — treat remaining as trailing prose, stop data.
      trailingProse.push(row)
      continue
    }
    seenData = true
    dataRows.push(row)
  }
  return { leadingProse, dataRows, trailingProse }
}

function flushPipeRowsAsProse(rows: string[][], out: string[]) {
  for (const row of rows) {
    const text = row
      .map(cellTextForProseCheck)
      .filter(Boolean)
      .join(' ')
      .trim()
    if (text) flushGfmProseBuffer([text], out)
  }
}

function pipeRowsLookLikeDataTable(header: string[], bodyRows: string[][]): boolean {
  if (!looksLikePipeTableHeaderCells(header) || bodyRows.length < 1) return false
  const moneyCount = bodyRows.flat().filter((cell) => JAMMED_MONEY_CELL_RE.test(cell.trim())).length
  if (moneyCount >= Math.max(1, bodyRows.length)) return true
  const firstCells = bodyRows.map((row) => row[0] ?? '')
  if (firstColumnLooksLikeSerial(firstCells)) return true
  // At least two non-empty body cells beyond the first column.
  const dataCells = bodyRows.flatMap((row) => row.slice(1)).filter((cell) => cell.trim())
  return dataCells.length >= 2
}

/** Continuation schedule pages: short cells + serial first column — not letter prose. */
function pipeRowsLookLikeContinuationSchedule(rows: string[][], colCount: number): boolean {
  if (rows.length < 2 || colCount < 2 || colCount > 6) return false
  const firstCells = rows.map((row) => (row[0] ?? '').trim())
  if (!firstColumnLooksLikeSerial(firstCells)) return false
  const allCells = rows.flat().map((cell) => cell.trim()).filter(Boolean)
  if (allCells.length < 4) return false
  const long = allCells.filter((cell) => Array.from(cell).length > 64).length
  if (long / allCells.length > 0.15) return false
  const avgLen =
    allCells.reduce((sum, cell) => sum + Array.from(cell).length, 0) / allCells.length
  return avgLen <= 42
}

/**
 * One-line dump `|H1|H2|H3|H4| |r1c1|…| |r2c1|…|`: a lone empty cell separates rows
 * (empty cells inside a row stay), so the header width — the cells before the first
 * empty one — fixes the column count. Guessing 3 columns here scrambled claim tables.
 */
function rowsFromJammedHeaderDump(cells: string[]): { rows: string[][]; colCount: number } | null {
  const headerEnd = cells.indexOf('')
  if (headerEnd < 3 || headerEnd > 8) return null
  const header = cells.slice(0, headerEnd)
  if (header.some((cell) => !cell.trim() || JAMMED_MONEY_CELL_RE.test(cell.trim()))) return null
  if (!looksLikePipeTableHeaderCells(header)) return null
  const colCount = header.length
  const rows: string[][] = [header]
  let index = headerEnd
  while (index < cells.length) {
    if (cells[index] === '') index += 1 // row separator
    const row = cells.slice(index, index + colCount)
    if (row.length === 0) break
    index += colCount
    if (row.some((cell) => cell.trim())) rows.push(row)
  }
  return rows.length >= 2 ? { rows, colCount } : null
}

/**
 * If a page has real pipe data tables (claim/schedule), build HTML.
 * Refuse to invent tables from arbitrary ODL pipe noise / letter prose.
 */
export function promoteOrphanPipeRowsToHtmlTables(text: string): string {
  const raw = text.trim()
  if (!raw || /<table\b/i.test(raw) || !/\|/.test(raw)) return text
  if (isLayoutGfmTable(raw)) return text
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
  const isPipeLine = (line: string) => isGfmDataPipeRow(line) || /^\|+\s*$/.test(line)
  const pipeLines = lines.filter(isPipeLine)
  if (pipeLines.length === 0) return text
  // Letter pages put prose / headings around the pipe dump — keep them (they used to vanish).
  const firstPipeIndex = lines.findIndex(isPipeLine)
  const proseBefore = lines.slice(0, firstPipeIndex).filter((line) => !isPipeLine(line))
  const proseAfter = lines.slice(firstPipeIndex + 1).filter((line) => !isPipeLine(line))
  const proseHtml = (blocks: string[]) =>
    blocks.map((line) => `<p>${escapeHtmlText(line)}</p>`)

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
    const headed = pipeLines.length === 1 ? rowsFromJammedHeaderDump(cells) : null
    if (headed) {
      colCount = headed.colCount
      rows = headed.rows
    } else if (pipeLines.length === 1) {
      // Jammed continuation: `|8|…|9|…|10|…|` with no header labels.
      colCount = inferOrphanPipeColumnCount(cells)
      rows = chunkPipeCellsIntoRows(cells, colCount)
    } else {
      rows = pipeLines
        .filter((line) => isGfmDataPipeRow(line))
        .map((line) => splitGfmRowCells(line.endsWith('|') ? line : `${line}|`))
      colCount = Math.max(...rows.map((row) => row.length), 1)
    }
  }
  if (colCount < 2 || rows.length < 2) return text

  // Prefer a real header row anywhere in the pipe cluster — letter paragraphs
  // often appear as earlier `|…|` lines and must not become the table header.
  const headerIndex = rows.findIndex((row) => looksLikePipeTableHeaderCells(row))
  let header: string[]
  let bodyRows: string[][]
  let pipeProseBefore: string[][] = []
  let pipeProseAfter: string[][] = []
  if (headerIndex >= 0) {
    const candidate = rows[headerIndex]!
    const afterHeader = rows.slice(headerIndex + 1)
    const partitioned = partitionDataPipeRows(afterHeader, candidate.length)
    if (pipeRowsLookLikeDataTable(candidate, partitioned.dataRows)) {
      header = candidate
      bodyRows = partitioned.dataRows
      pipeProseBefore = [...rows.slice(0, headerIndex), ...partitioned.leadingProse]
      pipeProseAfter = partitioned.trailingProse
    } else {
      return text
    }
  } else if (pipeRowsLookLikeContinuationSchedule(rows, colCount)) {
    // Continuation pages start with S/N data — invent a narrow header only then.
    const partitioned = partitionDataPipeRows(rows, colCount)
    if (partitioned.dataRows.length < 2) return text
    header = Array.from({ length: colCount }, (_, index) =>
      index === 0 ? 'S/N' : `Col ${index + 1}`,
    )
    bodyRows = partitioned.dataRows
    pipeProseBefore = partitioned.leadingProse
    pipeProseAfter = partitioned.trailingProse
  } else {
    // Letter prose / ODL pipe noise — leave as text, do not wrap in a table.
    return text
  }
  if (bodyRows.length === 0) return text

  const headerHtml = header
    .concat(Array.from({ length: Math.max(0, colCount - header.length) }, () => ''))
    .slice(0, colCount)
    .map((cell) => `<th>${escapeHtmlCellText(cell)}</th>`)
    .join('')
  const bodyHtml = bodyRows.map((row) => htmlRowFromCells(row, colCount)).join('')
  const pipeProseHtml = (blocks: string[][]) =>
    blocks
      .map((row) => row.map(cellTextForProseCheck).filter(Boolean).join(' ').trim())
      .filter(Boolean)
      .map((line) => `<p>${escapeHtmlText(line)}</p>`)
  return [
    ...proseHtml(proseBefore),
    ...pipeProseHtml(pipeProseBefore),
    `<div class="tm-translation-doc-table-wrap"><table class="tm-translation-doc-table"><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table></div>`,
    ...pipeProseHtml(pipeProseAfter),
    ...proseHtml(proseAfter),
  ].join('\n')
}

/** Single entry: merge mid-page pipes, promote orphan pipes, mark S/N columns. */
export function repairDocumentPreviewTables(html: string): string {
  if (!html.trim()) return html
  let next = html
  if (!/<table\b/i.test(next) && /\|/.test(next) && !isLayoutGfmTable(next)) {
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
      const collected: string[][] = []
      while (index < lines.length && isGfmDataPipeRow(lines[index]!)) {
        collected.push(splitGfmRowCells(lines[index]!))
        index += 1
      }
      const expectedCols = Math.max(headers.length, 1)
      const { leadingProse, dataRows, trailingProse } = partitionDataPipeRows(
        collected,
        expectedCols,
      )
      // Prose pipe rows that followed the separator belong outside the grid.
      flushPipeRowsAsProse(leadingProse, out)
      const rows = dataRows
      const colCount = Math.max(headers.length, ...rows.map((row) => row.length), 1)
      // ODL letterheads often come as a 1-column GFM stub (`|address|\n|---|`).
      // Rendering that as a table (or leaving raw `|`) looks broken — flatten to prose.
      if (colCount <= 1) {
        const flat = [...headers, ...rows.flat()]
          .map((cell) => cell.replace(/<br\s*\/?>/gi, '\n').trim())
          .filter(Boolean)
          .join('\n')
        if (flat) flushGfmProseBuffer([flat], out)
        flushPipeRowsAsProse(trailingProse, out)
        continue
      }
      // Header-only / prose-only under a sep — do not invent an empty data table.
      if (rows.length === 0) {
        flushGfmProseBuffer([headers.map(cellTextForProseCheck).filter(Boolean).join(' ')], out)
        flushPipeRowsAsProse(trailingProse, out)
        continue
      }
      const pad = (cells: string[]) =>
        Array.from({ length: colCount }, (_, cellIndex) => cells[cellIndex] ?? '')
      const headerHtml = pad(headers)
        .map((cell) => `<th>${escapeHtmlCellText(cell)}</th>`)
        .join('')
      const bodyHtml = rows
        .map(
          (row) =>
            `<tr>${pad(row)
              .map((cell) => `<td>${escapeHtmlCellText(cell)}</td>`)
              .join('')}</tr>`,
        )
        .join('')
      out.push(
        `<div class="tm-translation-doc-table-wrap"><table class="tm-translation-doc-table"><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table></div>`,
      )
      flushPipeRowsAsProse(trailingProse, out)
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
    // Jammed one-line GFM (`|H|…| |---| |row|…|`) has only one pipe line before
    // normalize — still a real table when there are enough cells.
    const jammedCells = splitGfmRowCells(body.endsWith('|') ? body : `${body}|`).filter(
      (cell) => cell && !GFM_SEP_CELL_RE.test(cell),
    )
    if (jammedCells.length >= 8 && PIPE_TABLE_HEADER_HINT_RE.test(jammedCells.slice(0, 6).join(' '))) {
      return false
    }
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

function extractHtmlTables(html: string): string[] {
  return [...html.matchAll(/<table\b[\s\S]*?<\/table>/gi)].map((match) => match[0]!)
}

/** Non-table visible prose length — used to avoid flattening real claim/letter pages. */
function outsideTableProseLength(html: string): number {
  const withoutTables = html.replace(/<table\b[\s\S]*?<\/table>/gi, ' ')
  return Array.from(htmlPreviewToVisibleText(withoutTables)).length
}

function scoreHtmlTableAsLayout(tableHtml: string): boolean {
  const rows = tableHtml.match(/<tr\b[^>]*>/gi) ?? []
  const cellHtml = [...tableHtml.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)]
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

/**
 * ODL often emits page-layout tables (many empty cells / wide grids). Those
 * crush into a one-word-wide column under `table-layout: fixed`. Flatten them
 * to plain text instead of rendering as rich tables.
 */
export function isLayoutHtmlTable(html: string): boolean {
  if (!/<table\b/i.test(html)) return false
  const tables = extractHtmlTables(html)
  const scored = tables.length > 0 ? tables : [html]
  // Prose above/beside a table (claim letters, etc.) must stay on the rich path —
  // scoring the whole page used to false-trigger flatten and drop that prose.
  if (outsideTableProseLength(html) >= 40 && scored.some((table) => !scoreHtmlTableAsLayout(table))) {
    return false
  }
  if (outsideTableProseLength(html) >= 80) {
    // Substantial surrounding prose + any table → prefer rich HTML so nothing is dropped.
    return false
  }
  return scored.every((table) => scoreHtmlTableAsLayout(table))
}

/** Flatten one table's rows into prose lines (cells only). */
function flattenLayoutHtmlTableBlock(tableHtml: string): string {
  const rowParts = tableHtml.split(/<\/tr>/i)
  const lines: string[] = []
  for (const part of rowParts) {
    if (!/<t[dh]\b/i.test(part)) continue
    const cells = [...part.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)(?:<\/t[dh]|$)/gi)]
      .map((match) => cellInnerText(match[1]!))
      .filter((text) => text.length > 0)
    if (cells.length > 0) lines.push(cells.join(' '))
  }
  return lines.join('\n').trim()
}

/** Collapse ODL layout tables into readable prose, keeping text outside tables. */
export function flattenLayoutHtmlTable(html: string): string {
  if (!/<table\b/i.test(html)) return htmlPreviewToVisibleText(html)
  const parts: string[] = []
  const tableRe = /<table\b[\s\S]*?<\/table>/gi
  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = tableRe.exec(html)) !== null) {
    const before = html.slice(lastIndex, match.index)
    const beforeText = htmlPreviewToVisibleText(before).trim()
    if (beforeText) parts.push(beforeText)
    const flatTable = flattenLayoutHtmlTableBlock(match[0]!)
    if (flatTable) parts.push(flatTable)
    else {
      const fallback = htmlPreviewToVisibleText(match[0]!).trim()
      if (fallback) parts.push(fallback)
    }
    lastIndex = match.index + match[0]!.length
  }
  const after = htmlPreviewToVisibleText(html.slice(lastIndex)).trim()
  if (after) parts.push(after)
  if (parts.length === 0) return htmlPreviewToVisibleText(html)
  return parts.join('\n\n').replace(/\n{3,}/g, '\n\n').trim()
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
/** True only for pipe dumps that promote to a real claim/schedule table. */
export function hasPromotablePipeTable(text: string): boolean {
  const body = text.trim()
  if (!body || !/\|/.test(body) || /<table\b/i.test(body)) return false
  // Cover-page pipe noise often has a dangling `|---` — never treat as data table.
  if (isLayoutGfmTable(body)) return false
  if (hasGfmTableMarkup(body)) return true
  const repaired = promoteOrphanPipeRowsToHtmlTables(body)
  return /<table\b/i.test(repaired) && repaired !== body
}

export function usesRichDocumentPagePreview(text: string, markdown?: string): boolean {
  const body = (markdown ?? text).trim()
  if (!body) return false
  if (hasHtmlMarkup(body)) {
    if (/<img\b/i.test(body)) return true
    // Decide table richness before fragmented-cell heuristics (short td/th
    // cells would otherwise demote real 3–4 column data tables).
    if (/<table\b/i.test(body)) return !isLayoutHtmlTable(body)
    // Only promote when orphan pipes are a real data table — not any `|` line.
    if (hasPromotablePipeTable(body)) return true
    if (isFragmentedHtmlBlocks(body)) return false
    return false
  }
  if (isLayoutGfmTable(body)) return false
  if (hasGfmTableMarkup(body)) return true
  if (hasPromotablePipeTable(body)) return true
  if (/^#{1,6}\s/m.test(body)) return true
  if (/^\s*[-*+]\s+/m.test(body)) return true
  return false
}

/** Real data tables start from a lower 字号 cap so a full grid still fits. */
export function usesDocumentPageTableFit(text: string, markdown?: string): boolean {
  const body = (markdown ?? text).trim()
  if (!body) return false
  if (hasGfmTableMarkup(body)) return true
  if (hasPromotablePipeTable(body)) return true
  if (/<table\b/i.test(body)) return !isLayoutHtmlTable(body)
  return false
}

export function resolveDocumentPageDisplayText(raw: string, rich: boolean): string {
  const body = raw.trim()
  if (!body) return ''
  if (rich) {
    // Promote only confirmed data-pipe tables; leave letter prose alone.
    if (!/<table\b/i.test(body) && hasPromotablePipeTable(body)) {
      return repairDocumentPreviewTables(body)
    }
    if (hasHtmlMarkup(body) && /<table\b/i.test(body) && !isLayoutHtmlTable(body)) {
      return repairDocumentPreviewTables(body)
    }
    return body
  }
  // Layout GFM cover dumps must flatten — never run repair (adds <p>|…</p>).
  if (isLayoutGfmTable(body)) {
    return reflowTranslationDisplayLines(stripBrokenGfmTableNoise(body))
  }
  if (!/<table\b/i.test(body) && hasPromotablePipeTable(body)) {
    return repairDocumentPreviewTables(body)
  }
  if (hasHtmlMarkup(body) && /<table\b/i.test(body) && !isLayoutHtmlTable(body)) {
    return repairDocumentPreviewTables(body)
  }
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

/**
 * stripOcrCollapsedContent always returns tag-stripped lines. Re-sanitizing a saved
 * `<table>` / pipe-table preview (cache restore, re-parse) would flatten it to one
 * cell per line, so keep the markup unless noise lines were actually removed.
 */
function stripOcrCollapsedKeepingMarkup(value: string): string {
  const stripped = stripOcrCollapsedContent(value)
  if (!value || (!/<table\b/i.test(value) && !/\|/.test(value))) return stripped
  const before = odlPreviewToPlainLines(value).length
  const after = stripped ? stripped.split('\n').filter((line) => line.trim()).length : 0
  return after === before ? value : stripped
}

/** Strip OCR collapse noise (e.g. repeated "27") before display / cache. */
export function sanitizeParsePreviewContent(text: string, markdown?: string): {
  text: string
  markdown: string
} {
  const md = stripOcrCollapsedKeepingMarkup(markdown?.trim() ?? '')
  const plain = stripOcrCollapsedKeepingMarkup(text.trim() || md)
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
