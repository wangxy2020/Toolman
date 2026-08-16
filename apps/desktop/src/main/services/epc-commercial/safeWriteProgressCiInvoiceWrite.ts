import ExcelJS from 'exceljs'

import type { ProgressCiInvoiceLayout } from './safeWriteProgressCiTypes.js'
import type { SafeWriteProgressCiRowWrite } from './safeWriteProgressCiTypes.js'
import { cellText, colLetter, highlightCell, round2 } from './safeWriteProgressCiExcelUtils.js'

export {
  applyCurrencyToHeaderRow,
  updateAmountInWords,
  updateInvoiceHeaderFields,
} from './safeWriteProgressCiInvoiceHeader.js'

export const isSectionRow = (row: SafeWriteProgressCiRowWrite): boolean =>
  !row.unit.trim() &&
  Math.abs(row.unitPrice) < Number.EPSILON &&
  Math.abs(row.current) < Number.EPSILON &&
  Math.abs(row.currentTotalPrice) < Number.EPSILON

export const writeInvoiceRows = (
  worksheet: ExcelJS.Worksheet,
  layout: ProgressCiInvoiceLayout,
  rows: SafeWriteProgressCiRowWrite[],
  startRow: number,
): number => {
  let written = 0
  rows.forEach((row, i) => {
    if (!row.item.trim()) {
      return
    }
    const r = startRow + i
    const excelRow = worksheet.getRow(r)
    const setCell = (col: number | undefined, value: string | number | undefined): void => {
      if (!col || value === undefined) {
        return
      }
      if (typeof value === 'number' && !Number.isFinite(value)) {
        return
      }
      excelRow.getCell(col).value = value
    }

    setCell(layout.itemCol, row.item)
    setCell(layout.descriptionCol, row.description)
    if (!isSectionRow(row)) {
      setCell(layout.unitCol, row.unit)
      setCell(layout.estQtyCol, row.estQty)
      setCell(layout.qtyCol, row.current)
      setCell(layout.unitPriceCol, row.unitPrice)
      setCell(layout.previousCol, row.previous)
      setCell(layout.currentCol, row.current)
      setCell(layout.endTotalCol, row.endTotal)
      setCell(layout.proportionCol, row.proportion)
      if (layout.totalCol) {
        const cell = excelRow.getCell(layout.totalCol)
        const qtyCol = layout.qtyCol ?? layout.currentCol
        if (qtyCol && layout.unitPriceCol) {
          cell.value = {
            formula: `${colLetter(layout.unitPriceCol)}${r}*${colLetter(qtyCol)}${r}`,
            result: round2(row.currentTotalPrice),
          }
        } else {
          cell.value = round2(row.currentTotalPrice)
        }
      }
    }
    written += 1
  })
  return written
}

interface SummaryEntry {
  letter: string
  row: number
  expr: string | null
  cell: ExcelJS.Cell
}

/** 收集汇总区代码列（如 A、B=20%A、F=B+C+D+E）的行 */
const collectSummaryEntries = (
  worksheet: ExcelJS.Worksheet,
  summaryStartRow: number,
  totalCol: number,
): SummaryEntry[] => {
  const codeCol = Math.max(totalCol - 1, 1)
  const entries: SummaryEntry[] = []
  const lastRow = Math.min(worksheet.rowCount, summaryStartRow + 24)
  for (let r = summaryStartRow; r <= lastRow; r++) {
    const cell = worksheet.getRow(r).getCell(codeCol)
    const text = cellText(cell)
    const m = text.match(/^([A-Z])\s*(?:=\s*(.+))?$/)
    if (m) {
      entries.push({ letter: m[1], row: r, expr: m[2]?.trim() ?? null, cell })
    }
  }
  return entries
}

/** 解析 20%A / B+C+D+E / A-F / 0 等表达式 → Excel 公式 + 数值 */
const evalSummaryExpr = (
  expr: string,
  values: Map<string, number>,
  rowsByLetter: Map<string, number>,
  totalColLetter: string,
): { formula: string; value: number } | null => {
  const re = /([+-])|(\d+(?:\.\d+)?)\s*%\s*([A-Z])|([A-Z])|(\d+(?:\.\d+)?)/g
  let formula = ''
  let value = 0
  let sign = 1
  for (const m of expr.matchAll(re)) {
    if (m[1]) {
      sign = m[1] === '-' ? -1 : 1
      formula += m[1]
      continue
    }
    if (m[2] !== undefined && m[3] !== undefined) {
      const pct = parseFloat(m[2]) / 100
      const refRow = rowsByLetter.get(m[3])
      const refValue = values.get(m[3])
      if (refRow === undefined || refValue === undefined) {
        return null
      }
      formula += `${totalColLetter}${refRow}*${pct}`
      value += sign * refValue * pct
    } else if (m[4] !== undefined) {
      const refRow = rowsByLetter.get(m[4])
      const refValue = values.get(m[4])
      if (refRow === undefined || refValue === undefined) {
        return null
      }
      formula += `${totalColLetter}${refRow}`
      value += sign * refValue
    } else if (m[5] !== undefined) {
      formula += m[5]
      value += sign * parseFloat(m[5])
    }
    sign = 1
  }
  return formula ? { formula, value } : null
}

/** 按代码行重写汇总区公式与缓存值，返回 TOTAL TO BE PAID（J）值 */
export const rewriteSummarySection = (
  worksheet: ExcelJS.Worksheet,
  layout: ProgressCiInvoiceLayout,
  summaryStartRow: number,
  dataStartRow: number,
  dataEndRow: number,
  boqValue: number,
): number | null => {
  if (!layout.totalCol) {
    return null
  }
  const totalColLetter = colLetter(layout.totalCol)
  const entries = collectSummaryEntries(worksheet, summaryStartRow, layout.totalCol)
  if (entries.length === 0) {
    return null
  }
  const values = new Map<string, number>()
  const rowsByLetter = new Map<string, number>()
  for (const entry of entries) {
    rowsByLetter.set(entry.letter, entry.row)
  }
  let lastValue: number | null = null
  for (const entry of entries) {
    const target = worksheet.getRow(entry.row).getCell(layout.totalCol)
    if (!entry.expr) {
      // 首项（BOQ Value A）= 明细 Total 列求和
      const value = round2(boqValue)
      target.value = {
        formula: `SUM(${totalColLetter}${dataStartRow}:${totalColLetter}${dataEndRow})`,
        result: value,
      }
      values.set(entry.letter, value)
      lastValue = value
      continue
    }
    const parsed = evalSummaryExpr(entry.expr, values, rowsByLetter, totalColLetter)
    if (!parsed) {
      highlightCell(target)
      continue
    }
    const value = round2(parsed.value)
    if (/^\d+(?:\.\d+)?$/.test(parsed.formula)) {
      target.value = value
    } else {
      target.value = { formula: parsed.formula, result: value }
    }
    values.set(entry.letter, value)
    lastValue = value
  }
  return values.get('J') ?? lastValue
}
