import ExcelJS from 'exceljs'

import { amountToEnglishWords, currencyWordsFor } from './amountInWords'
import type { ProgressCiInvoiceLayout } from './safeWriteProgressCiTypes.js'
import type { SafeWriteProgressCiRowWrite } from './safeWriteProgressCiTypes.js'
import { cellText, colLetter, highlightCell, round2, sheetWidth } from './safeWriteProgressCiExcelUtils.js'

export const isSectionRow = (row: SafeWriteProgressCiRowWrite): boolean =>
  !row.unit.trim() &&
  Math.abs(row.unitPrice) < Number.EPSILON &&
  Math.abs(row.current) < Number.EPSILON &&
  Math.abs(row.currentTotalPrice) < Number.EPSILON

export const writeInvoiceRows = (
  worksheet: ExcelJS.Worksheet,
  layout: ProgressCiInvoiceLayout,
  rows: SafeWriteProgressCiRowWrite[],
  startRow: number
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
            result: round2(row.currentTotalPrice)
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
  totalCol: number
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
  totalColLetter: string
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
  boqValue: number
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
        result: value
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

const extractCurrencyWordsFromText = (text: string): string | null => {
  const m = text.match(/SAY\s+([A-Z][A-Z ]*?(?:SHILLINGS|DOLLARS|EUROS|YUAN|FRANCS))/i)
  return m ? m[1].trim().toUpperCase() : null
}

/** 重写 "NET PAYABLE AMOUNT IN WORDS" 行 */
export const updateAmountInWords = (worksheet: ExcelJS.Worksheet, totalToBePaid: number, currency?: string): void => {
  const width = sheetWidth(worksheet)
  for (let r = 1; r <= worksheet.rowCount; r++) {
    const row = worksheet.getRow(r)
    for (let c = 1; c <= width; c++) {
      const cell = row.getCell(c)
      const text = cellText(cell)
      if (!/AMOUNT\s+IN\s+WORDS/i.test(text)) {
        continue
      }
      const label = text.split('\n')[0].trim()
      const currencyWords = currencyWordsFor(currency) ?? extractCurrencyWordsFromText(text)
      const moneyWords = amountToEnglishWords(totalToBePaid)
      cell.value = `${label}\nSAY ${currencyWords ? `${currencyWords} ` : ''}${moneyWords} ONLY`
      // 英文大写为自动生成，高亮提醒核对
      highlightCell(cell)
      return
    }
  }
}

const formatInvoiceDate = (date: Date): string => {
  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December'
  ]
  return `${date.getDate()} ${months[date.getMonth()]}, ${date.getFullYear()}`
}

/** 用文件夹上下文推导新 Invoice No：替换 SCH 号、批次号、IPC 期号 */
const deriveInvoiceNo = (text: string, schDigit?: number, batchNumber?: string, period?: string): string => {
  let v = text
  if (batchNumber) {
    v = v.replace(/(SCH\s*\d+\s*-\s*)\d{4,}/i, `$1${batchNumber}`)
  }
  if (schDigit !== undefined) {
    v = v.replace(/(SCH)(\s*)\d+/i, (_m, p1: string, p2: string) => `${p1}${p2}${schDigit}`)
  }
  if (period) {
    const num = period.replace(/\D/g, '')
    if (num) {
      v = v.replace(/IPC\s*\d+/i, `IPC${num.padStart(3, '0')}`)
    }
  }
  return v
}

/**
 * 更新发票头部：Date → 今天；Invoice No → 按文件夹推导；SCHEDULE 标题 → 替换分项号；
 * 站名等无法自动判定的内容仅高亮提醒人工修改。
 */
export const updateInvoiceHeaderFields = (
  worksheet: ExcelJS.Worksheet,
  headerRow: number,
  options: { schDigit?: number; batchNumber?: string; period: string }
): void => {
  const width = sheetWidth(worksheet)
  for (let r = 1; r < headerRow; r++) {
    const row = worksheet.getRow(r)
    for (let c = 1; c <= width; c++) {
      const cell = row.getCell(c)
      const text = cellText(cell)
      if (!text) {
        continue
      }
      if (/^date\s*:?/i.test(text)) {
        const label = text.split('\n')[0].replace(/:[\s\S]*$/, ':')
        cell.value = `${label}\n${formatInvoiceDate(new Date())}`
        highlightCell(cell)
        continue
      }
      if (/invoice\s*no/i.test(text)) {
        const derived = deriveInvoiceNo(text, options.schDigit, options.batchNumber, options.period)
        cell.value = derived
        highlightCell(cell)
        continue
      }
      const scheduleMatch = text.match(/^(\s*SCHEDULE\s*)(\d+)/i)
      if (scheduleMatch) {
        if (options.schDigit !== undefined && Number(scheduleMatch[2]) !== options.schDigit) {
          cell.value = text.replace(/^(\s*SCHEDULE\s*)\d+/i, `$1${options.schDigit}`)
          // 分项号已替换，但标题描述可能不适用于新 Schedule，提醒核对
          highlightCell(cell)
        }
        continue
      }
      if (/substation/i.test(text) && !/schedule|project|contract|client|contractor/i.test(text)) {
        // 站名/Lot 名无法自动判定，高亮提醒人工确认
        highlightCell(cell)
      }
    }
  }
}

/** 将表头行中的货币代码（如 TZS）替换为目标货币 */
export const applyCurrencyToHeaderRow = (worksheet: ExcelJS.Worksheet, headerRow: number, currency?: string): void => {
  if (!currency) {
    return
  }
  const code = currency.trim().toUpperCase()
  if (!code) {
    return
  }
  const row = worksheet.getRow(headerRow)
  const width = sheetWidth(worksheet)
  for (let c = 1; c <= width; c++) {
    const cell = row.getCell(c)
    const text = cellText(cell)
    if (!text) {
      continue
    }
    const replaced = text.replace(/\b(TZS|USD|EUR|CNY|RMB)\b/gi, code)
    if (replaced !== text) {
      cell.value = replaced
    }
  }
}