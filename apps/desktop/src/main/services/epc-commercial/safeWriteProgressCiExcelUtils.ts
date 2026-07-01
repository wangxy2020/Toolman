import ExcelJS from 'exceljs'

export const HIGHLIGHT_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } }

export const cellText = (cell: ExcelJS.Cell): string => {
  try {
    // exceljs 的 MergeValue.toString 在主单元格值为 null 时会抛错
    return String(cell.text ?? '').trim()
  } catch {
    return ''
  }
}

export const round2 = (v: number): number => Math.round(v * 100) / 100

export const colLetter = (n: number): string => {
  let s = ''
  let rest = n
  while (rest > 0) {
    const m = (rest - 1) % 26
    s = String.fromCharCode(65 + m) + s
    rest = Math.floor((rest - 1) / 26)
  }
  return s
}

import type { ProgressCiMergeRect } from './safeWriteProgressCiTypes.js'

export const rectToRange = (m: ProgressCiMergeRect): string =>
  `${colLetter(m.left)}${m.top}:${colLetter(m.right)}${m.bottom}`

export const copyCellStyle = (from: ExcelJS.Cell, to: ExcelJS.Cell): void => {
  if (!from.style) {
    return
  }
  try {
    to.style = JSON.parse(JSON.stringify(from.style)) as ExcelJS.Style
  } catch {
    // 样式深拷贝失败时跳过
  }
}

export const highlightCell = (cell: ExcelJS.Cell): void => {
  try {
    cell.fill = HIGHLIGHT_FILL
  } catch {
    // 忽略填充失败
  }
}

export const sheetWidth = (worksheet: ExcelJS.Worksheet): number => Math.max(worksheet.columnCount, 1)