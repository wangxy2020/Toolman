const MONEY_CELL_RE = /^[\d,]+(?:\.\d+)?(?:\s*(?:TZS|USD|EUR|CNY|RMB|元))?$/i
const HEADER_HINT_RE =
  /项目|金额|索赔|依据|数量|单价|合计|名称|Item|Amount|Claim|Basis|Description|Qty|Unit|Total/i
const TABLE_OUTRO_RE = /(?:因此|为此|故此|据此|综上|我方提及|我们请求|We refer|Accordingly)/

export function looksLikeMoneyCell(cell: string): boolean {
  return MONEY_CELL_RE.test(cell.trim().replace(/[()（）]/g, ''))
}

export function splitPipeCells(value: string): string[] {
  return value
    .split('|')
    .map((cell) => cell.trim())
    .filter((cell, index, all) => !(cell === '' && (index === 0 || index === all.length - 1)))
}

const CELL_BR_PLACEHOLDER = '\uE000'

/**
 * Keep GFM pipe rows intact when ODL soft-wraps mid-cell or embeds `<br>`.
 * Unprotected breaks turn a 4-col header into `|Claim Item|Original Invoice` +
 * `Amount (TZS)|…` and the block layout only "recognizes" 2 columns.
 */
export function coalescePipeTableLines(text: string): string {
  const protectedText = text.replace(/\r\n/g, '\n').replace(/<br\s*\/?>/gi, CELL_BR_PLACEHOLDER)
  const out: string[] = []
  for (const raw of protectedText.split('\n')) {
    const line = raw.trimEnd()
    const prev = out.length > 0 ? out[out.length - 1]! : null
    const trimmedPrev = prev?.trim() ?? ''
    const trimmed = line.trim()
    if (
      prev !== null &&
      /^\|/.test(trimmedPrev) &&
      !/\|\s*$/.test(trimmedPrev) &&
      trimmed !== ''
    ) {
      out[out.length - 1] = `${trimmedPrev} ${trimmed}`
      continue
    }
    out.push(line)
  }
  // Spaces keep columns stable; CSS wraps long cells. Newlines would shred rows again.
  return out.join('\n').replaceAll(CELL_BR_PLACEHOLDER, ' ')
}

function findPipeParenGroup(
  text: string,
  open: string,
  close: string,
): { start: number; end: number; inner: string } | null {
  let from = 0
  while (from < text.length) {
    const start = text.indexOf(open, from)
    if (start < 0) return null
    let depth = 0
    let closed = false
    for (let index = start; index < text.length; index += 1) {
      const char = text[index]
      if (char === open) depth += 1
      if (char === close) depth -= 1
      if (depth !== 0) continue
      closed = true
      const inner = text.slice(start + open.length, index)
      if (inner.includes('|') && splitPipeCells(inner).length >= 2) {
        return { start, end: index, inner }
      }
      from = index + 1
      break
    }
    if (!closed) return null
  }
  return null
}

function looksLikeHeaderCells(cells: string[]): boolean {
  if (cells.length < 2) return false
  const joined = cells.join(' ')
  if (!HEADER_HINT_RE.test(joined)) return false
  // Data rows often say "Claimed in full" — require short label-like cells, no money.
  if (cells.some((cell) => looksLikeMoneyCell(cell))) return false
  const longCells = cells.filter((cell) => Array.from(cell.trim()).length > 48).length
  return longCells === 0
}

function peelTrailingProse(cell: string): { cell: string; outro: string } {
  const match = cell.match(new RegExp(`^(.*?)(?:[。.]\\s*)?(${TABLE_OUTRO_RE.source}.*)$`, 'i'))
  if (!match?.[1] || !match[2]) return { cell, outro: '' }
  const before = match[1].trim()
  if (looksLikeMoneyCell(before) || /合计|总计|Total/i.test(before) || before.length <= 24) {
    return { cell: before, outro: match[2].trim() }
  }
  return { cell, outro: '' }
}

function padShortRow(row: string[], columns: number): string[] {
  if (row.length >= columns) return row.slice(0, columns)
  if (row.length === 2 && looksLikeMoneyCell(row[1] ?? '')) {
    return [row[0] ?? '', ...Array.from({ length: columns - 2 }, () => ''), row[1] ?? '']
  }
  return [...row, ...Array.from({ length: columns - row.length }, () => '')]
}

function peelRowOutro(row: string[]): { row: string[]; outro: string } {
  if (row.length === 0) return { row, outro: '' }
  const lastIndex = row.length - 1
  const peeled = peelTrailingProse(row[lastIndex] ?? '')
  if (!peeled.outro) return { row, outro: '' }
  const next = [...row]
  next[lastIndex] = peeled.cell
  return { row: next, outro: peeled.outro }
}

const PROSE_CELL_START_RE =
  /^(?:Dear\b|We\s+refer|In\s+our\s+(?:letter|view)|Through\s+letters?|Accordingly\b|Therefore\b|Following\b|The\s+Contractor|我方提及|根据贵|因此，|为此，)/i

function looksLikeProseTableCell(cell: string): boolean {
  const text = cell.replace(/\s+/g, ' ').trim()
  if (!text || looksLikeMoneyCell(text)) return false
  const len = Array.from(text).length
  if (PROSE_CELL_START_RE.test(text) && len >= 24) return true
  return len >= 90 && /[,.，。]/.test(text) && !looksLikeMoneyCell(text)
}

function takeTableRows(
  cells: string[],
  columns: number,
): { rows: string[][]; leftover: string } {
  const rows: string[][] = []
  let index = 0
  while (index + columns <= cells.length) {
    const row = cells.slice(index, index + columns)
    const first = (row[0] ?? '').replace(/\s+/g, ' ').trim()
    // Letter openers glued into the pipe stream are paragraphs, not claim rows —
    // drop the whole misaligned slice so following Item/Amount rows stay aligned.
    if (PROSE_CELL_START_RE.test(first) && looksLikeProseTableCell(first)) {
      index += columns
      continue
    }
    if (looksLikeProseTableCell(first) && row.slice(1).every((cell) => !String(cell).trim())) {
      index += columns
      continue
    }
    rows.push(row)
    index += columns
  }
  let leftover = ''
  if (rows.length > 0) {
    const peeledLast = peelRowOutro(rows[rows.length - 1]!)
    rows[rows.length - 1] = peeledLast.row
    leftover = peeledLast.outro
  }
  const tail = cells.slice(index)
  if (tail.length === 0) return { rows, leftover }
  const peeledTail = peelRowOutro(tail)
  leftover = [leftover, peeledTail.outro].filter(Boolean).join('\n')
  const nextTail = peeledTail.row.filter((cell) => cell.trim())
  if (nextTail.length >= 1 && nextTail.length < columns) {
    const padded = padShortRow(nextTail, columns)
    if (padded.some((cell) => cell.trim())) rows.push(padded)
    return { rows, leftover }
  }
  return { rows, leftover: [leftover, ...nextTail].filter(Boolean).join('\n') }
}

function isPlausibleTable(headers: string[], rows: string[][]): boolean {
  if (headers.length < 2 || rows.length < 1) return false
  if (looksLikeHeaderCells(headers)) return true
  const moneyCount = rows.flat().filter(looksLikeMoneyCell).length
  return moneyCount >= Math.max(2, rows.length)
}

export type ReconstructedTable = {
  intro: string
  headers: string[]
  rows: string[][]
  outro: string
}

function tableFromHeaderAndRest(
  intro: string,
  headers: string[],
  rest: string,
): ReconstructedTable | null {
  if (headers.length < 2) return null
  const dataCells = splitPipeCells(rest.replace(/^[:：]\s*/, ''))
  if (dataCells.length === 0) return null
  const { rows, leftover } = takeTableRows(dataCells, headers.length)
  if (!isPlausibleTable(headers, rows)) return null
  return {
    intro: intro.trim(),
    headers,
    rows,
    outro: leftover.trim(),
  }
}

/** Rebuild a claim-style table from model prose that used `|` as cell separators. */
export function reconstructTranslationTable(text: string): ReconstructedTable | null {
  const trimmed = coalescePipeTableLines(text.trim().replace(/｜/g, '|'))
  if (!trimmed.includes('|')) return null

  const grouped =
    findPipeParenGroup(trimmed, '（', '）') ?? findPipeParenGroup(trimmed, '(', ')')
  if (grouped) {
    const table = tableFromHeaderAndRest(
      trimmed.slice(0, grouped.start),
      splitPipeCells(grouped.inner),
      trimmed.slice(grouped.end + 1),
    )
    if (table) return table
  }

  const lines = trimmed.split('\n').map((line) => line.trim()).filter(Boolean)
  const isSepCells = (cells: string[]) =>
    cells.length > 0 && cells.every((cell) => !cell || /^:?-{3,}:?$/.test(cell))
  const stripPipeLine = (line: string) =>
    splitPipeCells(line)
      .filter((cell) => cell && !/^:?-{3,}:?$/.test(cell))
      .join(' ')
      .trim()

  // Multiline GFM / pipe grids: find a real header row, skip `|---` separators,
  // and keep letter paragraphs (including pipe-wrapped letterhead) in intro.
  if (lines.some((line) => line.includes('|'))) {
    type RowKind = { index: number; cells: string[]; line: string }
    const pipeRows: RowKind[] = []
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index]!
      if (!line.includes('|')) continue
      const cells = splitPipeCells(line)
      if (isSepCells(cells)) continue
      if (cells.length < 2) continue
      pipeRows.push({ index, cells, line })
    }
    // Prefer the widest header-like row so a soft-wrapped 2-cell fragment
    // (`Claim Item|Original Invoice`) does not beat the real 4-col header.
    let headerAt = -1
    for (let index = 0; index < pipeRows.length; index += 1) {
      const row = pipeRows[index]!
      if (!looksLikeHeaderCells(row.cells)) continue
      if (headerAt < 0 || row.cells.length > pipeRows[headerAt]!.cells.length) {
        headerAt = index
      }
    }
    if (headerAt >= 0) {
      const header = pipeRows[headerAt]!
      const columns = header.cells.length
      const body: string[][] = []
      let firstDataIndex = -1
      let lastDataIndex = header.index
      for (const row of pipeRows.slice(headerAt + 1)) {
        if (row.cells.length !== columns) {
          // Letter paragraphs pipe-wrapped under the header — keep scanning.
          if (body.length === 0) continue
          break
        }
        // Stop before another header-like row (rare mid-page grids).
        if (looksLikeHeaderCells(row.cells) && body.length > 0) break
        // Letter paragraphs padded into the column width stay out of the grid.
        const filled = row.cells.map((cell) => cell.trim()).filter(Boolean)
        if (
          filled.length === 1 &&
          Array.from(filled[0]!).length >= 48 &&
          !looksLikeMoneyCell(filled[0]!)
        ) {
          if (body.length === 0) continue
          break
        }
        if (firstDataIndex < 0) firstDataIndex = row.index
        body.push(row.cells)
        lastDataIndex = row.index
      }
      const headers = header.cells
      if (isPlausibleTable(headers, body)) {
        const collectProse = (from: number, to: number) => {
          const parts: string[] = []
          for (let index = from; index < to; index += 1) {
            const line = lines[index]!
            if (!line.includes('|')) {
              parts.push(line)
              continue
            }
            const cells = splitPipeCells(line)
            if (isSepCells(cells)) continue
            const flat = stripPipeLine(line)
            if (flat) parts.push(flat)
          }
          return parts
        }
        const dataStart = firstDataIndex >= 0 ? firstDataIndex : header.index + 1
        const introParts = [
          ...collectProse(0, header.index),
          // Pipe-wrapped letter lines between header and first data row.
          ...collectProse(header.index + 1, dataStart),
        ]
        const outroParts = collectProse(lastDataIndex + 1, lines.length)
        return {
          intro: introParts.join('\n').trim(),
          headers,
          rows: body,
          outro: outroParts.join('\n').trim(),
        }
      }
    }
  }

  const cells = splitPipeCells(trimmed)
  for (const columns of [4, 5, 3]) {
    if (cells.length < columns * 2) continue
    const headers = cells.slice(0, columns)
    if (!looksLikeHeaderCells(headers)) continue
    const table = tableFromHeaderAndRest('', headers, cells.slice(columns).join('|'))
    if (table) return table
  }
  return null
}

export function looksLikeTranslationTable(text: string, markdown?: string): boolean {
  const body = `${markdown ?? ''}\n${text}`
  if (/<table\b/i.test(body)) return true
  if (/^\s*\|.+\|/m.test(body) && /\|[-: ]{3,}\|/.test(body)) return true
  return reconstructTranslationTable(text) != null
}

/**
 * Tight table 字号 only for schedule-dense pages. Letter pages that merely
 * contain a claim table keep prose 字号 so maximize stays readable.
 */
export function usesDenseTablePageFit(text: string, markdown?: string): boolean {
  const body = (markdown ?? text).trim()
  if (!body || !looksLikeTranslationTable(body)) return false
  const withoutGrid = body
    .replace(/<table\b[\s\S]*?<\/table>/gi, ' ')
    .replace(/^\s*\|.*\|\s*$/gm, ' ')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return Array.from(withoutGrid).length < 180
}
