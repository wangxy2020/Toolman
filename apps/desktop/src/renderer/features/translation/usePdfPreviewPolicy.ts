import { useCallback, useEffect, useRef, useState } from 'react'
import {
  evictOtherPdfViewerDocuments,
  getPdfViewerDocument,
  prefetchPdfViewerPageBatch,
} from './document-pdf-viewer'
import {
  resolvePdfPreviewActive,
  resolvePdfPreviewDirection,
  type PdfPreviewDirection,
} from './document-page-preview-policy'

/** Track the current page paint; windowed rows render live via PDF.js. */
export function usePdfPreviewPolicy(
  currentPage: number,
  totalPages: number,
  filePath: string | null,
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
      setReadyPage(null)
    }
  }, [currentPage])

  useEffect(() => {
    if (!filePath) return
    evictOtherPdfViewerDocuments(filePath)
    void getPdfViewerDocument(filePath).catch(() => undefined)
  }, [filePath])

  useEffect(() => {
    if (!filePath || totalPages < 1) return
    if (readyPage !== currentPage) return
    prefetchPdfViewerPageBatch(filePath, currentPage, totalPages)
  }, [currentPage, filePath, readyPage, totalPages])

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
    cacheEpoch: 0,
  }
}
