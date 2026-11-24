import { useLayoutEffect, useRef, type RefObject } from 'react'
import {
  DOCUMENT_PAGE_FIT_PROSE_CAPS,
  applyDocumentPageFitVars,
  canReuseDocumentPageFit,
  documentPageFitReset,
  isNegligibleDocumentFitBoxChange,
  isSameDocumentPageFit,
  resolveDocumentPageFit,
  resolveDocumentPageFitCapsForWidth,
  resolveDocumentPageFitScale,
  scaleDocumentPageFitForBox,
  shouldRemeasureDocumentPageFitForWidth,
  tightenDocumentPageFit,
  type DocumentPageFitCaps,
  type DocumentPageFitRecord,
} from './document-page-fit'
import {
  getSharedDocumentPageFit,
  reportDocumentPageNaturalFit,
  resolvePageFitAgainstShared,
  subscribeSharedDocumentPageFit,
  type DocumentFitKind,
} from './document-page-fit-shared'

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

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
      // Neighbors / mid-scroll: shared may shrink toward the document median,
      // but never enlarge past this page's last/saved fit (overflows the box).
      const shared = documentId ? getSharedDocumentPageFit(documentId, fitKind) : null
      const base = measuredFitRef.current ?? savedFitRef.current
      if (base) {
        commit(
          withBox(
            resolvePageFitAgainstShared(base, shared),
            base.boxWidth || box.clientWidth,
            base.boxHeight || box.clientHeight,
          ),
          false,
        )
        return
      }
      if (shared) {
        commit(withBox({ ...shared, scale: 1 }, box.clientWidth, box.clientHeight), false)
      }
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
        // Contribute to the document median for neighbors, but keep this page's
        // measured type — median pull-up was leaving dense pages too large.
        reportDocumentPageNaturalFit({
          documentId,
          pageNumber,
          kind: fitKind,
          fontSize: natural.fontSize,
          caps,
        })
      }
      commit(withBox(natural, boxWidth, boxHeight))
    }

    const measure = () => {
      if (cancelled) return
      const boxHeight = box.clientHeight
      const boxWidth = box.clientWidth
      if (boxHeight < 1 || boxWidth < 1) return

      // Two-bucket caps: default window vs maximized (no continuous width steps).
      const widthCaps = resolveDocumentPageFitCapsForWidth(boxWidth, caps)
      measuringRef.current = true
      const inner = box.firstElementChild as HTMLElement | null
      const availableHeight = readAvailableHeight(box, boxHeight)
      // Start from previous/shared size — resetting to fontMax every pass caused
      // visible 字号 jitter (large → small → shared median).
      const previous = measuredFitRef.current
      const shared = documentId ? getSharedDocumentPageFit(documentId, fitKind) : null
      const start = previous
        ? {
            fontSize: Math.max(
              widthCaps.fontMin,
              Math.min(widthCaps.fontMax, round1(previous.fontSize)),
            ),
            lineHeight: previous.lineHeight,
            padding: Math.max(
              widthCaps.padMin,
              Math.min(widthCaps.padMax, Math.round(previous.padding)),
            ),
          }
        : shared
          ? {
              fontSize: Math.max(
                widthCaps.fontMin,
                Math.min(widthCaps.fontMax, shared.fontSize),
              ),
              lineHeight: shared.lineHeight,
              padding: Math.max(widthCaps.padMin, Math.min(widthCaps.padMax, shared.padding)),
            }
          : documentPageFitReset(widthCaps)
      applyDocumentPageFitVars(box, { ...start, scale: 1 })
      let nextType = { ...start }
      const height = readContentHeight(box, inner)
      if (height > availableHeight + 1) {
        nextType = resolveDocumentPageFit(height, availableHeight, widthCaps)
        applyDocumentPageFitVars(box, { ...nextType, scale: 1 })
        for (let step = 0; step < 3; step += 1) {
          const fittedHeight = readContentHeight(box, inner)
          if (fittedHeight <= availableHeight + 1) break
          const tighter = tightenDocumentPageFit(
            nextType,
            fittedHeight,
            availableHeight,
            widthCaps,
          )
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
          commit(withBox(resolvePageFitAgainstShared(saved, shared), boxWidth, boxHeight))
          return
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
      // Only default ↔ maximized crosses remeasure 字号.
      if (shouldRemeasureDocumentPageFitForWidth(measured.boxWidth, boxWidth)) {
        measure()
        return
      }
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
      const next = resolvePageFitAgainstShared(measured, shared)
      if (Math.abs(next.fontSize - measured.fontSize) < 0.15) return
      commit(
        withBox(next, measured.boxWidth || box.clientWidth, measured.boxHeight || box.clientHeight),
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
