import { useCallback, useEffect, useRef, useState } from 'react'
import { getCachedPageImage, pageImageCacheKey, subscribePageImageCache } from './document-page-cache'
import {
  ensurePdfPageImage,
  ensurePdfPageImageWhenIdle,
  isPdfPreviewRenderDropped,
} from './document-page-preview-load'
import {
  PDF_PREVIEW_SHARP_DELAY_MS,
  resolvePdfPreviewActive,
  resolvePdfPreviewDirection,
  resolvePdfPreviewFastWidth,
  resolvePdfPreviewFetchPages,
  resolvePdfPreviewSharpWidth,
  type PdfPreviewDirection,
} from './document-page-preview-policy'
import { evictOtherPdfViewerDocuments, evictPdfViewerDocument } from './document-pdf-viewer'

/**
 * Single scheduler for image/scan PDFs:
 * landed readable → neighbor readable prefetch → delayed sharp.
 * Prefetch before sharp so flips stay warm; soft-cancel keeps pdf.js warm.
 */
export function usePdfPreviewPolicy(
  currentPage: number,
  totalPages: number,
  filePath: string | null,
  pageWidth = 0,
  scrollSettled = true,
) {
  const [readyPage, setReadyPage] = useState<number | null>(null)
  const [readyFilePath, setReadyFilePath] = useState(filePath)
  const [direction, setDirection] = useState<PdfPreviewDirection>(1)
  const [cacheEpoch, setCacheEpoch] = useState(0)
  const previousPageRef = useRef(currentPage)
  const scheduleGenRef = useRef(0)

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
    evictOtherPdfViewerDocuments(filePath)
    evictPdfViewerDocument(filePath)
  }, [filePath])

  useEffect(() => {
    return subscribePageImageCache(() => {
      setCacheEpoch((epoch) => epoch + 1)
    })
  }, [])

  useEffect(() => {
    if (!filePath || pageWidth < 1 || !scrollSettled) return
    const fastWidth = resolvePdfPreviewFastWidth(pageWidth)
    const sharpWidth = resolvePdfPreviewSharpWidth(pageWidth)
    if (fastWidth < 1) return

    const landedPage = currentPage
    const fetchPages = resolvePdfPreviewFetchPages({
      currentPage: landedPage,
      totalPages,
      readyPage: null,
      direction,
    })
    const scheduleGen = ++scheduleGenRef.current
    let cancelled = false

    const stillCurrent = () => !cancelled && scheduleGen === scheduleGenRef.current

    const loadWidth = (pageNumber: number, renderWidth: number) =>
      ensurePdfPageImage({
        filePath,
        pageNumber,
        renderWidth,
        currentPage: landedPage,
      }).catch((error) => {
        if (isPdfPreviewRenderDropped(error)) return null
        return null
      })

    const loadSharp = async (pageNumber: number) => {
      const readableKey = pageImageCacheKey(filePath, pageNumber, fastWidth)
      if (!getCachedPageImage(readableKey)) return null
      const sharpKey = pageImageCacheKey(filePath, pageNumber, sharpWidth)
      if (getCachedPageImage(sharpKey)) return null
      return ensurePdfPageImageWhenIdle({
        filePath,
        pageNumber,
        renderWidth: sharpWidth,
        currentPage: landedPage,
      }).catch((error) => {
        if (isPdfPreviewRenderDropped(error)) return null
        return null
      })
    }

    void (async () => {
      // 1) Immediate readable first paint for the landed page.
      const readableUrl = await loadWidth(landedPage, fastWidth)
      if (!stillCurrent()) return

      // 2) Neighbor readable prefetch before sharp — scan sharp rasters are slow
      // and must not block the next page's first paint.
      for (const item of fetchPages) {
        if (!stillCurrent()) return
        if (item.pageNumber === landedPage) continue
        void loadWidth(item.pageNumber, fastWidth)
      }

      // 3) Delayed sharp upgrade only while the user stays on this page.
      if (readableUrl && sharpWidth > fastWidth) {
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, PDF_PREVIEW_SHARP_DELAY_MS)
        })
        if (!stillCurrent()) return
        void loadSharp(landedPage)
      }
    })()

    return () => {
      cancelled = true
      scheduleGenRef.current += 1
    }
  }, [currentPage, direction, filePath, pageWidth, scrollSettled, totalPages])

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
    cacheEpoch,
  }
}
