import ExcelJS from 'exceljs'

import type { ProgressCiMergeRect } from './safeWriteProgressCiTypes.js'
import { colLetter, copyCellStyle, rectToRange, sheetWidth } from './safeWriteProgressCiExcelUtils.js'

const getMergeRects = (worksheet: ExcelJS.Worksheet): ProgressCiMergeRect[] => {
  const internal = (worksheet as unknown as { _merges?: Record<string, unknown> })._merges ?? {}
  const rects: ProgressCiMergeRect[] = []
  for (const key of Object.keys(internal)) {
    const raw = internal[key] as { model?: Partial<ProgressCiMergeRect> } & Partial<ProgressCiMergeRect>
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
export const insertRowsPreservingMerges = (
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
export const shiftImageAnchors = (worksheet: ExcelJS.Worksheet, insertAt: number, count: number): void => {
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