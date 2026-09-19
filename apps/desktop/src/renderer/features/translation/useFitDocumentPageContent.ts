import { useLayoutEffect, useRef, type RefObject } from 'react'
import {
  DOCUMENT_PAGE_FIT_PROSE_CAPS,
  applyDocumentPageFitVars,
  canReuseDocumentPageFit,
  documentPageFitReset,
  isNegligibleDocumentFitBoxChange,
  isSameDocumentPageFit,
  resolveDocumentPageFit,
  resolveDocumentPageFitScale,
  scaleDocumentPageFitForBox,
  tightenDocumentPageFit,
  type DocumentPageFitCaps,
  type DocumentPageFitRecord,
} from './document-page-fit'

function readAvailableHeight(box: HTMLElement, boxHeight: number): number {
  const style = window.getComputedStyle(box)
  const padY =
    (Number.parseFloat(style.paddingTop) || 0) + (Number.parseFloat(style.paddingBottom) || 0)
  return Math.max(1, boxHeight - padY)
}

function readContentHeight(box: HTMLElement, inner: HTMLElement | null): number {
  const previous = box.style.overflow
  box.style.overflow = 'visible'
  const height = Math.max(inner?.scrollHeight ?? 0, box.scrollHeight)
  box.style.overflow = previous
  return height
}

/** Keep the right pane at the PDF page height; shrink 字号/行距 until the text fits. */
export function useFitDocumentPageContent(
  enabled: boolean,
  contentKey: string,
  savedFit: DocumentPageFitRecord | null = null,
  onPersistFit?: (fit: DocumentPageFitRecord) => void,
  caps: DocumentPageFitCaps = DOCUMENT_PAGE_FIT_PROSE_CAPS,
  deferMeasure = false,
): RefObject<HTMLDivElement | null> {
  const boxRef = useRef<HTMLDivElement | null>(null)
  const persistRef = useRef(onPersistFit)
  persistRef.current = onPersistFit
  const savedFitRef = useRef(savedFit)
  savedFitRef.current = savedFit
  const measuredFitRef = useRef<DocumentPageFitRecord | null>(savedFit)
  const measuringRef = useRef(false)

  useLayoutEffect(() => {
    const box = boxRef.current
    if (!box || !enabled) {
      if (box) applyDocumentPageFitVars(box, documentPageFitReset(caps))
      return
    }

    let cancelled = false
    let frame = 0
    measuredFitRef.current = savedFitRef.current

    const measure = () => {
      if (cancelled) return
      const boxHeight = box.clientHeight
      const boxWidth = box.clientWidth
      if (boxHeight < 1 || boxWidth < 1) return

      measuringRef.current = true
      applyDocumentPageFitVars(box, documentPageFitReset(caps))
      const inner = box.firstElementChild as HTMLElement | null
      const availableHeight = readAvailableHeight(box, boxHeight)
      let nextType = resolveDocumentPageFit(readContentHeight(box, inner), availableHeight, caps)
      applyDocumentPageFitVars(box, { ...nextType, scale: 1 })
      for (let step = 0; step < 4; step += 1) {
        const fittedHeight = readContentHeight(box, inner)
        if (fittedHeight <= availableHeight + 1) break
        const tighter = tightenDocumentPageFit(nextType, fittedHeight, availableHeight, caps)
        if (
          tighter.fontSize === nextType.fontSize &&
          tighter.lineHeight === nextType.lineHeight &&
          tighter.padding === nextType.padding
        ) {
          break
        }
        nextType = tighter
        applyDocumentPageFitVars(box, { ...nextType, scale: 1 })
      }
      let scale = 1
      const overflowHeight = readContentHeight(box, inner)
      if (overflowHeight > availableHeight + 1) {
        scale = resolveDocumentPageFitScale(overflowHeight, availableHeight)
      }
      const next: DocumentPageFitRecord = { ...nextType, scale, boxWidth, boxHeight }
      applyDocumentPageFitVars(box, next)
      const previous = measuredFitRef.current
      measuredFitRef.current = next
      measuringRef.current = false
      if (!previous || !isSameDocumentPageFit(previous, next)) {
        persistRef.current?.(next)
      }
    }

    const start = () => {
      const boxWidth = box.clientWidth
      const boxHeight = box.clientHeight
      if (boxHeight < 1 || boxWidth < 1) {
        frame = window.requestAnimationFrame(measure)
        return
      }
      const saved = savedFitRef.current
      if (saved && canReuseDocumentPageFit(saved, boxWidth, boxHeight, caps)) {
        applyDocumentPageFitVars(box, saved)
        measuredFitRef.current = saved
        return
      }
      measure()
    }

    if (deferMeasure) {
      frame = window.requestAnimationFrame(start)
    } else {
      start()
    }

    const observer = new ResizeObserver(() => {
      if (cancelled || measuringRef.current) return
      const boxWidth = box.clientWidth
      const boxHeight = box.clientHeight
      if (boxHeight < 1 || boxWidth < 1) return
      const measured = measuredFitRef.current
      if (!measured || measured.boxHeight < 1) {
        measure()
        return
      }
      if (isNegligibleDocumentFitBoxChange(measured, boxWidth, boxHeight)) return
      const scaled = scaleDocumentPageFitForBox(measured, boxWidth, boxHeight, caps)
      const next = { ...measured, ...scaled, boxWidth, boxHeight }
      applyDocumentPageFitVars(box, next)
      measuredFitRef.current = next
    })
    observer.observe(box)

    return () => {
      cancelled = true
      if (frame) window.cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [caps, contentKey, deferMeasure, enabled])

  return boxRef
}
