import { memo, useEffect, useRef, useState, type RefObject } from 'react'
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
import type { PageDisplayBox } from './TranslationDocumentWorkspace'
import type { DocumentPageState } from './useDocumentPageTranslation'

interface Props {
  page: DocumentPageState
  totalPages: number
  filePath: string
  isPdf: boolean
  pageBox: PageDisplayBox
  hasModel: boolean
  scrollRootRef: RefObject<HTMLElement | null>
  onEnsurePage: (pageNumber: number) => void
}

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

const DocumentPageCard = memo(function DocumentPageCard({
  page,
  totalPages,
  hasModel,
}: {
  page: DocumentPageState
  totalPages: number
  hasModel: boolean
}) {
  const { t } = useI18n()

  return (
    <article className="tm-translation-doc-page-card">
      <header className="tm-translation-doc-page-card-head">
        <span>
          {t('translationPage.documents.pageLabel', {
            page: String(page.pageNumber),
            total: String(totalPages || page.pageNumber),
          })}
        </span>
        <span className="tm-translation-doc-page-card-status">
          {page.status === 'loading-source' || page.status === 'translating'
            ? t('translationPage.documents.pageTranslating')
            : page.status === 'error'
              ? t('translationPage.documents.pageError')
              : page.status === 'empty'
                ? t('translationPage.documents.pageEmpty')
                : page.status === 'done'
                  ? t('translationPage.documents.pageDone')
                  : t('translationPage.documents.pagePending')}
        </span>
      </header>
      <div className="tm-translation-doc-page-card-body">
        {page.translatedText ? (
          <pre className="tm-translation-doc-page-card-text">{page.translatedText}</pre>
        ) : page.status === 'error' ? (
          <p className="tm-translation-doc-page-card-placeholder tm-translation-doc-page-card-placeholder--error">
            {page.error || t('translationPage.documents.pageError')}
          </p>
        ) : page.status === 'empty' ? (
          <p className="tm-translation-doc-page-card-placeholder">
            {t('translationPage.documents.pageEmpty')}
          </p>
        ) : page.status === 'loading-source' || page.status === 'translating' ? (
          <p className="tm-translation-doc-page-card-placeholder">
            {t('translationPage.documents.pageTranslating')}
          </p>
        ) : (
          <p className="tm-translation-doc-page-card-placeholder">
            {hasModel
              ? t('translationPage.documents.pageClickTranslate')
              : t('translationPage.workspace.noModel')}
          </p>
        )}
      </div>
    </article>
  )
})

function PdfPageImage({
  filePath,
  pageNumber,
  pageBox,
  active,
}: {
  filePath: string
  pageNumber: number
  pageBox: PageDisplayBox
  active: boolean
}) {
  const { t } = useI18n()
  const renderWidth = resolveRenderWidth(pageBox.width)
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
      <div className="tm-translation-doc-page-image-status tm-translation-doc-page-image-status--error">
        <p>{error}</p>
      </div>
    )
  }

  if (!src) {
    return (
      <div className="tm-translation-doc-page-image-status" role="status">
        <p>
          {loading || active
            ? t('translationPage.documents.loadingPreview')
            : t('translationPage.documents.pagePending')}
        </p>
      </div>
    )
  }

  return (
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

export const TranslationDocumentPageRow = memo(function TranslationDocumentPageRow({
  page,
  totalPages,
  filePath,
  isPdf,
  pageBox,
  hasModel,
  scrollRootRef,
  onEnsurePage,
}: Props) {
  const rowRef = useRef<HTMLDivElement | null>(null)
  // Only the first page starts active; others wait for intersection.
  const [active, setActive] = useState(page.pageNumber === 1)

  useEffect(() => {
    setActive(page.pageNumber === 1)
  }, [filePath, page.pageNumber])

  useEffect(() => {
    const root = scrollRootRef.current
    const row = rowRef.current
    if (!root || !row) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActive(true)
            onEnsurePage(page.pageNumber)
            if (page.pageNumber < totalPages) onEnsurePage(page.pageNumber + 1)
          } else {
            // Release render priority for off-screen pages (images stay cached).
            setActive(false)
          }
        }
      },
      { root, rootMargin: '120px 0px', threshold: 0.01 },
    )
    observer.observe(row)
    return () => observer.disconnect()
  }, [filePath, onEnsurePage, page.pageNumber, scrollRootRef, totalPages])

  return (
    <div ref={rowRef} className="tm-translation-doc-row" data-page-number={page.pageNumber}>
      <section className="tm-translation-doc-row-pane tm-translation-doc-row-pane--source">
        <div className="tm-translation-doc-row-frame tm-translation-doc-row-frame--source">
          {isPdf ? (
            <PdfPageImage
              filePath={filePath}
              pageNumber={page.pageNumber}
              pageBox={pageBox}
              active={active}
            />
          ) : (
            <SourceTextPage page={page} />
          )}
        </div>
      </section>

      <div className="tm-translation-doc-row-divider" aria-hidden="true" />

      <section className="tm-translation-doc-row-pane tm-translation-doc-row-pane--target">
        <div className="tm-translation-doc-row-frame tm-translation-doc-row-frame--target">
          <DocumentPageCard page={page} totalPages={totalPages} hasModel={hasModel} />
        </div>
      </section>
    </div>
  )
})
