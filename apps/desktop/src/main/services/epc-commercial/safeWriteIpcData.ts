import fs from 'node:fs/promises'
import path from 'node:path'

import ExcelJS from 'exceljs'
import { loggerService } from './epc-logger.js'

import { sanitiseWorkbookSharedFormulas } from './exceljsSharedFormulaSanitise'

const logger = loggerService.withContext('SafeWriteIpcData')

export type SafeWriteIpcErrorCode = 'FILE_LOCKED' | 'INTERNAL_ERROR'

export class SafeWriteIpcDataError extends Error {
  readonly code: SafeWriteIpcErrorCode

  constructor(message: string, code: SafeWriteIpcErrorCode, cause?: unknown) {
    super(message)
    this.name = 'SafeWriteIpcDataError'
    this.code = code
    if (cause instanceof Error) {
      this.cause = cause
    }
  }
}

export interface SafeWriteIpcRowWrite {
  /** Item / Item No（与母表行匹配） */
  item: string
  unitPrice: number
  /** 写入 IPC 期数列的金额（仅改 cell.value） */
  amount: number
}

export interface SafeWriteIpcDataParams {
  /** 合同母表或 *_aligned.xlsx 绝对路径 */
  masterFilePath: string
  /** Schedule 工作表名，如 Schedule1-USD */
  worksheetName: string
  /** 期数列表头，如 IPC007 */
  periodColumnHeader: string
  /** 复合键 → 金额 */
  rows: SafeWriteIpcRowWrite[]
}

const normalizeHeader = (h: string): string =>
  h
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')

const isItemHeader = (h: string): boolean => {
  const n = normalizeHeader(h)
  return n === 'item' || n === 'item no' || n === 'item no.' || n === 'no' || n === 'no.'
}

const isUnitPriceHeader = (h: string): boolean => {
  const n = normalizeHeader(h)
  return n.includes('unit price') || n.includes('unit rate')
}

const normalizeItemKey = (item: string): string => item.replace(/\s+/g, '').trim().toUpperCase()

const compositeKey = (item: string, unitPrice: number): string =>
  `${normalizeItemKey(item)}|${unitPrice.toFixed(2)}`

const isFileLockedError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') {
    return false
  }
  const err = error as NodeJS.ErrnoException
  if (err.code === 'EBUSY' || err.code === 'EPERM' || err.code === 'EACCES') {
    return true
  }
  const msg = String(err.message ?? error).toLowerCase()
  return msg.includes('ebusy') || msg.includes('locked') || msg.includes('permission denied')
}

const copyCellStyle = (from: ExcelJS.Cell, to: ExcelJS.Cell): void => {
  if (!from.style) {
    return
  }
  try {
    to.style = JSON.parse(JSON.stringify(from.style)) as ExcelJS.Style
  } catch {
    // 样式深拷贝失败时跳过，避免阻断写入
  }
}

const mergeHeaderRows = (worksheet: ExcelJS.Worksheet, maxScanRows = 12): string[] => {
  const width = Math.max(worksheet.columnCount, 1)
  const merged: string[] = Array.from({ length: width }, () => '')
  const lastRow = Math.min(worksheet.rowCount, maxScanRows)
  for (let r = 1; r <= lastRow; r++) {
    const row = worksheet.getRow(r)
    for (let c = 1; c <= width; c++) {
      const text = String(row.getCell(c).text ?? '').trim()
      if (!text) {
        continue
      }
      if (merged[c - 1]) {
        merged[c - 1] = `${merged[c - 1]} ${text}`.trim()
      } else {
        merged[c - 1] = text
      }
    }
  }
  return merged
}

const findHeaderLayout = (
  worksheet: ExcelJS.Worksheet
): { headers: string[]; headerRow: number; itemCol: number; unitPriceCol: number } | null => {
  const lastRow = Math.min(worksheet.rowCount, 20)
  for (let headerEnd = 1; headerEnd <= lastRow; headerEnd++) {
    const headers = mergeHeaderRows(worksheet, headerEnd)
    const itemCol = headers.findIndex((h) => isItemHeader(h))
    const unitPriceCol = headers.findIndex((h) => isUnitPriceHeader(h))
    if (itemCol >= 0 && unitPriceCol >= 0) {
      return { headers, headerRow: headerEnd, itemCol: itemCol + 1, unitPriceCol: unitPriceCol + 1 }
    }
  }
  return null
}

const periodHeaderMatches = (header: string, periodColumnHeader: string): boolean => {
  const h = normalizeHeader(header)
  const p = normalizeHeader(periodColumnHeader)
  if (!h || !p) {
    return false
  }
  if (h === p) {
    return true
  }
  const ipcNum = p.replace(/[^0-9]/g, '')
  if (!ipcNum) {
    return false
  }
  return h.includes(`ipc${ipcNum}`) || h.includes(`ipc${ipcNum.padStart(3, '0')}`)
}

const findOrInsertPeriodColumn = (
  worksheet: ExcelJS.Worksheet,
  layout: { headers: string[]; headerRow: number; unitPriceCol: number },
  periodColumnHeader: string
): number => {
  const existing = layout.headers.findIndex((h) => periodHeaderMatches(h, periodColumnHeader))
  if (existing >= 0) {
    return existing + 1
  }

  const insertAt = layout.unitPriceCol + 1
  const columnCount = Math.max(worksheet.columnCount, layout.headers.length)
  const rowCount = worksheet.rowCount

  worksheet.spliceColumns(insertAt, 0, [])

  for (let r = 1; r <= rowCount; r++) {
    const row = worksheet.getRow(r)
    const styleSourceCol = Math.max(1, insertAt - 1)
    const newCell = row.getCell(insertAt)
    copyCellStyle(row.getCell(styleSourceCol), newCell)
    if (r === layout.headerRow) {
      newCell.value = periodColumnHeader
    }
  }

  for (let c = columnCount + 1; c >= insertAt; c--) {
    const col = worksheet.getColumn(c)
    if (col.width) {
      worksheet.getColumn(c + 1).width = col.width
    }
  }

  return insertAt
}

const parseCellNumber = (value: ExcelJS.CellValue): number | null => {
  if (value == null) {
    return null
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'object' && 'result' in value && typeof value.result === 'number') {
    return value.result
  }
  const text = String(value).replace(/,/g, '').trim()
  if (!text) {
    return null
  }
  const n = Number.parseFloat(text)
  return Number.isFinite(n) ? n : null
}

/**
 * 在母表/aligned 表上原地增量写入 IPC 期数列：先备份副本，仅改匹配单元格的 value，成功后原子替换。
 */
export async function safeWriteIpcData(params: SafeWriteIpcDataParams): Promise<void> {
  const { masterFilePath, worksheetName, periodColumnHeader, rows } = params
  const absoluteMaster = path.resolve(masterFilePath)
  const dir = path.dirname(absoluteMaster)
  const base = path.basename(absoluteMaster)
  const tempPath = path.join(dir, `.~${base}.${process.pid}.tmp.xlsx`)

  const writeMap = new Map<string, number>()
  for (const row of rows) {
    writeMap.set(compositeKey(row.item, row.unitPrice), row.amount)
  }

  try {
    await fs.copyFile(absoluteMaster, tempPath)
  } catch (error) {
    throw new SafeWriteIpcDataError(
      `无法创建备份副本: ${absoluteMaster}`,
      isFileLockedError(error) ? 'FILE_LOCKED' : 'INTERNAL_ERROR',
      error
    )
  }

  try {
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(tempPath)
    sanitiseWorkbookSharedFormulas(workbook)
    const worksheet = workbook.getWorksheet(worksheetName)
    if (!worksheet) {
      throw new SafeWriteIpcDataError(
        `工作表不存在: ${worksheetName}`,
        'INTERNAL_ERROR'
      )
    }

    const layout = findHeaderLayout(worksheet)
    if (!layout) {
      throw new SafeWriteIpcDataError('无法识别 Item 与 Unit Price 表头', 'INTERNAL_ERROR')
    }

    const periodCol = findOrInsertPeriodColumn(worksheet, layout, periodColumnHeader)
    const dataStartRow = layout.headerRow + 1
    let written = 0

    for (let r = dataStartRow; r <= worksheet.rowCount; r++) {
      const row = worksheet.getRow(r)
      const itemText = String(row.getCell(layout.itemCol).text ?? '').trim()
      if (!itemText) {
        continue
      }
      const unitPrice = parseCellNumber(row.getCell(layout.unitPriceCol).value) ?? 0
      const key = compositeKey(itemText, unitPrice)
      const amount = writeMap.get(key)
      if (amount === undefined) {
        continue
      }
      const target = row.getCell(periodCol)
      target.value = amount
      written += 1
    }

    logger.info('safeWriteIpcData rows written', {
      masterFilePath: absoluteMaster,
      worksheetName,
      periodColumnHeader,
      written,
      requested: writeMap.size
    })

    await workbook.xlsx.writeFile(tempPath)
    await fs.rename(tempPath, absoluteMaster)
  } catch (error) {
    await fs.unlink(tempPath).catch(() => undefined)
    if (error instanceof SafeWriteIpcDataError) {
      throw error
    }
    throw new SafeWriteIpcDataError(
      isFileLockedError(error)
        ? `文件被占用或无法写入，请关闭 Excel 后重试: ${absoluteMaster}`
        : `写入失败: ${error instanceof Error ? error.message : String(error)}`,
      isFileLockedError(error) ? 'FILE_LOCKED' : 'INTERNAL_ERROR',
      error
    )
  }
}
