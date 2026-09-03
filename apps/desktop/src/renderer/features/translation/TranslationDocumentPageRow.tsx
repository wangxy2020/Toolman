import { memo, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { resolvePageFromSnapshot } from './document-page-snapshots'
import { DocumentPageCard } from './TranslationDocumentPageCard'
import { PdfPageImage, SourceTextPage } from './TranslationDocumentPagePdf'
import { TranslationDocumentPageRemarkLayer } from './TranslationDocumentPageRemarkLayer'
import type { TranslationDocumentPageSnapshot } from './translation-storage'
import type { PageDisplayBox } from './translation-document-workspace-types'
import type { DocumentPageState } from './useDocumentPageTranslation'

interface Props {
  page: DocumentPageState
  snapshot?: TranslationDocumentPageSnapshot
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
  heavyContent: boolean
  currentPage: number
  cacheEpoch: number
  onPreviewReady: (pageNumber: number) => void
  onEnsurePage: (pageNumber: number) => void
  onRowHeight: (pageNumber: number, height: number) => void
  remarkOpen?: boolean
  remarkText?: string
  onRemarkChange?: (pageNumber: number, value: string) => void
  onRemarkClose?: () => void
  onRemarkOpen?: (pageNumber: number) => void
}

export const TranslationDocumentPageRow = memo(function TranslationDocumentPageRow({
  page,
  snapshot,
  totalPages,
  filePath,
  isPdf,
  pageBox,
  pageAspect,
  hasModel,
  parseArmed,
  translationArmed,
  previewActive,
  heavyContent,
  currentPage,
  cacheEpoch,
  onPreviewReady,
  onEnsurePage,
  onRowHeight,
  remarkOpen = false,
  remarkText = '',
  onRemarkChange,
  onRemarkClose,
  onRemarkOpen,
}: Props) {
  const rowRef = useRef<HTMLDivElement>(null)
  const displayPage = useMemo(() => resolvePageFromSnapshot(page, snapshot), [page, snapshot])

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
    if (previewActive && (translationArmed || parseArmed)) {
      onEnsurePage(page.pageNumber)
    }
  }, [onEnsurePage, page.pageNumber, parseArmed, previewActive, translationArmed])

  return (
    <div ref={rowRef} className="tm-translation-doc-row" data-page-number={page.pageNumber}>
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
            page={displayPage}
            totalPages={totalPages}
            hasModel={hasModel}
            parseArmed={parseArmed}
            heavyContent={heavyContent}
          />
        </div>
      </section>
    </div>
  )
})
