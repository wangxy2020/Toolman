import { memo, useCallback } from 'react'
import { useI18n } from '../../i18n/useI18n'
import {
  DOCUMENT_PAGE_FIT_TABLE_CAPS,
  type DocumentPageFitRecord,
} from './document-page-fit'
import { useFitDocumentPageContent } from './useFitDocumentPageContent'
import { TranslationDocumentMarkdown } from './TranslationDocumentMarkdown'
import { TranslationDocumentTranslatedText } from './TranslationDocumentTranslatedText'
import { looksLikeTranslationTable } from './translation-display-table'
import {
  emptyPageMessageKey,
  HYBRID_UNAVAILABLE_ERROR,
  hasVisibleParsePreviewBody,
  resolveDocumentPageDisplayText,
  usesDocumentPageTableFit,
  usesRichDocumentPagePreview,
} from './translation-page-source-quality'
import type { DocumentPageState } from './useDocumentPageTranslation'

const DocumentPageCard = memo(function DocumentPageCard({
  page,
  totalPages,
  hasModel,
  parseArmed,
  fitToPage = false,
  savedFit = null,
  onFitPersist,
  deferFit = false,
}: {
  page: DocumentPageState
  totalPages: number
  hasModel: boolean
  parseArmed: boolean
  /** Rich markdown/HTML waits until the current PDF preview has painted. */
  heavyContent: boolean
  /** Lock text into the PDF page box — shrink type, never scroll. */
  fitToPage?: boolean
  savedFit?: DocumentPageFitRecord | null
  onFitPersist?: (pageNumber: number, fit: DocumentPageFitRecord) => void
  /** Neighbor rows wait a frame so the current page paints first. */
  deferFit?: boolean
}) {
  const { t } = useI18n()
  const isTranslated = page.status === 'done' && Boolean(page.translatedText.trim())
  const rawText = (
    isTranslated ? page.translatedText : (page.parsedMarkdown ?? page.translatedText)
  ).trim()
  const plainText = page.translatedText.trim()
  const hasPreview = hasVisibleParsePreviewBody(plainText, isTranslated ? undefined : page.parsedMarkdown)
  const previewMode =
    hasPreview &&
    (page.status === 'parsed' || page.status === 'parsing' || page.status === 'done' || parseArmed)
  const showRich = previewMode && usesRichDocumentPagePreview(rawText)
  const displayText = previewMode ? resolveDocumentPageDisplayText(rawText, showRich) : plainText
  const fitTable = usesDocumentPageTableFit(rawText) || looksLikeTranslationTable(displayText)
  const persistFit = useCallback(
    (fit: DocumentPageFitRecord) => onFitPersist?.(page.pageNumber, fit),
    [onFitPersist, page.pageNumber],
  )
  const fitBoxRef = useFitDocumentPageContent(
    fitToPage && Boolean(displayText),
    `${page.pageNumber}:${displayText.length}:${showRich ? 'rich' : 'plain'}:${fitTable ? 'table' : 'prose'}`,
    savedFit,
    persistFit,
    fitTable ? DOCUMENT_PAGE_FIT_TABLE_CAPS : undefined,
    deferFit,
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
      <div
        ref={fitBoxRef}
        className={[
          'tm-translation-doc-page-card-body',
          fitToPage ? 'tm-translation-doc-page-card-body--fit' : '',
          fitToPage && fitTable ? 'tm-translation-doc-page-card-body--fit-table' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <div className={fitToPage ? 'tm-translation-doc-fit' : undefined}>
          {displayText ? (
            showRich ? (
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
          ) : page.status === 'parsed' || page.status === 'done' ? null : (
            <p className="tm-translation-doc-page-card-placeholder">
              {parseArmed
                ? t('translationPage.documents.pageClickParse')
                : hasModel
                  ? t('translationPage.documents.pageClickTranslate')
                  : t('translationPage.workspace.noModel')}
            </p>
          )}
        </div>
      </div>
    </article>
  )
})

export { DocumentPageCard }
