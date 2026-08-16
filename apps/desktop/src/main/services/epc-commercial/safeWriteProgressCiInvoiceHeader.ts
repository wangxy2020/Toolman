import ExcelJS from 'exceljs'

import { amountToEnglishWords, currencyWordsFor } from './amountInWords'
import { cellText, highlightCell, sheetWidth } from './safeWriteProgressCiExcelUtils.js'

const extractCurrencyWordsFromText = (text: string): string | null => {
  const m = text.match(/SAY\s+([A-Z][A-Z ]*?(?:SHILLINGS|DOLLARS|EUROS|YUAN|FRANCS))/i)
  return m ? m[1].trim().toUpperCase() : null
}

/** 重写 "NET PAYABLE AMOUNT IN WORDS" 行 */
export const updateAmountInWords = (
  worksheet: ExcelJS.Worksheet,
  totalToBePaid: number,
  currency?: string,
): void => {
  const width = sheetWidth(worksheet)
  for (let r = 1; r <= worksheet.rowCount; r++) {
    const row = worksheet.getRow(r)
    for (let c = 1; c <= width; c++) {
      const cell = row.getCell(c)
      const text = cellText(cell)
      if (!/amount\s+IN\s+WORDS/i.test(text)) {
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
    'December',
  ]
  return `${date.getDate()} ${months[date.getMonth()]}, ${date.getFullYear()}`
}

/** 用文件夹上下文推导新 Invoice No：替换 SCH 号、批次号、IPC 期号 */
const deriveInvoiceNo = (
  text: string,
  schDigit?: number,
  batchNumber?: string,
  period?: string,
): string => {
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
  options: { schDigit?: number; batchNumber?: string; period: string },
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
export const applyCurrencyToHeaderRow = (
  worksheet: ExcelJS.Worksheet,
  headerRow: number,
  currency?: string,
): void => {
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
