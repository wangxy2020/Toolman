import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { resolvePageForDisplay, type DocumentPageBody } from './document-page-bodies'
import type { DocumentPageFitRecord } from './document-page-fit'
import { DocumentPageCard } from './TranslationDocumentPageCard'
import { PdfPageImage, SourceTextPage } from './TranslationDocumentPagePdf'
import { TranslationDocumentPageRemarkLayer } from './TranslationDocumentPageRemarkLayer'
import type { PageDisplayBox } from './translation-document-workspace-types'
import type { DocumentPageState } from './useDocumentPageTranslation'

interface Props {
  page: DocumentPageState
  body?: DocumentPageBody
  totalPages: number
  filePath: string
  isPdf: boolean
  pageBox: PageDisplayBox
  /** PDF page height / width; reserves consistent preview height before render. */
  pageAspect: number | null
  hasModel: boolean
  parseArmed: boolean
  translationArmed: boolean
  previewActive: boolean
  attachBody: boolean
  heavyContent: boolean
  currentPage: number
  scrollSettled: boolean
  cacheEpoch: number
  onPreviewReady: (pageNumber: number) => void
  onEnsurePage: (pageNumber: number) => void
  onRetryTranslate?: (pageNumber: number) => void
  onRowHeight: (pageNumber: number, height: number) => void
  remarkOpen?: boolean
  remarkText?: string
  onRemarkChange?: (pageNumber: number, value: string) => void
  onRemarkClose?: () => void
  onRemarkOpen?: (pageNumber: number) => void
  onFitPersist?: (pageNumber: number, fit: DocumentPageFitRecord) => void
  documentId?: string | null
}

function pageHasDisplayBody(page: DocumentPageState): boolean {
  return Boolean(page.translatedText.trim() || page.parsedMarkdown?.trim())
}

export const TranslationDocumentPageRow = memo(function TranslationDocumentPageRow({
  page,
  body,
  totalPages,
  filePath,
  isPdf,
  pageBox,
  pageAspect,
  hasModel,
  parseArmed,
  translationArmed,
  previewActive,
  attachBody,
  heavyContent,
  currentPage,
  scrollSettled,
  cacheEpoch,
  onPreviewReady,
  onEnsurePage,
  onRetryTranslate,
  onRowHeight,
  remarkOpen = false,
  remarkText = '',
  onRemarkChange,
  onRemarkClose,
  onRemarkOpen,
  onFitPersist,
  documentId = null,
}: Props) {
  const rowRef = useRef<HTMLDivElement>(null)
  const stickyRichRef = useRef(heavyContent)
  if (heavyContent) stickyRichRef.current = true
  const showHeavyContent = heavyContent || stickyRichRef.current
  const displayPage = useMemo(
    () => resolvePageForDisplay(page, body, attachBody),
    [attachBody, body, page],
  )

  // Lock the first non-empty final body for this mounted row. Updating on every
  // settle / parse chunk made tables and prose reshuffle while browsing.
  const lockedPageRef = useRef<DocumentPageState | null>(null)
  const lockedSignatureRef = useRef('')
  const nextSignature = [
    displayPage.status,
    displayPage.translatedText.length,
    displayPage.parsedMarkdown?.length ?? 0,
    displayPage.translatedText.slice(0, 48),
    displayPage.parsedMarkdown?.slice(0, 48) ?? '',
  ].join('|')
  const lockedHasTable = /<table\b/i.test(lockedPageRef.current?.parsedMarkdown ?? '')
  const nextHasTable = /<table\b/i.test(displayPage.parsedMarkdown ?? '')
  if (!lockedPageRef.current && pageHasDisplayBody(displayPage)) {
    lockedPageRef.current = displayPage
    lockedSignatureRef.current = nextSignature
  } else if (
    lockedPageRef.current &&
    scrollSettled &&
    pageHasDisplayBody(displayPage) &&
    nextSignature !== lockedSignatureRef.current &&
    // Upgrade when translate completes, a table appears, or full-doc replaces the
    // progressive probe draft (parsed content change before translation).
    ((displayPage.status === 'done' && lockedPageRef.current.status !== 'done') ||
      (nextHasTable && !lockedHasTable) ||
      (displayPage.status === 'parsed' &&
        lockedPageRef.current.status !== 'done' &&
        lockedPageRef.current.status !== 'translating' &&
        lockedPageRef.current.status !== 'loading-source'))
  ) {
    lockedPageRef.current = displayPage
    lockedSignatureRef.current = nextSignature
  }
  const cardPage = lockedPageRef.current ?? displayPage

  useLayoutEffect(() => {
    const el = rowRef.current
    if (!el) return

    const report = () => {
      const margin = Number.parseFloat(window.getComputedStyle(el).marginBottom) || 0
      onRowHeight(page.pageNumber, el.offsetHeight + margin)
    }

    report()
    const observer = new ResizeObserver(report)
    observer.observe(el)
    return () => observer.disconnect()
  }, [onRowHeight, page.pageNumber])

  useEffect(() => {
    if (!previewActive || (!translationArmed && !parseArmed)) return
    if (!scrollSettled) return
    if (Math.abs(page.pageNumber - currentPage) > 1) return
    onEnsurePage(page.pageNumber)
  }, [
    currentPage,
    onEnsurePage,
    page.pageNumber,
    parseArmed,
    previewActive,
    scrollSettled,
    translationArmed,
  ])

  return (
    <div
      ref={rowRef}
      className={isPdf ? 'tm-translation-doc-row tm-translation-doc-row--paired' : 'tm-translation-doc-row'}
      data-page-number={page.pageNumber}
    >
      <section className="tm-translation-doc-row-pane tm-translation-doc-row-pane--source">
        <div className="tm-translation-doc-row-frame tm-translation-doc-row-frame--source">
          <div className="tm-translation-doc-page-preview">
            {isPdf ? (
              <PdfPageImage
                filePath={filePath}
                pageNumber={page.pageNumber}
                currentPage={currentPage}
                pageBox={pageBox}
                pageAspect={pageAspect}
                active={previewActive}
                scrollSettled={scrollSettled}
                cacheEpoch={cacheEpoch}
                onReady={onPreviewReady}
              />
            ) : (
              <SourceTextPage page={page} />
            )}
            {onRemarkChange && (remarkOpen || remarkText.trim()) ? (
              <TranslationDocumentPageRemarkLayer
                pageNumber={page.pageNumber}
                value={remarkText}
                expanded={remarkOpen}
                onChange={(text) => onRemarkChange(page.pageNumber, text)}
                onClose={onRemarkClose}
                onOpen={onRemarkOpen ? () => onRemarkOpen(page.pageNumber) : undefined}
              />
            ) : null}
          </div>
        </div>
      </section>

      <div className="tm-translation-doc-row-divider" aria-hidden="true" />

      <section className="tm-translation-doc-row-pane tm-translation-doc-row-pane--target">
        <div className="tm-translation-doc-row-frame tm-translation-doc-row-frame--target">
          <DocumentPageCard
            page={cardPage}
            totalPages={totalPages}
            hasModel={hasModel}
            parseArmed={parseArmed}
            heavyContent={showHeavyContent}
            // One-shot fit on the focused settled page only. Neighbors keep
            // clip + savedFit so scrolling does not rewrite every row's type.
            fitToPage={
              isPdf && attachBody && scrollSettled && page.pageNumber === currentPage
            }
            clipToPage={isPdf && attachBody}
            savedFit={body?.fit ?? null}
            onFitPersist={onFitPersist}
            deferFit={!scrollSettled || page.pageNumber !== currentPage}
            onRetryTranslate={onRetryTranslate}
            documentId={documentId}
          />
        </div>
      </section>
    </div>
  )
})
