import { useCallback, useEffect, useRef, useState } from 'react'
import { MIN_MEASURED_ROW_HEIGHT, resolveMeasuredRowHeight } from './document-page-window'

/** Remember mounted row heights; unmeasured pages use the average of measured ones. */
export function useDocumentRowHeights(documentId: string | null, fallbackHeight: number) {
  const measuredRef = useRef(new Map<number, number>())
  const pendingRef = useRef(new Map<number, number>())
  const timerRef = useRef<number | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    measuredRef.current = new Map()
    pendingRef.current = new Map()
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    setVersion(0)
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [documentId])

  const getRowHeight = useCallback(
    (pageNumber: number) => {
      void version
      return resolveMeasuredRowHeight(pageNumber, measuredRef.current, fallbackHeight)
    },
    [fallbackHeight, version],
  )

  const reportHeight = useCallback((pageNumber: number, height: number) => {
    const rounded = Math.round(height)
    if (rounded < MIN_MEASURED_ROW_HEIGHT) return
    if (measuredRef.current.get(pageNumber) === rounded) return
    pendingRef.current.set(pageNumber, rounded)
    if (timerRef.current !== null) return
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      let changed = false
      for (const [page, value] of pendingRef.current) {
        if (measuredRef.current.get(page) === value) continue
        measuredRef.current.set(page, value)
        changed = true
      }
      pendingRef.current.clear()
      if (changed) setVersion((value) => value + 1)
    }, 80)
  }, [])

  return { getRowHeight, reportHeight, version }
}
