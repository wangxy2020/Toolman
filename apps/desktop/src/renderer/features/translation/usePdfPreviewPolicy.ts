import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getCachedPageImage, pageImageCacheKey } from './document-page-cache'
import { ensurePdfPageImage } from './document-page-preview-load'
import {
  resolvePdfPreviewActive,
  resolvePdfPreviewDirection,
  resolvePdfPreviewFetchPages,
  resolvePdfPreviewRenderWidth,
  type PdfPreviewDirection,
} from './document-page-preview-policy'

/** Fetch the visible page and the same small lookahead on open and while paging. */
export function usePdfPreviewPolicy(
  currentPage: number,
  totalPages: number,
  filePath: string | null,
  displayWidth: number,
) {
  const [readyPage, setReadyPage] = useState<number | null>(null)
  const [readyFilePath, setReadyFilePath] = useState(filePath)
  const [cacheEpoch] = useState(0)
  const [direction, setDirection] = useState<PdfPreviewDirection>(1)
  const previousPageRef = useRef(currentPage)
  const renderWidth = resolvePdfPreviewRenderWidth(displayWidth)

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

    if (!filePath || renderWidth < 1) {
      setReadyPage(null)
      return
    }

    const cached = getCachedPageImage(pageImageCacheKey(filePath, currentPage, renderWidth))
    setReadyPage(cached ? currentPage : null)
  }, [currentPage, filePath, renderWidth])

  const fetchPages = useMemo(
    () =>
      resolvePdfPreviewFetchPages({
        currentPage,
        totalPages,
        readyPage,
        direction,
      }),
    [currentPage, direction, readyPage, totalPages],
  )

  useEffect(() => {
    if (!filePath || renderWidth < 1) return
    let cancelled = false

    for (const item of fetchPages) {
      void ensurePdfPageImage({
        filePath,
        pageNumber: item.pageNumber,
        renderWidth,
        currentPage,
      }).then(() => {
        if (cancelled) return
        if (item.pageNumber === currentPage) setReadyPage(currentPage)
      }).catch(() => undefined)
    }

    return () => {
      cancelled = true
    }
  }, [currentPage, fetchPages, filePath, renderWidth])

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
    renderWidth,
    cacheEpoch,
    currentPreviewReady: !filePath || (readyFilePath === filePath && readyPage === currentPage),
  }
}
