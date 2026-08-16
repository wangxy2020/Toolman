import { forwardRef } from 'react'
import { IconPlus } from '../../components/icons'
import { useI18n } from '../../i18n/useI18n'
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
    handleEnsurePage,
  } = useTranslationDocumentWorkspace({ ...props, pageZoom, ref })

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

  if (bootstrapping) {
    return (
      <div ref={scrollRef} className="tm-translation-documents tm-translation-documents--empty">
        <div className="tm-translation-doc-pages-status">
          <p>{t('translationPage.documents.pagesBootstrapping')}</p>
        </div>
      </div>
    )
  }

  if (bootstrapError) {
    return (
      <div ref={scrollRef} className="tm-translation-documents tm-translation-documents--empty">
        <div className="tm-translation-doc-pages-status tm-translation-doc-pages-status--error">
          <p>{bootstrapError}</p>
        </div>
      </div>
    )
  }

  const isPdf = isPdfPath(activeDocument.filePath)

  return (
    <div ref={scrollRef} className="tm-translation-documents">
      {pages.map((page) => (
        <TranslationDocumentPageRow
          key={`${activeDocument.id}-${page.pageNumber}`}
          page={page}
          totalPages={resolvedTotalPages}
          filePath={activeDocument.filePath}
          isPdf={isPdf}
          pageBox={pageBox}
          pageAspect={pageAspect}
          hasModel={Boolean(modelId)}
          parseArmed={parseArmed}
          translationArmed={translationArmed}
          scrollRootRef={scrollRef}
          onEnsurePage={handleEnsurePage}
        />
      ))}
    </div>
  )
})
