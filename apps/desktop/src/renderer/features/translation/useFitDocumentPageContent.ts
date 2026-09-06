import { useEffect, useRef, type RefObject } from 'react'
import {
  DOCUMENT_PAGE_FIT_RESET,
  applyDocumentPageFitVars,
  resolveDocumentPageFitScale,
  scaleDocumentPageFitForBox,
  usesFixedDocumentPageType,
  type DocumentPageFitRecord,
} from './document-page-fit'

/** Fit parse/translation text into a PDF-sized pane without a scrollbar. */
export function useFitDocumentPageContent(
  enabled: boolean,
  contentKey: string,
  savedFit: DocumentPageFitRecord | null = null,
  onPersistFit?: (fit: DocumentPageFitRecord) => void,
): RefObject<HTMLDivElement | null> {
  const boxRef = useRef<HTMLDivElement | null>(null)
  const persistRef = useRef(onPersistFit)
  persistRef.current = onPersistFit
  const savedFitRef = useRef(savedFit)
  savedFitRef.current = savedFit

  useEffect(() => {
    const box = boxRef.current
    if (!box || !enabled) {
      if (box) applyDocumentPageFitVars(box, DOCUMENT_PAGE_FIT_RESET)
      return
    }

    let cancelled = false
    let frame = 0

    const applySaved = (fit: DocumentPageFitRecord) => {
      applyDocumentPageFitVars(
        box,
        scaleDocumentPageFitForBox(fit, box.clientWidth, box.clientHeight),
      )
    }

    if (savedFit && usesFixedDocumentPageType(savedFit)) {
      applySaved(savedFit)
      const observer = new ResizeObserver(() => {
        if (cancelled || !savedFitRef.current) return
        applySaved(savedFitRef.current)
      })
      observer.observe(box)
      return () => {
        cancelled = true
        observer.disconnect()
      }
    }

    const applyMeasured = () => {
      if (cancelled) return
      applyDocumentPageFitVars(box, DOCUMENT_PAGE_FIT_RESET)
      const inner = box.firstElementChild as HTMLElement | null
      const boxHeight = box.clientHeight
      const boxWidth = box.clientWidth
      const contentHeight = inner?.scrollHeight ?? box.scrollHeight
      const scale = resolveDocumentPageFitScale(contentHeight, boxHeight)
      applyDocumentPageFitVars(box, { ...DOCUMENT_PAGE_FIT_RESET, scale })
      if (boxWidth > 0 && boxHeight > 0) {
        persistRef.current?.({
          ...DOCUMENT_PAGE_FIT_RESET,
          scale,
          boxWidth,
          boxHeight,
        })
      }
    }

    frame = window.requestAnimationFrame(() => {
      frame = window.requestAnimationFrame(applyMeasured)
    })
    return () => {
      cancelled = true
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [contentKey, enabled, savedFit])

  return boxRef
}
