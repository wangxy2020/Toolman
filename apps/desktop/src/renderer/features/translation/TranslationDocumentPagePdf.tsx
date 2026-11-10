import { memo, useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { getCachedPageImage, pageImageCacheKey } from './document-page-cache'
import {
  isPdfViewerRenderCancelled,
  shouldSchedulePdfPagePaint,
  type PdfViewerPaintQuality,
} from './document-pdf-viewer-scale'
import {
  getCachedPdfPaintQuality,
  renderPdfPageToCanvas,
  restorePdfPagePaintToCanvas,
} from './document-pdf-viewer'
import { ensurePdfPageImage, isPdfPreviewRenderDropped } from './document-page-preview-load'
import { resolvePdfPreviewRenderWidth } from './document-page-preview-policy'
import { splitTranslationParagraphs } from './translation-paragraphs'
import type { PageDisplayBox } from './translation-document-workspace-types'
import type { DocumentPageState } from './useDocumentPageTranslation'

function resolvePdfPreviewAspectStyle(pageAspect: number | null): CSSProperties {
  if (pageAspect && pageAspect > 0) {
    return { aspectRatio: `1 / ${pageAspect}` }
  }
  return { aspectRatio: '612 / 792' }
}

const PdfPageRasterImage = memo(function PdfPageRasterImage({
  filePath,
  pageNumber,
  currentPage,
  pageBox,
  pageAspect,
  active,
  cacheEpoch,
  onReady,
}: {
  filePath: string
  pageNumber: number
  currentPage: number
  pageBox: PageDisplayBox
  pageAspect: number | null
  active: boolean
  cacheEpoch: number
  onReady?: (pageNumber: number) => void
}) {
  const { t } = useI18n()
  const renderWidth = resolvePdfPreviewRenderWidth(pageBox.width)
  const aspectStyle = resolvePdfPreviewAspectStyle(pageAspect)
  const cacheKey = renderWidth > 0 ? pageImageCacheKey(filePath, pageNumber, renderWidth) : ''
  const [src, setSrc] = useState<string | null>(() =>
    cacheKey ? getCachedPageImage(cacheKey) : null,
  )
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const requestIdRef = useRef(0)
  const currentPageRef = useRef(currentPage)
  currentPageRef.current = currentPage

  useEffect(() => () => {
    requestIdRef.current += 1
  }, [])

  useEffect(() => {
    if (!cacheKey) return
    const cached = getCachedPageImage(cacheKey)
    if (!cached) return
    setSrc(cached)
    setError(null)
    setLoading(false)
  }, [cacheEpoch, cacheKey])

  useEffect(() => {
    if (src) onReady?.(pageNumber)
  }, [onReady, pageNumber, src])

  useEffect(() => {
    if (!active || !filePath || !cacheKey || renderWidth < 1) return
    const cached = getCachedPageImage(cacheKey)
    if (cached) {
      setSrc(cached)
      setError(null)
      setLoading(false)
      return
    }

    const requestId = ++requestIdRef.current
    setError(null)
    setLoading((visible) => visible || !src)

    void ensurePdfPageImage({
      filePath,
      pageNumber,
      renderWidth,
      currentPage: currentPageRef.current,
    })
      .catch((err) => {
        if (requestId !== requestIdRef.current) return Promise.reject(err)
        if (!isPdfPreviewRenderDropped(err) || pageNumber !== currentPageRef.current) {
          return Promise.reject(err)
        }
        return ensurePdfPageImage({
          filePath,
          pageNumber,
          renderWidth,
          currentPage: currentPageRef.current,
        })
      })
      .then((url) => {
        if (requestId !== requestIdRef.current || !url) return
        setSrc(url)
      })
      .catch((err) => {
        if (requestId !== requestIdRef.current) return
        if (isPdfPreviewRenderDropped(err)) return
        setError(err instanceof Error ? err.message : t('translationPage.documents.previewFailed'))
      })
      .finally(() => {
        if (requestId === requestIdRef.current) setLoading(false)
      })
  }, [active, cacheKey, filePath, pageNumber, renderWidth, t])

  if (error) {
    return (
      <div
        className="tm-translation-doc-page-image-slot tm-translation-doc-page-image-status tm-translation-doc-page-image-status--error"
        style={aspectStyle}
      >
        <p>{error}</p>
      </div>
    )
  }

  if (!src) {
    return (
      <div
        className="tm-translation-doc-page-image-slot tm-translation-doc-page-image-status"
        style={aspectStyle}
        role="status"
      >
        <p>
          {loading || (active && renderWidth > 0)
            ? t('translationPage.documents.loadingPreview')
            : t('translationPage.documents.pagePending')}
        </p>
      </div>
    )
  }

  return (
    <div className="tm-translation-doc-page-image-slot" style={aspectStyle}>
      <div className="tm-translation-doc-page-image-wrap">
        <img
          className="tm-translation-doc-page-image"
          src={src}
          alt={t('translationPage.documents.pageLabel', {
            page: String(pageNumber),
            total: '',
          })}
          draggable={false}
          decoding="async"
          fetchPriority={pageNumber === currentPage ? 'high' : 'low'}
        />
      </div>
    </div>
  )
})

const PdfPageCanvas = memo(function PdfPageCanvas({
  filePath,
  pageNumber,
  currentPage,
  pageBox,
  pageAspect,
  active,
  scrollSettled,
  onReady,
  onVectorFailure,
}: {
  filePath: string
  pageNumber: number
  currentPage: number
  pageBox: PageDisplayBox
  pageAspect: number | null
  active: boolean
  scrollSettled: boolean
  onReady?: (pageNumber: number) => void
  onVectorFailure: () => void
}) {
  const { t } = useI18n()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const paintedRef = useRef(false)
  const paintedQualityRef = useRef<PdfViewerPaintQuality | null>(null)
  const paintedCssWidthRef = useRef(0)
  const [painted, setPainted] = useState(false)
  const [loading, setLoading] = useState(true)
  const aspectStyle = resolvePdfPreviewAspectStyle(pageAspect)
  const cssWidth = pageBox.width
  // While scrolling keep preview; after settle the current page upgrades to sharp.
  const allowSharp = scrollSettled

  useEffect(() => {
    // Mounted window rows paint once and keep the bitmap across flips.
    // Sharp upgrades wait until scroll settles so the left pane stays clear and smooth.
    if (!active && paintedRef.current) return
    if (!active) return
    const canvas = canvasRef.current
    if (!canvas || !filePath || cssWidth < 1) return

    if (paintedCssWidthRef.current > 0 && Math.abs(paintedCssWidthRef.current - cssWidth) >= 48) {
      paintedRef.current = false
      paintedQualityRef.current = null
      setPainted(false)
    }

    if (!paintedRef.current) {
      const restored = restorePdfPagePaintToCanvas({
        filePath,
        pageNumber,
        canvas,
        cssWidth,
        minQuality: allowSharp && pageNumber === currentPage ? 'sharp' : undefined,
      })
      if (restored) {
        paintedRef.current = true
        paintedQualityRef.current = restored
        paintedCssWidthRef.current = cssWidth
        setPainted(true)
        setLoading(false)
        onReady?.(pageNumber)
      } else if (allowSharp && pageNumber === currentPage) {
        // Prefer any cached frame immediately, then upgrade to sharp below.
        const preview = restorePdfPagePaintToCanvas({
          filePath,
          pageNumber,
          canvas,
          cssWidth,
        })
        if (preview) {
          paintedRef.current = true
          paintedQualityRef.current = preview
          paintedCssWidthRef.current = cssWidth
          setPainted(true)
          setLoading(false)
          onReady?.(pageNumber)
        }
      }
    } else if (!paintedQualityRef.current) {
      paintedQualityRef.current = getCachedPdfPaintQuality(filePath, pageNumber, cssWidth)
    }

    if (
      !shouldSchedulePdfPagePaint({
        active,
        painted: paintedRef.current,
        paintedQuality: paintedQualityRef.current,
        pageNumber,
        currentPage,
        allowSharp,
      })
    ) {
      return
    }

    const controller = new AbortController()
    const upgrading = paintedRef.current
    const delay = upgrading ? (allowSharp ? 32 : 80) : 0
    const timer = window.setTimeout(() => {
      if (!upgrading) setLoading(true)
      void renderPdfPageToCanvas({
        filePath,
        pageNumber,
        canvas,
        cssWidth,
        currentPage,
        allowSharp,
        signal: controller.signal,
      })
        .then(() => {
          if (controller.signal.aborted) return
          const quality =
            allowSharp && pageNumber === currentPage ? 'sharp' : 'preview'
          paintedRef.current = true
          paintedQualityRef.current = quality
          paintedCssWidthRef.current = cssWidth
          setPainted(true)
          setLoading(false)
          onReady?.(pageNumber)
        })
        .catch((error) => {
          if (controller.signal.aborted || isPdfViewerRenderCancelled(error)) return
          onVectorFailure()
        })
    }, delay)
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [
    active,
    allowSharp,
    cssWidth,
    currentPage,
    filePath,
    onReady,
    onVectorFailure,
    pageNumber,
  ])

  return (
    <div className="tm-translation-doc-page-image-slot" style={aspectStyle}>
      <div className="tm-translation-doc-page-image-wrap">
        {active || painted ? (
          <canvas
            ref={canvasRef}
            className="tm-translation-doc-page-image"
            aria-label={t('translationPage.documents.pageLabel', {
              page: String(pageNumber),
              total: '',
            })}
          />
        ) : null}
        {!painted ? (
          <div className="tm-translation-doc-page-image-status tm-translation-doc-page-image-status--overlay" role="status">
            <p>
              {loading || (active && cssWidth > 0)
                ? t('translationPage.documents.loadingPreview')
                : t('translationPage.documents.pagePending')}
            </p>
          </div>
        ) : null}
      </div>
    </div>
  )
})

const PdfPageImage = memo(function PdfPageImage({
  filePath,
  pageNumber,
  currentPage,
  pageBox,
  pageAspect,
  active,
  scrollSettled,
  cacheEpoch,
  onReady,
}: {
  filePath: string
  pageNumber: number
  currentPage: number
  pageBox: PageDisplayBox
  pageAspect: number | null
  active: boolean
  scrollSettled: boolean
  cacheEpoch: number
  onReady?: (pageNumber: number) => void
}) {
  const [mode, setMode] = useState<'vector' | 'raster'>('vector')
  const onVectorFailure = useCallback(() => setMode('raster'), [])
  if (mode === 'raster') {
    return (
      <PdfPageRasterImage
        filePath={filePath}
        pageNumber={pageNumber}
        currentPage={currentPage}
        pageBox={pageBox}
        pageAspect={pageAspect}
        active={active}
        cacheEpoch={cacheEpoch}
        onReady={onReady}
      />
    )
  }
  return (
    <PdfPageCanvas
      filePath={filePath}
      pageNumber={pageNumber}
      currentPage={currentPage}
      pageBox={pageBox}
      pageAspect={pageAspect}
      active={active}
      scrollSettled={scrollSettled}
      onReady={onReady}
      onVectorFailure={onVectorFailure}
    />
  )
})

function SourceTextPage({ page }: { page: DocumentPageState }) {
  const paragraphs = splitTranslationParagraphs(page.sourceText)
  if (!page.sourceText.trim()) {
    return <div className="tm-translation-doc-source-page-empty" />
  }
  return (
    <div className="tm-translation-doc-source-page">
      {paragraphs.map((text, index) => (
        <p key={index} className="tm-translation-contrast-para">
          {text || '\u00a0'}
        </p>
      ))}
    </div>
  )
}

export { PdfPageImage, SourceTextPage }
