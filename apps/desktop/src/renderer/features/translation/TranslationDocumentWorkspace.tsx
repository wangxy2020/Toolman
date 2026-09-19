import { forwardRef, useCallback, useMemo } from 'react'
import { IconPlus } from '../../components/icons'
import { useI18n } from '../../i18n/useI18n'
import { documentWindowSpacersFromHeights } from './document-page-window'
import { getPageRemark } from './document-page-remarks'
import { createDocumentPageBodyLookup } from './document-page-bodies'
import type { DocumentPageFitRecord } from './document-page-fit'
import { setCachedPageFit } from './document-page-fit-cache'
import { resolveParseBodyAttachFlags } from './document-page-preview-policy'
import { usePdfPreviewPolicy } from './usePdfPreviewPolicy'
import { TranslationDocumentPageRow } from './TranslationDocumentPageRow'
import {
  DOCUMENT_PAGE_ZOOM_DEFAULT,
  isPdfPath,
  type TranslationDocumentWorkspaceHandle,
  type TranslationDocumentWorkspaceProps,
} from './translation-document-workspace-types'
import { useTranslationDocumentWorkspace } from './useTranslationDocumentWorkspace'

export type {
  PageDisplayBox,
  TranslationDocumentWorkspaceHandle,
} from './translation-document-workspace-types'
export { DOCUMENT_PAGE_ZOOM_DEFAULT } from './translation-document-workspace-types'

export const TranslationDocumentWorkspace = forwardRef<
  TranslationDocumentWorkspaceHandle,
  TranslationDocumentWorkspaceProps
>(function TranslationDocumentWorkspace(props, ref) {
  const { t } = useI18n()
  const {
    activeDocument,
    modelId,
    onOpenDocument,
    pageZoom = DOCUMENT_PAGE_ZOOM_DEFAULT,
    remarkOpenPage = null,
    onRemarkOpenPageChange,
    onPageRemarkChange,
  } = props

  const {
    scrollRef,
    pageBox,
    pages,
    pageAspect,
    bootstrapping,
    bootstrapError,
    parseArmed,
    translationArmed,
    resolvedTotalPages,
    currentPage,
    startPage,
    endPage,
    getRowHeight,
    reportHeight,
    handleEnsurePage,
  } = useTranslationDocumentWorkspace({ ...props, pageZoom, ref })
  const isPdf = isPdfPath(activeDocument?.filePath ?? '')
  const { isPreviewActive, markPageReady, cacheEpoch } = usePdfPreviewPolicy(
    currentPage,
    resolvedTotalPages,
    isPdf ? activeDocument?.filePath ?? null : null,
  )
  const bodyLookup = useMemo(
    () => createDocumentPageBodyLookup(activeDocument?.pageSnapshots, pages, activeDocument?.id),
    [activeDocument?.id, activeDocument?.pageSnapshots, pages],
  )
  const handleFitPersist = useCallback(
    (pageNumber: number, fit: DocumentPageFitRecord) => {
      if (!activeDocument?.id) return
      setCachedPageFit(activeDocument.id, pageNumber, fit)
    },
    [activeDocument?.id],
  )
  const handleRemarkClose = useCallback(() => onRemarkOpenPageChange?.(null), [onRemarkOpenPageChange])
  const handleRemarkOpen = useCallback(
    (pageNumber: number) => onRemarkOpenPageChange?.(pageNumber),
    [onRemarkOpenPageChange],
  )

  if (!activeDocument) {
    return (
      <div className="tm-translation-documents tm-translation-documents--empty">
        <div className="tm-translation-doc-empty">
          <div className="tm-translation-doc-empty-card">
            <div className="tm-translation-doc-empty-icons" aria-hidden="true">
              <span className="tm-translation-doc-badge tm-translation-doc-badge--pdf">PDF</span>
              <span className="tm-translation-doc-badge tm-translation-doc-badge--word">Word</span>
              <span className="tm-translation-doc-badge tm-translation-doc-badge--excel">Excel</span>
            </div>
            <h3 className="tm-translation-doc-empty-title">
              {t('translationPage.documents.emptyTitle')}
            </h3>
            <p className="tm-translation-doc-empty-hint">
              {t('translationPage.documents.emptyHint')}
            </p>
            <button type="button" className="tm-translation-doc-open-btn" onClick={onOpenDocument}>
              <IconPlus size={16} />
              {t('translationPage.documents.open')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (bootstrapping && pages.length === 0) {
    return (
      <div ref={scrollRef} className="tm-translation-documents tm-translation-documents--empty">
        <div className="tm-translation-doc-pages-status">
          <p>{t('translationPage.documents.pagesBootstrapping')}</p>
        </div>
      </div>
    )
  }

  if (bootstrapError && pages.length === 0) {
    return (
      <div ref={scrollRef} className="tm-translation-documents tm-translation-documents--empty">
        <div className="tm-translation-doc-pages-status tm-translation-doc-pages-status--error">
          <p>{bootstrapError}</p>
        </div>
      </div>
    )
  }

  const spacers = documentWindowSpacersFromHeights(
    startPage,
    endPage,
    resolvedTotalPages,
    getRowHeight,
  )

  return (
    <div ref={scrollRef} className="tm-translation-documents">
      {spacers.top > 0 ? (
        <div className="tm-translation-doc-window-spacer" style={{ height: spacers.top }} aria-hidden="true" />
      ) : null}
      {pages
        .filter((page) => page.pageNumber >= startPage && page.pageNumber <= endPage)
        .map((page) => {
          const attach = resolveParseBodyAttachFlags({
            isPdf,
            pageNumber: page.pageNumber,
            currentPage,
            startPage,
            endPage,
          })
          const attachBody = attach.attachPlain
          const heavyContent = attach.attachRich
          return (
            <TranslationDocumentPageRow
            key={`${activeDocument.id}-${page.pageNumber}`}
            page={page}
            body={attachBody ? bodyLookup.get(page.pageNumber) : undefined}
            totalPages={resolvedTotalPages}
            filePath={activeDocument.filePath}
            isPdf={isPdf}
            pageBox={pageBox}
            pageAspect={pageAspect}
            hasModel={Boolean(modelId)}
            parseArmed={parseArmed}
            translationArmed={translationArmed}
            previewActive={isPreviewActive(page.pageNumber)}
            attachBody={attachBody}
            heavyContent={heavyContent}
            currentPage={currentPage}
            cacheEpoch={cacheEpoch}
            onPreviewReady={markPageReady}
            onEnsurePage={handleEnsurePage}
            onRowHeight={reportHeight}
            remarkOpen={remarkOpenPage === page.pageNumber}
            remarkText={getPageRemark(activeDocument.pageRemarks, page.pageNumber)}
            onRemarkChange={onPageRemarkChange}
            onRemarkClose={onRemarkOpenPageChange ? handleRemarkClose : undefined}
            onRemarkOpen={onRemarkOpenPageChange ? handleRemarkOpen : undefined}
            onFitPersist={isPdf ? handleFitPersist : undefined}
            />
          )
        })}
      {spacers.bottom > 0 ? (
        <div className="tm-translation-doc-window-spacer" style={{ height: spacers.bottom }} aria-hidden="true" />
      ) : null}
    </div>
  )
})
