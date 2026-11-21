import { memo, useEffect, useRef, useState, type CSSProperties } from 'react'
import { useI18n } from '../../i18n/useI18n'
import {
  isRendererPdfPaintDropped,
  scheduleRendererPdfPagePaint,
} from './pdf-renderer-page-paint'
import { splitTranslationParagraphs } from './translation-paragraphs'
import type { PageDisplayBox } from './translation-document-workspace-types'
import type { DocumentPageState } from './useDocumentPageTranslation'

function resolvePdfPreviewAspectStyle(pageAspect: number | null): CSSProperties {
  if (pageAspect && pageAspect > 0) {
    return { aspectRatio: `1 / ${pageAspect}` }
  }
  return { aspectRatio: '612 / 792' }
}

/**
 * Left-pane PDF: renderer pdf.js → canvas at device pixels.
 * No main-process JPEG round-trip (that path was seconds behind Preview/Acrobat).
 * Never blanks a painted frame; overlay loading only before the first paint.
 */
const PdfPageCanvas = memo(function PdfPageCanvas({
  filePath,
  pageNumber,
  currentPage,
  pageBox,
  pageAspect,
  active,
  scrollSettled,
  onReady,
}: {
  filePath: string
  pageNumber: number
  currentPage: number
  pageBox: PageDisplayBox
  pageAspect: number | null
  active: boolean
  scrollSettled: boolean
  cacheEpoch?: number
  onReady?: (pageNumber: number) => void
}) {
  const { t } = useI18n()
  const aspectStyle = resolvePdfPreviewAspectStyle(pageAspect)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [hasPaint, setHasPaint] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestIdRef = useRef(0)
  const readySentRef = useRef(false)
  const hasPaintRef = useRef(false)
  const isFocused = pageNumber === currentPage
  const cssWidth = Math.max(0, Math.round(pageBox.width))

  useEffect(
    () => () => {
      requestIdRef.current += 1
    },
    [],
  )

  useEffect(() => {
    // Focused page paints immediately; neighbors wait until scroll settles.
    if (!active || !filePath || cssWidth < 1) return
    if (!isFocused && !scrollSettled) return
    const canvas = canvasRef.current
    if (!canvas) return

    const requestId = ++requestIdRef.current
    let cancelled = false
    setLoading(true)
    setError(null)

    void (async () => {
      try {
        await scheduleRendererPdfPagePaint({
          filePath,
          pageNumber,
          cssWidth,
          focused: isFocused,
          canvas,
        })
        if (cancelled || requestId !== requestIdRef.current) return
        hasPaintRef.current = true
        setHasPaint(true)
        setError(null)
        if (!readySentRef.current) {
          readySentRef.current = true
          onReady?.(pageNumber)
        }
      } catch (err) {
        if (cancelled || requestId !== requestIdRef.current) return
        if (isRendererPdfPaintDropped(err)) return
        if (!hasPaintRef.current) {
          setError(err instanceof Error ? err.message : t('translationPage.documents.previewFailed'))
        }
      } finally {
        if (requestId === requestIdRef.current) setLoading(false)
      }
    })()

    return () => {
      cancelled = true
      requestIdRef.current += 1
    }
  }, [active, cssWidth, filePath, isFocused, onReady, pageNumber, scrollSettled, t])

  if (error && !hasPaint) {
    return (
      <div
        className="tm-translation-doc-page-image-slot tm-translation-doc-page-image-status tm-translation-doc-page-image-status--error"
        style={aspectStyle}
      >
        <p>{error}</p>
      </div>
    )
  }

  return (
    <div className="tm-translation-doc-page-image-slot" style={aspectStyle}>
      <div className="tm-translation-doc-page-image-wrap">
        <canvas
          ref={canvasRef}
          className="tm-translation-doc-page-image tm-translation-doc-page-canvas"
          aria-label={t('translationPage.documents.pageLabel', {
            page: String(pageNumber),
            total: '',
          })}
          data-preview-quality={isFocused ? 'sharp' : 'fast'}
        />
        {!hasPaint ? (
          <div
            className="tm-translation-doc-page-image-status tm-translation-doc-page-image-status--overlay"
            role="status"
            aria-busy={loading || undefined}
          >
            <p>{t('translationPage.documents.loadingPreview')}</p>
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
  return (
    <PdfPageCanvas
      filePath={filePath}
      pageNumber={pageNumber}
      currentPage={currentPage}
      pageBox={pageBox}
      pageAspect={pageAspect}
      active={active}
      scrollSettled={scrollSettled}
      cacheEpoch={cacheEpoch}
      onReady={onReady}
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
