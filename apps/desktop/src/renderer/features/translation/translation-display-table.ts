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
  return cells.length >= 2 && HEADER_HINT_RE.test(cells.join(' '))
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

function takeTableRows(
  cells: string[],
  columns: number,
): { rows: string[][]; leftover: string } {
  const rows: string[][] = []
  let index = 0
  while (index + columns <= cells.length) {
    rows.push(cells.slice(index, index + columns))
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
  const trimmed = text.trim().replace(/｜/g, '|')
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
  const pipeLines = lines.filter((line) => line.includes('|'))
  if (pipeLines.length >= 2) {
    const parsed = pipeLines.map(splitPipeCells).filter((row) => row.length >= 2)
    const columns = parsed[0]?.length ?? 0
    const consistent = parsed.filter((row) => row.length === columns)
    if (columns >= 2 && consistent.length >= 2) {
      const headers = consistent[0]!
      const rows = consistent.slice(1)
      if (isPlausibleTable(headers, rows)) {
        return {
          intro: lines.filter((line) => !line.includes('|')).join('\n').trim(),
          headers,
          rows,
          outro: '',
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
