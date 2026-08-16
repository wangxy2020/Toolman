/** Delimited text and Excel cost table parsers. */

import ExcelJS from 'exceljs'

import type { PmCostType } from './pm-cost-catalog'
import {
  applyField,
  emptyDraft,
  cellText,
  type DraftRow,
} from './pm-cost-import-draft'
import { mapHeaderToField } from './pm-cost-import-types'

/** Parse delimiter-separated text into drafts using the first row as headers. */
export function parseDelimitedCostTable(
  text: string,
  options?: { fallbackType?: PmCostType; delimiter?: string },
): DraftRow[] {
  const fallbackType = options?.fallbackType ?? 'comprehensive'
  const lines = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)
  if (lines.length < 2) return []

  const delimiter =
    options?.delimiter ??
    (lines[0]!.includes('\t') ? '\t' : lines[0]!.includes(';') ? ';' : ',')

  const splitLine = (line: string): string[] => {
    const cells: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i]!
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"'
          i += 1
        } else {
          inQuotes = !inQuotes
        }
        continue
      }
      if (ch === delimiter && !inQuotes) {
        cells.push(current.trim())
        current = ''
        continue
      }
      current += ch
    }
    cells.push(current.trim())
    return cells
  }

  const headers = splitLine(lines[0]!).map(mapHeaderToField)
  if (!headers.some(Boolean)) return []

  const drafts: DraftRow[] = []
  for (const line of lines.slice(1)) {
    const cells = splitLine(line)
    const draft = emptyDraft(fallbackType)
    headers.forEach((field, index) => {
      if (!field) return
      applyField(draft, field, cells[index] ?? '')
    })
    drafts.push(draft)
  }
  return drafts
}

function scoreHeaderRow(values: string[]): number {
  return values.reduce((score, value) => (mapHeaderToField(value) ? score + 1 : score), 0)
}

export async function parseExcelCostBuffer(
  buffer: ArrayBuffer | Uint8Array,
  options?: { fallbackType?: PmCostType },
): Promise<DraftRow[]> {
  const fallbackType = options?.fallbackType ?? 'comprehensive'
  const workbook = new ExcelJS.Workbook()
  // ExcelJS accepts Buffer-like inputs; Uint8Array works in renderer.
  await workbook.xlsx.load(buffer as never)
  const sheet =
    workbook.worksheets.find((entry) => entry.actualRowCount > 0) ?? workbook.worksheets[0]
  if (!sheet) return []

  const matrix: string[][] = []
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values: string[] = []
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      while (values.length < colNumber - 1) values.push('')
      values.push(cellText(cell.value))
    })
    if (values.some((value) => value.trim())) matrix.push(values)
  })
  if (matrix.length < 2) return []

  let headerIndex = 0
  let bestScore = scoreHeaderRow(matrix[0] ?? [])
  for (let i = 1; i < Math.min(matrix.length, 12); i += 1) {
    const score = scoreHeaderRow(matrix[i] ?? [])
    if (score > bestScore) {
      bestScore = score
      headerIndex = i
    }
  }
  if (bestScore === 0) return []

  const headerFields = (matrix[headerIndex] ?? []).map(mapHeaderToField)
  const drafts: DraftRow[] = []
  for (const cells of matrix.slice(headerIndex + 1)) {
    const draft = emptyDraft(fallbackType)
    headerFields.forEach((field, index) => {
      if (!field) return
      applyField(draft, field, cells[index] ?? '')
    })
    drafts.push(draft)
  }
  return drafts
}
