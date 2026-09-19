import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { pageFromMeasuredScrollTop, resolveDocumentPageWindow, topSpacerScrollAdjustment } from './document-page-window'

/** Derive the visible page window from measured row heights. */
export function useDocumentPageWindow(
  scrollRootRef: RefObject<HTMLElement | null>,
  enabled: boolean,
  totalPages: number,
  getRowHeight: (pageNumber: number) => number,
  heightVersion: number,
  fallbackRowHeight: number,
  batchSize?: number,
) {
  const [currentPage, setCurrentPage] = useState(1)
  const getRowHeightRef = useRef(getRowHeight)
  getRowHeightRef.current = getRowHeight

  useEffect(() => {
    if (!enabled) {
      setCurrentPage(1)
      return
    }

    const root = scrollRootRef.current
    if (!root) return

    let frame = 0
    const sync = () => {
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        const next = pageFromMeasuredScrollTop(root.scrollTop, totalPages, getRowHeightRef.current)
        setCurrentPage((previous) => (previous === next ? previous : next))
      })
    }

    sync()
    root.addEventListener('scroll', sync, { passive: true })
    return () => {
      root.removeEventListener('scroll', sync)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [enabled, fallbackRowHeight, heightVersion, scrollRootRef, totalPages])

  const { startPage, endPage } = resolveDocumentPageWindow(
    currentPage,
    totalPages,
    undefined,
    batchSize,
  )
  const topSpacerRef = useRef(0)
  const startPageRef = useRef(startPage)

  useLayoutEffect(() => {
    const root = scrollRootRef.current
    if (!root || !enabled || startPage <= 1) {
      topSpacerRef.current = 0
      startPageRef.current = startPage
      return
    }
    let top = 0
    for (let page = 1; page < startPage; page += 1) top += Math.max(1, getRowHeightRef.current(page))
    const previous = topSpacerRef.current
    const startPageChanged = startPageRef.current !== startPage
    topSpacerRef.current = top
    startPageRef.current = startPage
    const delta = topSpacerScrollAdjustment(startPageChanged, previous, top)
    if (delta !== 0) root.scrollTop += delta
  }, [enabled, fallbackRowHeight, heightVersion, scrollRootRef, startPage])

  return { currentPage, startPage, endPage }
}
