import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useI18n } from '../../i18n/useI18n'
import {
  getCachedPageImage,
  listCachedPageImageUrls,
  pageImageCacheKey,
} from './document-page-cache'
import { ensurePdfPageImage, isPdfPreviewRenderDropped } from './document-page-preview-load'
import { PDF_PREVIEW_WARM_RADIUS, resolvePdfPreviewRenderWidth } from './document-page-preview-policy'
import { splitTranslationParagraphs } from './translation-paragraphs'
import type { PageDisplayBox } from './translation-document-workspace-types'
import type { DocumentPageState } from './useDocumentPageTranslation'

function resolvePdfPreviewAspectStyle(pageAspect: number | null): CSSProperties {
  if (pageAspect && pageAspect > 0) {
    return { aspectRatio: `1 / ${pageAspect}` }
  }
  return { aspectRatio: '612 / 792' }
}

function PdfPageImage({
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
    setLoading(true)

    void ensurePdfPageImage({
      filePath,
      pageNumber,
      renderWidth,
      currentPage,
    })
      .catch((err) => {
        if (requestId !== requestIdRef.current) return Promise.reject(err)
        if (!isPdfPreviewRenderDropped(err) || pageNumber !== currentPage) return Promise.reject(err)
        return ensurePdfPageImage({
          filePath,
          pageNumber,
          renderWidth,
          currentPage,
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
  }, [active, cacheKey, currentPage, filePath, pageNumber, renderWidth, t])

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
          {loading || active
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
}

function PdfPreviewWarmImages({
  filePath,
  renderWidth,
  currentPage,
  totalPages,
  cacheEpoch,
}: {
  filePath: string
  renderWidth: number
  currentPage: number
  totalPages: number
  cacheEpoch: number
}) {
  const urls = useMemo(() => {
    if (!filePath || renderWidth < 1) return []
    return listCachedPageImageUrls(
      filePath,
      renderWidth,
      Math.max(1, currentPage - PDF_PREVIEW_WARM_RADIUS),
      Math.min(totalPages, currentPage + PDF_PREVIEW_WARM_RADIUS),
    )
  }, [cacheEpoch, currentPage, filePath, renderWidth, totalPages])

  if (urls.length === 0) return null

  return (
    <div className="tm-translation-doc-preview-warm" aria-hidden="true">
      {urls.map((url) => (
        <img key={url} src={url} alt="" />
      ))}
    </div>
  )
}

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

export { PdfPageImage, PdfPreviewWarmImages, SourceTextPage }
