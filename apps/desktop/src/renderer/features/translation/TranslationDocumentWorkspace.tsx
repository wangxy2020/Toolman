import { forwardRef, useCallback, useEffect, useMemo, useState } from 'react'
import { IconPlus } from '../../components/icons'
import { useI18n } from '../../i18n/useI18n'
import { documentWindowSpacersFromHeights } from './document-page-window'
import { getPageRemark } from './document-page-remarks'
import { shouldAttachSavedSnapshotBody } from './document-page-preview-policy'
import { usePdfPreviewPolicy } from './usePdfPreviewPolicy'
import { PdfPreviewWarmImages } from './TranslationDocumentPagePdf'
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
  const { isPreviewActive, markPageReady, renderWidth, cacheEpoch, currentPreviewReady } = usePdfPreviewPolicy(
    currentPage,
    resolvedTotalPages,
    isPdf ? activeDocument?.filePath ?? null : null,
    pageBox.width,
  )
  const documentId = activeDocument?.id ?? null
  const [hydratedDocumentId, setHydratedDocumentId] = useState(documentId)
  const [snapshotBodiesReady, setSnapshotBodiesReady] = useState(!isPdf)
  const [allowHeavyContent, setAllowHeavyContent] = useState(!isPdf)

  if (hydratedDocumentId !== documentId) {
    setHydratedDocumentId(documentId)
    setSnapshotBodiesReady(!isPdf)
    setAllowHeavyContent(!isPdf)
  }

  useEffect(() => {
    if (currentPreviewReady) setSnapshotBodiesReady(true)
  }, [currentPreviewReady])

  useEffect(() => {
    if (!snapshotBodiesReady) {
      const timer = window.setTimeout(() => setSnapshotBodiesReady(true), 2500)
      return () => window.clearTimeout(timer)
    }
    const frame = window.requestAnimationFrame(() => setAllowHeavyContent(true))
    return () => window.cancelAnimationFrame(frame)
  }, [snapshotBodiesReady])

  const snapshotByPage = useMemo(() => {
    const map = new Map(
      (activeDocument?.pageSnapshots ?? []).map((snapshot) => [snapshot.pageNumber, snapshot] as const),
    )
    return map
  }, [activeDocument?.pageSnapshots])
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

  const attachSnapshotBodies = shouldAttachSavedSnapshotBody(isPdf, snapshotBodiesReady)
  const spacers = documentWindowSpacersFromHeights(
    startPage,
    endPage,
    resolvedTotalPages,
    getRowHeight,
  )

  return (
    <div ref={scrollRef} className="tm-translation-documents">
      {isPdf ? (
        <PdfPreviewWarmImages
          filePath={activeDocument.filePath}
          renderWidth={renderWidth}
          currentPage={currentPage}
          totalPages={resolvedTotalPages}
          cacheEpoch={cacheEpoch}
        />
      ) : null}
      {spacers.top > 0 ? (
        <div className="tm-translation-doc-window-spacer" style={{ height: spacers.top }} aria-hidden="true" />
      ) : null}
      {pages
        .filter((page) => page.pageNumber >= startPage && page.pageNumber <= endPage)
        .map((page) => (
          <TranslationDocumentPageRow
            key={`${activeDocument.id}-${page.pageNumber}`}
            page={page}
            snapshot={attachSnapshotBodies ? snapshotByPage.get(page.pageNumber) : undefined}
            totalPages={resolvedTotalPages}
            filePath={activeDocument.filePath}
            isPdf={isPdf}
            pageBox={pageBox}
            pageAspect={pageAspect}
            hasModel={Boolean(modelId)}
            parseArmed={parseArmed}
            translationArmed={translationArmed}
            previewActive={isPreviewActive(page.pageNumber)}
            heavyContent={
              allowHeavyContent &&
              page.pageNumber === currentPage &&
              (!isPdf || currentPreviewReady)
            }
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
          />
        ))}
      {spacers.bottom > 0 ? (
        <div className="tm-translation-doc-window-spacer" style={{ height: spacers.bottom }} aria-hidden="true" />
      ) : null}
    </div>
  )
})
