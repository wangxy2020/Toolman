import { useEffect, useRef, useState, type CSSProperties } from 'react'
import {
  IpcChannel,
  TranslationDocumentRenderPageOutputSchema,
} from '@toolman/shared'
import { useI18n } from '../../i18n/useI18n'
import {
  getCachedPageImage,
  pageImageCacheKey,
  setCachedPageImage,
} from './document-page-cache'
import { splitTranslationParagraphs } from './translation-paragraphs'
import type { PageDisplayBox } from './translation-document-workspace-types'
import type { DocumentPageState } from './useDocumentPageTranslation'

function bucketSize(value: number): number {
  if (value <= 0) return 320
  return Math.max(160, Math.round(value / 16) * 16)
}

/** Device pixels for preview (CSS width × DPR, capped for main-process cost). */
function resolveRenderWidth(displayWidth: number): number {
  const dpr =
    typeof window !== 'undefined' ? Math.min(2, Math.max(1, window.devicePixelRatio || 1)) : 1
  return Math.min(1400, Math.round(bucketSize(displayWidth) * dpr))
}

function base64ToObjectUrl(base64: string, mimeType: string): string {
  const binary = atob(base64)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return URL.createObjectURL(new Blob([bytes], { type: mimeType }))
}


function resolvePdfPreviewAspectStyle(pageAspect: number | null): CSSProperties {
  if (pageAspect && pageAspect > 0) {
    return { aspectRatio: `1 / ${pageAspect}` }
  }
  return { aspectRatio: '612 / 792' }
}

function PdfPageImage({
  filePath,
  pageNumber,
  pageBox,
  pageAspect,
  active,
}: {
  filePath: string
  pageNumber: number
  pageBox: PageDisplayBox
  pageAspect: number | null
  active: boolean
}) {
  const { t } = useI18n()
  const renderWidth = resolveRenderWidth(pageBox.width)
  const aspectStyle = resolvePdfPreviewAspectStyle(pageAspect)
  const cacheKey = pageImageCacheKey(filePath, pageNumber, renderWidth)
  const [src, setSrc] = useState<string | null>(() => getCachedPageImage(cacheKey))
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const requestIdRef = useRef(0)

  useEffect(() => {
    const cached = getCachedPageImage(cacheKey)
    if (cached) {
      setSrc(cached)
      setError(null)
      setLoading(false)
      return
    }

    // Drop stale bitmap when file/size changes; only fetch while visible.
    setSrc(null)
    setError(null)
    if (!active || !filePath) {
      setLoading(false)
      return
    }

    const requestId = ++requestIdRef.current
    let cancelled = false
    setLoading(true)

    void (async () => {
      try {
        const result = await window.api.invoke(IpcChannel.TranslationDocumentRenderPage, {
          path: filePath,
          pageNumber,
          targetWidth: renderWidth,
        })
        if (cancelled || requestId !== requestIdRef.current) return
        if (!result.ok) {
          setError(result.error.message)
          return
        }
        const data = TranslationDocumentRenderPageOutputSchema.parse(result.data)
        const objectUrl = base64ToObjectUrl(data.base64, data.mimeType)
        setCachedPageImage(cacheKey, objectUrl)
        setSrc(objectUrl)
      } catch (err) {
        if (cancelled || requestId !== requestIdRef.current) return
        setError(err instanceof Error ? err.message : t('translationPage.documents.previewFailed'))
      } finally {
        if (!cancelled && requestId === requestIdRef.current) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
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
          loading="lazy"
        />
      </div>
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


export { PdfPageImage, SourceTextPage }
