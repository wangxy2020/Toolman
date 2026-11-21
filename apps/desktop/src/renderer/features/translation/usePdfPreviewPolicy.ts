import { useCallback, useEffect, useRef, useState } from 'react'
import {
  prefetchRendererPdfDocument,
  releaseRendererPdfDocument,
} from './pdf-renderer-document'
import {
  resolvePdfPreviewActive,
  resolvePdfPreviewDirection,
  type PdfPreviewDirection,
} from './document-page-preview-policy'

/**
 * Left-pane PDF policy for renderer canvas paints:
 * warm the pdf.js document once, track scroll direction / active radius.
 * Page rasters happen in-renderer (no main-process JPEG IPC).
 */
export function usePdfPreviewPolicy(
  currentPage: number,
  totalPages: number,
  filePath: string | null,
  _pageWidth = 0,
  _scrollSettled = true,
) {
  const [readyPage, setReadyPage] = useState<number | null>(null)
  const [readyFilePath, setReadyFilePath] = useState(filePath)
  const [direction, setDirection] = useState<PdfPreviewDirection>(1)
  const previousPageRef = useRef(currentPage)

  if (readyFilePath !== filePath) {
    setReadyFilePath(filePath)
    setReadyPage(null)
  }

  useEffect(() => {
    const previous = previousPageRef.current
    if (previous !== currentPage) {
      setDirection(resolvePdfPreviewDirection(previous, currentPage))
      previousPageRef.current = currentPage
    }
  }, [currentPage])

  useEffect(() => {
    if (!filePath) return
    prefetchRendererPdfDocument(filePath)
    return () => {
      void releaseRendererPdfDocument(filePath)
    }
  }, [filePath])

  const markPageReady = useCallback(
    (pageNumber: number) => {
      if (pageNumber === currentPage) setReadyPage(pageNumber)
    },
    [currentPage],
  )

  const isPreviewActive = useCallback(
    (pageNumber: number) =>
      resolvePdfPreviewActive({
        pageNumber,
        currentPage,
        readyPage,
        totalPages,
        direction,
      }),
    [currentPage, direction, readyPage, totalPages],
  )

  return {
    isPreviewActive,
    markPageReady,
    /** Kept for row prop compatibility; canvas path does not use blob cache epochs. */
    cacheEpoch: 0,
  }
}
