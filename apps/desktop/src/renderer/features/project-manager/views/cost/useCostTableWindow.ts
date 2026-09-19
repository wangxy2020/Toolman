import { useLayoutEffect, useState, type RefObject } from 'react'

import {
  COST_TABLE_WINDOW_THRESHOLD,
  costTableVariableWindowRange,
  costTableWindowRange,
  sameCostTableWindowRange,
  type CostTableWindowRange,
} from './pm-cost-table-window'

export function shouldWindowCostTable(rowCount: number, enabled: boolean): boolean {
  return enabled && rowCount >= COST_TABLE_WINDOW_THRESHOLD
}

export function useCostTableWindow(
  scrollRef: RefObject<HTMLElement | null>,
  rowCount: number,
  enabled: boolean,
  rowHeights?: readonly number[],
): CostTableWindowRange {
  const [printAll, setPrintAll] = useState(false)
  const active = shouldWindowCostTable(rowCount, enabled) && !printAll
  const [range, setRange] = useState<CostTableWindowRange>(() =>
    active
      ? costTableWindowRange({ scrollTop: 0, viewportHeight: 600, rowCount })
      : { start: 0, end: rowCount, topPad: 0, bottomPad: 0 },
  )

  useLayoutEffect(() => {
    if (!enabled) return
    const onBeforePrint = () => setPrintAll(true)
    const onAfterPrint = () => setPrintAll(false)
    window.addEventListener('beforeprint', onBeforePrint)
    window.addEventListener('afterprint', onAfterPrint)
    return () => {
      window.removeEventListener('beforeprint', onBeforePrint)
      window.removeEventListener('afterprint', onAfterPrint)
    }
  }, [enabled])

  useLayoutEffect(() => {
    if (!active) {
      setRange({ start: 0, end: rowCount, topPad: 0, bottomPad: 0 })
      return
    }
    const el = scrollRef.current
    if (!el) {
      setRange(costTableWindowRange({ scrollTop: 0, viewportHeight: 600, rowCount }))
      return
    }
    const update = () => {
      const next =
        rowHeights && rowHeights.length === rowCount
          ? costTableVariableWindowRange({
              scrollTop: el.scrollTop,
              viewportHeight: el.clientHeight,
              heights: rowHeights,
            })
          : costTableWindowRange({
              scrollTop: el.scrollTop,
              viewportHeight: el.clientHeight,
              rowCount,
            })
      setRange((prev) => (sameCostTableWindowRange(prev, next) ? prev : next))
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => {
      el.removeEventListener('scroll', update)
      observer.disconnect()
    }
  }, [active, rowCount, rowHeights, scrollRef])

  if (!active) {
    return { start: 0, end: rowCount, topPad: 0, bottomPad: 0 }
  }
  if (range.end === 0 && rowCount > 0) {
    if (rowHeights && rowHeights.length === rowCount) {
      return costTableVariableWindowRange({
        scrollTop: 0,
        viewportHeight: 600,
        heights: rowHeights,
      })
    }
    return costTableWindowRange({ scrollTop: 0, viewportHeight: 600, rowCount })
  }
  return range
}
