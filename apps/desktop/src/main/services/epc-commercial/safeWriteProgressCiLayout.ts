import ExcelJS from 'exceljs'

import type { ProgressCiInvoiceLayout } from './safeWriteProgressCiTypes.js'
import { cellText, sheetWidth } from './safeWriteProgressCiExcelUtils.js'

const MAX_HEADER_SCAN_ROWS = 120

const normalizeHeader = (h: string): string => h.trim().toLowerCase().replace(/[._]/g, ' ').replace(/\s+/g, ' ')

const isItemHeader = (h: string): boolean => {
  const n = normalizeHeader(h)
  return (
    n === 'item' ||
    n === 'no' ||
    n === 'item no' ||
    n.startsWith('itemno') ||
    (n.startsWith('item') && n.endsWith('no'))
  )
}

const isDescriptionHeader = (h: string): boolean => {
  const n = normalizeHeader(h)
  return n.includes('description') || n === 'desc'
}

const isUnitHeader = (h: string): boolean => normalizeHeader(h) === 'unit'

const isEstQtyHeader = (h: string): boolean => {
  const n = normalizeHeader(h)
  return n.includes('est') && n.includes('qty')
}

const isQuantityHeader = (h: string): boolean => {
  const n = normalizeHeader(h)
  return n === 'quantity' || n === 'qty'
}

const isUnitPriceHeader = (h: string): boolean => {
  const n = normalizeHeader(h)
  return n.includes('unit price') || n.includes('unit rate')
}

const isPreviousHeader = (h: string): boolean => normalizeHeader(h) === 'previous'

const isCurrentHeader = (h: string): boolean => normalizeHeader(h) === 'current'

const isEndTotalHeader = (h: string): boolean => {
  const n = normalizeHeader(h)
  return (
    n.includes('period end') ||
    n.includes('period-end') ||
    n.includes('end comp') ||
    n.includes('comp total qty') ||
    n.includes('end total')
  )
}

const isProportionHeader = (h: string): boolean => {
  const n = normalizeHeader(h)
  return n.includes('proportion') || n.includes('settlement')
}

const isTotalPriceHeader = (h: string): boolean => {
  const n = normalizeHeader(h)
  return n.includes('current total') || (n.includes('total price') && !n.includes('unit'))
}

export const isFileLockedError = (error: unknown): boolean => {
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

const findColumn = (headers: string[], matcher: (h: string) => boolean): number | undefined => {
  const idx = headers.findIndex((h) => matcher(h))
  return idx >= 0 ? idx + 1 : undefined
}

const masterRowOf = (cell: ExcelJS.Cell): number => {
  try {
    const master = cell.isMerged ? cell.master : cell
    return Number(master.row) || Number(cell.row)
  } catch {
    return Number(cell.row)
  }
}

/** 表头可能纵向合并多行（如 ITEM 占 8:9），数据起始行需跳过其从属行，否则写入会穿透到表头 */
const resolveDataStartRow = (worksheet: ExcelJS.Worksheet, headerRow: number, itemCol: number): number => {
  let r = headerRow + 1
  while (r <= worksheet.rowCount) {
    const cell = worksheet.getRow(r).getCell(itemCol)
    if (cell.isMerged && masterRowOf(cell) <= headerRow) {
      r += 1
      continue
    }
    break
  }
  return r
}

/** 逐行扫描表头：要求 ITEM 与 Unit Price / Total Price / Current 在同一行 */
export const detectInvoiceLayout = (worksheet: ExcelJS.Worksheet): ProgressCiInvoiceLayout | null => {
  const lastRow = Math.min(worksheet.rowCount, MAX_HEADER_SCAN_ROWS)
  const width = sheetWidth(worksheet)
  for (let r = 1; r <= lastRow; r++) {
    const row = worksheet.getRow(r)
    const texts: string[] = []
    for (let c = 1; c <= width; c++) {
      texts.push(cellText(row.getCell(c)))
    }
    const itemCol = findColumn(texts, isItemHeader)
    if (!itemCol) {
      continue
    }
    const unitPriceCol = findColumn(texts, isUnitPriceHeader)
    const totalCol = findColumn(texts, isTotalPriceHeader)
    const currentCol = findColumn(texts, isCurrentHeader)
    if (!unitPriceCol && !totalCol && !currentCol) {
      continue
    }
    return {
      headerRow: r,
      dataStartRow: resolveDataStartRow(worksheet, r, itemCol),
      itemCol,
      descriptionCol: findColumn(texts, isDescriptionHeader),
      unitCol: findColumn(texts, isUnitHeader),
      estQtyCol: findColumn(texts, isEstQtyHeader),
      qtyCol: findColumn(texts, isQuantityHeader),
      unitPriceCol,
      previousCol: findColumn(texts, isPreviousHeader),
      currentCol,
      endTotalCol: findColumn(texts, isEndTotalHeader),
      proportionCol: findColumn(texts, isProportionHeader),
      totalCol
    }
  }
  return null
}

export const pickCommercialInvoiceWorksheet = (workbook: ExcelJS.Workbook): ExcelJS.Worksheet | undefined => {
  const preferred = workbook.worksheets.find((ws) => {
    const name = ws.name.toLowerCase()
    return name.includes('commercial') || name.includes('invoice') || name.includes('发票') || name.includes('progress')
  })
  if (preferred && detectInvoiceLayout(preferred)) {
    return preferred
  }
  for (const ws of workbook.worksheets) {
    if (detectInvoiceLayout(ws)) {
      return ws
    }
  }
  return preferred ?? workbook.worksheets[0]
}

/** 明细区结束位置：首个出现 "BOQ Value" 的行（汇总区起点） */
export const findSummaryStartRow = (worksheet: ExcelJS.Worksheet, dataStartRow: number): number | null => {
  const width = sheetWidth(worksheet)
  for (let r = dataStartRow; r <= worksheet.rowCount; r++) {
    const row = worksheet.getRow(r)
    for (let c = 1; c <= width; c++) {
      if (normalizeHeader(cellText(row.getCell(c))) === 'boq value') {
        return r
      }
    }
  }
  return null
}

const tableColumns = (layout: ProgressCiInvoiceLayout): number[] => {
  const cols = [
    layout.itemCol,
    layout.descriptionCol,
    layout.unitCol,
    layout.estQtyCol,
    layout.qtyCol,
    layout.unitPriceCol,
    layout.previousCol,
    layout.currentCol,
    layout.endTotalCol,
    layout.proportionCol,
    layout.totalCol
  ].filter((c): c is number => c !== undefined)
  return [...new Set(cols)]
}

/** 明细区中第一行原本有 Item 内容的行（跳过表头与数据间的空行） */
export const findFirstItemRow = (worksheet: ExcelJS.Worksheet, layout: ProgressCiInvoiceLayout, dataEndRow: number): number => {
  for (let r = layout.dataStartRow; r <= dataEndRow; r++) {
    if (cellText(worksheet.getRow(r).getCell(layout.itemCol))) {
      return r
    }
  }
  return layout.dataStartRow
}

export const clearDataRegion = (
  worksheet: ExcelJS.Worksheet,
  layout: ProgressCiInvoiceLayout,
  startRow: number,
  endRow: number
): void => {
  const cols = tableColumns(layout)
  let emptyStreak = 0
  for (let r = startRow; r <= endRow; r++) {
    const row = worksheet.getRow(r)
    let hadContent = false
    for (const col of cols) {
      const cell = row.getCell(col)
      if (cellText(cell)) {
        hadContent = true
      }
      cell.value = null
    }
    if (!hadContent) {
      emptyStreak += 1
      // 无汇总区时避免无限扫描
      if (endRow >= worksheet.rowCount && emptyStreak > 20) {
        break
      }
    } else {
      emptyStreak = 0
    }
  }
}