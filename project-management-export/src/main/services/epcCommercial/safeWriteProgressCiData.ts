import fs from 'node:fs/promises'
import path from 'node:path'

import ExcelJS from 'exceljs'
import { loggerService } from '@logger'

import { amountToEnglishWords, currencyWordsFor } from '@main/services/epcCommercial/amountInWords'
import { sanitiseWorkbookSharedFormulas } from '@main/services/epcCommercial/exceljsSharedFormulaSanitise'

const logger = loggerService.withContext('SafeWriteProgressCiData')

export type SafeWriteProgressCiErrorCode = 'FILE_LOCKED' | 'INTERNAL_ERROR'

export class SafeWriteProgressCiDataError extends Error {
  readonly code: SafeWriteProgressCiErrorCode

  constructor(message: string, code: SafeWriteProgressCiErrorCode, cause?: unknown) {
    super(message)
    this.name = 'SafeWriteProgressCiDataError'
    this.code = code
    if (cause instanceof Error) {
      this.cause = cause
    }
  }
}

export interface SafeWriteProgressCiRowWrite {
  item: string
  description: string
  unit: string
  estQty?: number
  unitPrice: number
  previous: number
  current: number
  endTotal: number
  proportion?: number
  currentTotalPrice: number
}

export interface SafeWriteProgressCiDataParams {
  outputPath: string
  periodColumnHeader: string
  /** 目标 Schedule 分项号（更新发票内 SCHEDULE 标题） */
  schDigit?: number
  /** 货币代码（如 USD/TZS），用于更新表头货币与英文大写 */
  currency?: string
  /** SCHn-IPCx 文件夹中的批次号（如 2025004），用于推导 Invoice No */
  batchNumber?: string
  rows: SafeWriteProgressCiRowWrite[]
}

interface InvoiceLayout {
  headerRow: number
  dataStartRow: number
  itemCol: number
  descriptionCol?: number
  unitCol?: number
  estQtyCol?: number
  /** 发票模板的 Quantity 列（本期数量） */
  qtyCol?: number
  unitPriceCol?: number
  previousCol?: number
  currentCol?: number
  endTotalCol?: number
  proportionCol?: number
  /** Total Price / Current Total Price 列 */
  totalCol?: number
}

interface MergeRect {
  top: number
  left: number
  bottom: number
  right: number
}

const MAX_HEADER_SCAN_ROWS = 120
/** 黄色：提示用户该单元格内容为自动生成/需人工确认 */
const HIGHLIGHT_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } }

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

const cellText = (cell: ExcelJS.Cell): string => {
  try {
    // exceljs 的 MergeValue.toString 在主单元格值为 null 时会抛错
    return String(cell.text ?? '').trim()
  } catch {
    return ''
  }
}

const round2 = (v: number): number => Math.round(v * 100) / 100

const colLetter = (n: number): string => {
  let s = ''
  let rest = n
  while (rest > 0) {
    const m = (rest - 1) % 26
    s = String.fromCharCode(65 + m) + s
    rest = Math.floor((rest - 1) / 26)
  }
  return s
}

const rectToRange = (m: MergeRect): string => `${colLetter(m.left)}${m.top}:${colLetter(m.right)}${m.bottom}`

const copyCellStyle = (from: ExcelJS.Cell, to: ExcelJS.Cell): void => {
  if (!from.style) {
    return
  }
  try {
    to.style = JSON.parse(JSON.stringify(from.style)) as ExcelJS.Style
  } catch {
    // 样式深拷贝失败时跳过
  }
}

const highlightCell = (cell: ExcelJS.Cell): void => {
  try {
    cell.fill = HIGHLIGHT_FILL
  } catch {
    // 忽略填充失败
  }
}

const sheetWidth = (worksheet: ExcelJS.Worksheet): number => Math.max(worksheet.columnCount, 1)

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
const detectInvoiceLayout = (worksheet: ExcelJS.Worksheet): InvoiceLayout | null => {
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

const pickCommercialInvoiceWorksheet = (workbook: ExcelJS.Workbook): ExcelJS.Worksheet | undefined => {
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
const findSummaryStartRow = (worksheet: ExcelJS.Worksheet, dataStartRow: number): number | null => {
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

const tableColumns = (layout: InvoiceLayout): number[] => {
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
const findFirstItemRow = (worksheet: ExcelJS.Worksheet, layout: InvoiceLayout, dataEndRow: number): number => {
  for (let r = layout.dataStartRow; r <= dataEndRow; r++) {
    if (cellText(worksheet.getRow(r).getCell(layout.itemCol))) {
      return r
    }
  }
  return layout.dataStartRow
}

const clearDataRegion = (
  worksheet: ExcelJS.Worksheet,
  layout: InvoiceLayout,
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

const getMergeRects = (worksheet: ExcelJS.Worksheet): MergeRect[] => {
  const internal = (worksheet as unknown as { _merges?: Record<string, unknown> })._merges ?? {}
  const rects: MergeRect[] = []
  for (const key of Object.keys(internal)) {
    const raw = internal[key] as { model?: Partial<MergeRect> } & Partial<MergeRect>
    const m = raw?.model ?? raw
    if (
      m &&
      typeof m.top === 'number' &&
      typeof m.left === 'number' &&
      typeof m.bottom === 'number' &&
      typeof m.right === 'number'
    ) {
      rects.push({ top: m.top, left: m.left, bottom: m.bottom, right: m.right })
    }
  }
  return rects
}

/**
 * 在 insertAt 前插入 count 行（样式继承上一行），并手动平移 insertAt 及以下的合并单元格、
 * 复制样板数据行的行内合并（如 DESCRIPTION 跨列）。
 */
const insertRowsPreservingMerges = (
  worksheet: ExcelJS.Worksheet,
  insertAt: number,
  count: number,
  modelRow: number
): void => {
  const merges = getMergeRects(worksheet)
  const toShift = merges.filter((m) => m.top >= insertAt)
  const modelMerges = merges.filter((m) => m.top === modelRow && m.bottom === modelRow)
  for (const m of toShift) {
    try {
      worksheet.unMergeCells(rectToRange(m))
    } catch {
      // 忽略已解除的合并
    }
  }
  worksheet.insertRows(
    insertAt,
    Array.from({ length: count }, () => []),
    'i'
  )
  for (const m of toShift) {
    try {
      worksheet.mergeCells(rectToRange({ ...m, top: m.top + count, bottom: m.bottom + count }))
    } catch {
      // 合并冲突时跳过
    }
  }
  const model = worksheet.getRow(modelRow)
  const width = sheetWidth(worksheet)
  for (let i = 0; i < count; i++) {
    const r = insertAt + i
    const row = worksheet.getRow(r)
    if (model.height) {
      row.height = model.height
    }
    for (let c = 1; c <= width; c++) {
      copyCellStyle(model.getCell(c), row.getCell(c))
    }
    for (const m of modelMerges) {
      try {
        worksheet.mergeCells(`${colLetter(m.left)}${r}:${colLetter(m.right)}${r}`)
      } catch {
        // 合并冲突时跳过
      }
    }
  }
}

interface ImageAnchorLike {
  nativeRow?: number
  row?: number
}

interface ImageRangeLike {
  tl?: ImageAnchorLike
  br?: ImageAnchorLike
  editAs?: string
}

/**
 * 插入行后整体下移图片锚点：tl/br 同步平移，
 * 图片尺寸（长宽比）与相对原单元格的位置保持不变。
 */
const shiftImageAnchors = (worksheet: ExcelJS.Worksheet, insertAt: number, count: number): void => {
  if (count <= 0) {
    return
  }
  const images = (worksheet.getImages?.() ?? []) as Array<{ range?: ImageRangeLike }>
  // ExcelJS 锚点行号为 0 基；1 基的 insertAt 行及以下需要平移
  const threshold = insertAt - 1
  const shiftAnchor = (anchor?: ImageAnchorLike): void => {
    if (!anchor) {
      return
    }
    if (typeof anchor.nativeRow === 'number') {
      anchor.nativeRow += count
    } else if (typeof anchor.row === 'number') {
      anchor.row += count
    }
  }
  for (const image of images) {
    const range = image.range
    if (!range || range.editAs === 'absolute') {
      continue
    }
    const tlRow =
      typeof range.tl?.nativeRow === 'number'
        ? range.tl.nativeRow
        : typeof range.tl?.row === 'number'
          ? range.tl.row
          : null
    if (tlRow === null || tlRow < threshold) {
      continue
    }
    shiftAnchor(range.tl)
    shiftAnchor(range.br)
  }
}

/** 小节标题行（如 "22.1 400kV Circuit Breakers"）：无单位且无数量/价格 */
const isSectionRow = (row: SafeWriteProgressCiRowWrite): boolean =>
  !row.unit.trim() &&
  Math.abs(row.unitPrice) < Number.EPSILON &&
  Math.abs(row.current) < Number.EPSILON &&
  Math.abs(row.currentTotalPrice) < Number.EPSILON

const writeInvoiceRows = (
  worksheet: ExcelJS.Worksheet,
  layout: InvoiceLayout,
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
const rewriteSummarySection = (
  worksheet: ExcelJS.Worksheet,
  layout: InvoiceLayout,
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
const updateAmountInWords = (worksheet: ExcelJS.Worksheet, totalToBePaid: number, currency?: string): void => {
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
const updateInvoiceHeaderFields = (
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
const applyCurrencyToHeaderRow = (worksheet: ExcelJS.Worksheet, headerRow: number, currency?: string): void => {
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

/**
 * 在进度款商业发票模板上原地改写：
 * 1) 清空原工程量清单并按 CIP 行重填（数量×单价以公式写入），插行后图片锚点同步下移；
 * 2) 重算 BOQ Value/扣减/TOTAL TO BE PAID 等汇总区公式与缓存值；
 * 3) 更新 Date、Invoice No、SCHEDULE 标题、表头货币与金额英文大写；
 * 4) 自动生成或无法判定的字段以黄色背景高亮，提醒人工确认。
 */
export async function safeWriteProgressCiData(params: SafeWriteProgressCiDataParams): Promise<void> {
  const { outputPath, periodColumnHeader, schDigit, currency, batchNumber, rows } = params
  const absolutePath = path.resolve(outputPath)
  const dir = path.dirname(absolutePath)
  const base = path.basename(absolutePath)
  const tempPath = path.join(dir, `.~${base}.${process.pid}.tmp.xlsx`)

  try {
    await fs.copyFile(absolutePath, tempPath)
  } catch (error) {
    throw new SafeWriteProgressCiDataError(
      `无法创建备份副本: ${absolutePath}`,
      isFileLockedError(error) ? 'FILE_LOCKED' : 'INTERNAL_ERROR',
      error
    )
  }

  try {
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(tempPath)
    sanitiseWorkbookSharedFormulas(workbook)
    const worksheet = pickCommercialInvoiceWorksheet(workbook)
    if (!worksheet) {
      throw new SafeWriteProgressCiDataError('工作簿无可用工作表', 'INTERNAL_ERROR')
    }

    const layout = detectInvoiceLayout(worksheet)
    if (!layout) {
      throw new SafeWriteProgressCiDataError(
        '无法识别进度款商业发票表头（需含 Item 与 Unit Price / Total Price 列）',
        'INTERNAL_ERROR'
      )
    }

    const summaryStartRow = findSummaryStartRow(worksheet, layout.dataStartRow)
    const dataEndRow = summaryStartRow !== null ? summaryStartRow - 1 : worksheet.rowCount
    const writeStartRow = findFirstItemRow(worksheet, layout, dataEndRow)

    clearDataRegion(worksheet, layout, layout.dataStartRow, dataEndRow)

    let inserted = 0
    if (summaryStartRow !== null) {
      const available = summaryStartRow - writeStartRow
      if (rows.length > available) {
        inserted = rows.length - available
        insertRowsPreservingMerges(worksheet, summaryStartRow, inserted, summaryStartRow - 1)
        shiftImageAnchors(worksheet, summaryStartRow, inserted)
      }
    }

    const written = writeInvoiceRows(worksheet, layout, rows, writeStartRow)
    const boqValue = rows.reduce((sum, row) => (isSectionRow(row) ? sum : sum + row.currentTotalPrice), 0)

    if (summaryStartRow !== null) {
      const newSummaryStart = summaryStartRow + inserted
      const totalToBePaid = rewriteSummarySection(
        worksheet,
        layout,
        newSummaryStart,
        writeStartRow,
        newSummaryStart - 1,
        boqValue
      )
      if (totalToBePaid !== null) {
        updateAmountInWords(worksheet, totalToBePaid, currency)
      }
    }

    updateInvoiceHeaderFields(worksheet, layout.headerRow, {
      schDigit,
      batchNumber,
      period: periodColumnHeader
    })
    applyCurrencyToHeaderRow(worksheet, layout.headerRow, currency)

    workbook.calcProperties = { ...workbook.calcProperties, fullCalcOnLoad: true }

    logger.info('safeWriteProgressCiData rows written', {
      outputPath: absolutePath,
      periodColumnHeader,
      written,
      requested: rows.length,
      inserted,
      boqValue: round2(boqValue)
    })

    await workbook.xlsx.writeFile(tempPath)
    await fs.rename(tempPath, absolutePath)
  } catch (error) {
    await fs.unlink(tempPath).catch(() => undefined)
    if (error instanceof SafeWriteProgressCiDataError) {
      throw error
    }
    throw new SafeWriteProgressCiDataError(
      isFileLockedError(error)
        ? `文件被占用或无法写入，请关闭 Excel 后重试: ${absolutePath}`
        : `写入失败: ${error instanceof Error ? error.message : String(error)}`,
      isFileLockedError(error) ? 'FILE_LOCKED' : 'INTERNAL_ERROR',
      error
    )
  }
}
