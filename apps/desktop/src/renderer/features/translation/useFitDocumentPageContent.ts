import { useLayoutEffect, useRef, type RefObject } from 'react'
import {
  DOCUMENT_FIT_SCALE_MIN,
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
import {
  getSharedDocumentPageFit,
  reportDocumentPageNaturalFit,
  subscribeSharedDocumentPageFit,
  type DocumentFitKind,
} from './document-page-fit-shared'

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

function withBox(
  style: { fontSize: number; lineHeight: number; padding: number; scale: number },
  boxWidth: number,
  boxHeight: number,
): DocumentPageFitRecord {
  return { ...style, boxWidth, boxHeight }
}

/** Keep the right pane at the PDF page height; shrink 字号 to fontMin, then scroll if needed. */
export function useFitDocumentPageContent(
  enabled: boolean,
  contentKey: string,
  savedFit: DocumentPageFitRecord | null = null,
  onPersistFit?: (fit: DocumentPageFitRecord) => void,
  caps: DocumentPageFitCaps = DOCUMENT_PAGE_FIT_PROSE_CAPS,
  deferMeasure = false,
  documentId: string | null = null,
  pageNumber = 0,
  fitKind: DocumentFitKind = 'prose',
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
    if (!box) return

    let cancelled = false

    const commit = (next: DocumentPageFitRecord, persist = true) => {
      applyDocumentPageFitVars(box, next)
      const previous = measuredFitRef.current
      measuredFitRef.current = next
      if (persist && (!previous || !isSameDocumentPageFit(previous, next))) {
        persistRef.current?.(next)
      }
    }

    const paintStable = () => {
      // Neighbors / mid-scroll: prefer document shared 字号, then last measure.
      const shared = documentId ? getSharedDocumentPageFit(documentId, fitKind) : null
      const base = measuredFitRef.current ?? savedFitRef.current
      if (shared) {
        const next = withBox(
          { ...shared, scale: 1 },
          base?.boxWidth || box.clientWidth,
          base?.boxHeight || box.clientHeight,
        )
        commit(next, false)
        return
      }
      if (base) commit(base, false)
    }

    if (!enabled) {
      paintStable()
      const unsubscribeShared = subscribeSharedDocumentPageFit(() => {
        if (cancelled) return
        paintStable()
      })
      return () => {
        cancelled = true
        unsubscribeShared()
      }
    }

    let frame = 0
    if (savedFitRef.current) measuredFitRef.current = savedFitRef.current

    const applySharedOrNatural = (
      natural: { fontSize: number; lineHeight: number; padding: number; scale: number },
      boxWidth: number,
      boxHeight: number,
    ) => {
      if (documentId && pageNumber > 0) {
        const shared = reportDocumentPageNaturalFit({
          documentId,
          pageNumber,
          kind: fitKind,
          fontSize: natural.fontSize,
          caps,
        })
        // Document median 字号 — dense pages scroll instead of shrinking alone.
        commit(withBox({ ...shared, scale: 1 }, boxWidth, boxHeight))
        return
      }
      commit(withBox(natural, boxWidth, boxHeight))
    }

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
      measuringRef.current = false
      applySharedOrNatural({ ...nextType, scale }, boxWidth, boxHeight)
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
        if (documentId && pageNumber > 0) {
          reportDocumentPageNaturalFit({
            documentId,
            pageNumber,
            kind: fitKind,
            fontSize: saved.fontSize,
            caps,
          })
          const shared = getSharedDocumentPageFit(documentId, fitKind)
          if (shared) {
            commit(
              withBox(
                {
                  ...shared,
                  scale: saved.scale >= DOCUMENT_FIT_SCALE_MIN ? saved.scale : 1,
                },
                boxWidth,
                boxHeight,
              ),
            )
            return
          }
        }
        commit(saved)
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
      // Keep 字号 stable on maximize / resize — only refresh recorded box size.
      const scaled = scaleDocumentPageFitForBox(measured, boxWidth, boxHeight, caps)
      measuredFitRef.current = { ...measured, ...scaled, boxWidth, boxHeight }
      applyDocumentPageFitVars(box, measuredFitRef.current)
    })
    observer.observe(box)

    const unsubscribeShared = subscribeSharedDocumentPageFit(() => {
      if (cancelled || measuringRef.current || !documentId) return
      const shared = getSharedDocumentPageFit(documentId, fitKind)
      const measured = measuredFitRef.current
      if (!shared || !measured) return
      if (Math.abs(shared.fontSize - measured.fontSize) < 0.15) return
      commit(
        withBox(
          { ...shared, scale: 1 },
          measured.boxWidth || box.clientWidth,
          measured.boxHeight || box.clientHeight,
        ),
      )
    })

    return () => {
      cancelled = true
      if (frame) window.cancelAnimationFrame(frame)
      observer.disconnect()
      unsubscribeShared()
    }
  }, [caps, contentKey, deferMeasure, documentId, enabled, fitKind, pageNumber])

  return boxRef
}
