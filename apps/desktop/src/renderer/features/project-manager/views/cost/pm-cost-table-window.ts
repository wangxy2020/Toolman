import { COST_TOGGLE_COLUMNS, type CostColumnVisibility } from './pm-cost-column-prefs'
import { COST_METERING_COLUMNS } from './pm-cost-metering-cols'

export const COST_TABLE_ROW_HEIGHT_PX = 36
export const COST_TABLE_WINDOW_THRESHOLD = 48
export const COST_TABLE_WINDOW_OVERSCAN = 10

export type CostTableWindowRange = {
  start: number
  end: number
  topPad: number
  bottomPad: number
}

export function countCostTableColumns(
  visibility: CostColumnVisibility,
  options?: { showMeteringColumns?: boolean; ipcColumnCount?: number },
): number {
  let count = 2
  for (const column of COST_TOGGLE_COLUMNS) {
    if (visibility[column]) count += 1
  }
  if (options?.showMeteringColumns) count += COST_METERING_COLUMNS.length
  if (options?.ipcColumnCount != null) count += options.ipcColumnCount + 2
  return count
}

export function costTableWindowRange(input: {
  scrollTop: number
  viewportHeight: number
  rowCount: number
  rowHeight?: number
  overscan?: number
}): CostTableWindowRange {
  const rowHeight = input.rowHeight ?? COST_TABLE_ROW_HEIGHT_PX
  const overscan = input.overscan ?? COST_TABLE_WINDOW_OVERSCAN
  const { scrollTop, viewportHeight, rowCount } = input
  if (rowCount <= 0) {
    return { start: 0, end: 0, topPad: 0, bottomPad: 0 }
  }
  const firstVisible = Math.floor(Math.max(0, scrollTop) / rowHeight)
  const visible = Math.ceil(Math.max(rowHeight, viewportHeight) / rowHeight) + 1
  if (firstVisible >= rowCount) {
    const end = rowCount <= visible + overscan * 2 ? rowCount : Math.min(rowCount, visible + overscan)
    return { start: 0, end, topPad: 0, bottomPad: Math.max(0, (rowCount - end) * rowHeight) }
  }
  const start = Math.max(0, firstVisible - overscan)
  const end = Math.min(rowCount, firstVisible + visible + overscan)
  return {
    start,
    end,
    topPad: start * rowHeight,
    bottomPad: Math.max(0, (rowCount - end) * rowHeight),
  }
}

export function costTableVariableWindowRange(input: {
  scrollTop: number
  viewportHeight: number
  heights: readonly number[]
  overscan?: number
}): CostTableWindowRange {
  const overscan = input.overscan ?? COST_TABLE_WINDOW_OVERSCAN
  const { scrollTop, viewportHeight, heights } = input
  const rowCount = heights.length
  if (rowCount <= 0) {
    return { start: 0, end: 0, topPad: 0, bottomPad: 0 }
  }
  const prefix = new Array<number>(rowCount + 1)
  prefix[0] = 0
  for (let index = 0; index < rowCount; index += 1) {
    prefix[index + 1] = (prefix[index] ?? 0) + (heights[index] ?? COST_TABLE_ROW_HEIGHT_PX)
  }
  const total = prefix[rowCount] ?? 0
  const offsetOf = (index: number) => prefix[index] ?? 0
  const findRowAt = (offset: number) => {
    let low = 0
    let high = rowCount - 1
    while (low < high) {
      const mid = (low + high) >> 1
      if (offsetOf(mid + 1) <= offset) low = mid + 1
      else high = mid
    }
    return low
  }
  if (scrollTop >= total) {
    const visible = Math.max(1, Math.ceil(viewportHeight / COST_TABLE_ROW_HEIGHT_PX))
    if (rowCount <= visible + overscan * 2) {
      return { start: 0, end: rowCount, topPad: 0, bottomPad: 0 }
    }
    const start = 0
    const end = Math.min(rowCount, visible + overscan)
    return { start, end, topPad: 0, bottomPad: total - offsetOf(end) }
  }
  const rawStart = findRowAt(Math.max(0, scrollTop))
  const start = Math.max(0, rawStart - overscan)
  let end = rawStart
  const bottom = Math.max(0, scrollTop) + Math.max(COST_TABLE_ROW_HEIGHT_PX, viewportHeight)
  while (end < rowCount && offsetOf(end) < bottom) end += 1
  end = Math.min(rowCount, Math.max(end, rawStart + 1) + overscan)
  return {
    start,
    end,
    topPad: offsetOf(start),
    bottomPad: Math.max(0, total - offsetOf(end)),
  }
}

export function sameCostTableWindowRange(
  left: CostTableWindowRange,
  right: CostTableWindowRange,
): boolean {
  return (
    left.start === right.start &&
    left.end === right.end &&
    left.topPad === right.topPad &&
    left.bottomPad === right.bottomPad
  )
}
