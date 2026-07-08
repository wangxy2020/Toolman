import { memo, useEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'
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
import { TranslationDocumentMarkdown } from './TranslationDocumentMarkdown'
import { TranslationDocumentTranslatedText } from './TranslationDocumentTranslatedText'
import { emptyPageMessageKey, HYBRID_UNAVAILABLE_ERROR, hasDisplayableParsePreviewContent, isRichMarkdownPreview } from './translation-page-source-quality'
import type { PageDisplayBox } from './TranslationDocumentWorkspace'
import type { DocumentPageState } from './useDocumentPageTranslation'

interface Props {
  page: DocumentPageState
  totalPages: number
  filePath: string
  isPdf: boolean
  pageBox: PageDisplayBox
  /** PDF page height / width; reserves consistent preview height before render. */
  pageAspect: number | null
  hasModel: boolean
  parseArmed: boolean
  translationArmed: boolean
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
  parseArmed,
}: {
  page: DocumentPageState
  totalPages: number
  hasModel: boolean
  parseArmed: boolean
}) {
  const { t } = useI18n()
  const markdownText = (page.parsedMarkdown ?? page.translatedText).trim()
  const translationText = page.translatedText.trim()
  const hasPreview = hasDisplayableParsePreviewContent(translationText, page.parsedMarkdown)
  const previewMode =
    hasPreview &&
    (page.status === 'parsed' || page.status === 'parsing' || parseArmed)
  const displayText = previewMode ? markdownText || translationText : translationText
  const useRichPreview =
    previewMode &&
    isRichMarkdownPreview(
      page.parsedMarkdown?.trim() ? page.parsedMarkdown : translationText,
      page.parsedMarkdown,
    )

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
          {page.status === 'parsing'
            ? t('translationPage.documents.pageParsing')
            : page.status === 'loading-source' || page.status === 'translating'
              ? t('translationPage.documents.pageTranslating')
              : page.status === 'error'
                ? t('translationPage.documents.pageError')
                : page.status === 'empty'
                  ? t(`translationPage.documents.${emptyPageMessageKey(page.error)}`)
                  : page.status === 'parsed'
                    ? t('translationPage.documents.pageParsed')
                    : page.status === 'done'
                      ? t('translationPage.documents.pageDone')
                      : t('translationPage.documents.pagePending')}
        </span>
      </header>
      <div className="tm-translation-doc-page-card-body">
        {displayText ? (
          useRichPreview ? (
            <TranslationDocumentMarkdown text={displayText} />
          ) : (
            <TranslationDocumentTranslatedText text={displayText} />
          )
        ) : page.status === 'error' ? (
          <p className="tm-translation-doc-page-card-placeholder tm-translation-doc-page-card-placeholder--error">
            {page.error === HYBRID_UNAVAILABLE_ERROR
              ? t(`translationPage.documents.${emptyPageMessageKey(page.error)}`)
              : page.error || t('translationPage.documents.pageError')}
          </p>
        ) : page.status === 'empty' ? (
          <p className="tm-translation-doc-page-card-placeholder">
            {t(`translationPage.documents.${emptyPageMessageKey(page.error)}`)}
          </p>
        ) : page.status === 'parsing' ||
          page.status === 'loading-source' ||
          page.status === 'translating' ? (
          <p className="tm-translation-doc-page-card-placeholder">
            {page.status === 'parsing'
              ? t('translationPage.documents.pageParsing')
              : t('translationPage.documents.pageTranslating')}
          </p>
        ) : (
          <p className="tm-translation-doc-page-card-placeholder">
            {parseArmed
              ? t('translationPage.documents.pageClickParse')
              : hasModel
                ? t('translationPage.documents.pageClickTranslate')
                : t('translationPage.workspace.noModel')}
          </p>
        )}
      </div>
    </article>
  )
})

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

export const TranslationDocumentPageRow = memo(function TranslationDocumentPageRow({
  page,
  totalPages,
  filePath,
  isPdf,
  pageBox,
  pageAspect,
  hasModel,
  parseArmed,
  translationArmed,
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
            if (translationArmed || parseArmed) {
              onEnsurePage(page.pageNumber)
            }
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
  }, [filePath, onEnsurePage, page.pageNumber, parseArmed, scrollRootRef, translationArmed])

  return (
    <div ref={rowRef} className="tm-translation-doc-row" data-page-number={page.pageNumber}>
      <section className="tm-translation-doc-row-pane tm-translation-doc-row-pane--source">
        <div className="tm-translation-doc-row-frame tm-translation-doc-row-frame--source">
          {isPdf ? (
            <PdfPageImage
              filePath={filePath}
              pageNumber={page.pageNumber}
              pageBox={pageBox}
              pageAspect={pageAspect}
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
          <DocumentPageCard
            page={page}
            totalPages={totalPages}
            hasModel={hasModel}
            parseArmed={parseArmed}
          />
        </div>
      </section>
    </div>
  )
})
