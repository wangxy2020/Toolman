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

  // Parse mode locks a stable preview so progressive apply does not reshuffle
  // while scrolling. Translate mode always follows live page state so Chinese
  // (and errors) are not stuck behind a stale parse lock.
  const lockedPageRef = useRef<DocumentPageState | null>(null)
  const lockedSignatureRef = useRef('')
  const modeRef = useRef<'parse' | 'translate' | 'idle'>('idle')
  const mode = translationArmed ? 'translate' : parseArmed ? 'parse' : 'idle'
  if (modeRef.current !== mode) {
    modeRef.current = mode
    lockedPageRef.current = null
    lockedSignatureRef.current = ''
  }
  const nextSignature = [
    displayPage.status,
    displayPage.translatedText.length,
    displayPage.parsedMarkdown?.length ?? 0,
    displayPage.translatedText.slice(0, 48),
    displayPage.parsedMarkdown?.slice(0, 48) ?? '',
  ].join('|')
  const lockedHasTable = /<table\b/i.test(lockedPageRef.current?.parsedMarkdown ?? '')
  const nextHasTable = /<table\b/i.test(displayPage.parsedMarkdown ?? '')
  const lockedBodyLen =
    (lockedPageRef.current?.translatedText.trim().length ?? 0) +
    (lockedPageRef.current?.parsedMarkdown?.trim().length ?? 0)
  const nextBodyLen =
    displayPage.translatedText.trim().length + (displayPage.parsedMarkdown?.trim().length ?? 0)

  if (mode === 'translate') {
    if (displayPage.status === 'done' && displayPage.translatedText.trim()) {
      lockedPageRef.current = { ...displayPage, parsedMarkdown: undefined }
      lockedSignatureRef.current = nextSignature
    } else if (
      !lockedPageRef.current &&
      pageHasDisplayBody(displayPage) &&
      (displayPage.status === 'translating' ||
        displayPage.status === 'loading-source' ||
        displayPage.status === 'parsed')
    ) {
      lockedPageRef.current = displayPage
      lockedSignatureRef.current = nextSignature
    }
  } else if (mode === 'parse' && pageHasDisplayBody(displayPage)) {
    // Parse mode must keep parsedMarkdown — never strip it for done pages.
    lockedPageRef.current = displayPage
    lockedSignatureRef.current = nextSignature
  } else if (!lockedPageRef.current && pageHasDisplayBody(displayPage)) {
    lockedPageRef.current = displayPage
    lockedSignatureRef.current = nextSignature
  } else if (
    lockedPageRef.current &&
    pageHasDisplayBody(displayPage) &&
    nextSignature !== lockedSignatureRef.current &&
    ((nextHasTable && !lockedHasTable && scrollSettled) ||
      (scrollSettled &&
        displayPage.status === 'parsed' &&
        nextBodyLen >= lockedBodyLen &&
        lockedPageRef.current.status !== 'done'))
  ) {
    lockedPageRef.current = displayPage
    lockedSignatureRef.current = nextSignature
  }

  const locked = lockedPageRef.current
  // Translate mode always uses live state (Chinese / errors). Parse mode may
  // keep a locked preview so progressive apply does not reshuffle mid-scroll.
  const cardPage =
    mode === 'translate'
      ? displayPage.status === 'translating' || displayPage.status === 'loading-source'
        ? pageHasDisplayBody(displayPage)
          ? displayPage
          : locked
            ? {
                ...displayPage,
                translatedText: displayPage.translatedText.trim()
                  ? displayPage.translatedText
                  : locked.translatedText,
                parsedMarkdown:
                  displayPage.parsedMarkdown?.trim() || locked.parsedMarkdown,
              }
            : displayPage
        : displayPage
      : mode === 'parse'
        ? (locked ?? displayPage)
        : displayPage.status === 'parsed' || displayPage.status === 'parsing'
          ? (locked ?? displayPage)
          : displayPage

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
            translationArmed={translationArmed}
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
