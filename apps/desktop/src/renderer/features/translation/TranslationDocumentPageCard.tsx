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

function statusToneClass(status: DocumentPageState['status']): string {
  if (status === 'parsing') return 'tm-translation-doc-page-card-status--parsing'
  if (status === 'loading-source' || status === 'translating') {
    return 'tm-translation-doc-page-card-status--translating'
  }
  if (status === 'error') return 'tm-translation-doc-page-card-status--error'
  if (status === 'parsed') return 'tm-translation-doc-page-card-status--parsed'
  if (status === 'done') return 'tm-translation-doc-page-card-status--done'
  return ''
}

const DocumentPageCard = memo(function DocumentPageCard({
  page,
  totalPages,
  hasModel,
  parseArmed,
  heavyContent,
  fitToPage = false,
  clipToPage = false,
  savedFit = null,
  onFitPersist,
  deferFit = false,
  onRetryTranslate,
  documentId = null,
}: {
  page: DocumentPageState
  totalPages: number
  hasModel: boolean
  parseArmed: boolean
  /** Rich markdown/HTML for the final parse/translate layout. */
  heavyContent: boolean
  /** Lock text into the PDF page box — shrink type to fontMin, then scroll if needed. */
  fitToPage?: boolean
  /** Clip to the PDF page box without live font-fit (stable while scrolling). */
  clipToPage?: boolean
  savedFit?: DocumentPageFitRecord | null
  onFitPersist?: (pageNumber: number, fit: DocumentPageFitRecord) => void
  /** Neighbor / mid-fling rows wait so the focused page paints first. */
  deferFit?: boolean
  onRetryTranslate?: (pageNumber: number) => void
  /** Document id for shared 字号 across pages. */
  documentId?: string | null
}) {
  const pageClip = fitToPage || clipToPage
  const { t } = useI18n()
  const isTranslated = page.status === 'done' && Boolean(page.translatedText.trim())
  const isTranslating =
    page.status === 'translating' || page.status === 'loading-source'
  const plainText = page.translatedText.trim()
  // Always prefer the final stored markup when present so scrolling does not
  // switch a page between plain prose and HTML tables.
  const rawText = (
    isTranslated
      ? page.translatedText
      : heavyContent
        ? (page.parsedMarkdown ?? page.translatedText)
        : page.translatedText
  ).trim()
  const hasPreview = hasVisibleParsePreviewBody(
    plainText,
    isTranslated || !heavyContent ? undefined : page.parsedMarkdown,
  )
  const previewMode =
    hasPreview &&
    (page.status === 'parsed' ||
      page.status === 'parsing' ||
      isTranslating ||
      page.status === 'done' ||
      parseArmed)
  const showRich = previewMode && heavyContent && usesRichDocumentPagePreview(rawText)
  const displayText = previewMode
    ? heavyContent
      ? resolveDocumentPageDisplayText(rawText, showRich)
      : plainText
    : plainText
  const fitTable =
    heavyContent && (usesDocumentPageTableFit(rawText) || looksLikeTranslationTable(displayText))
  const persistFit = useCallback(
    (fit: DocumentPageFitRecord) => onFitPersist?.(page.pageNumber, fit),
    [onFitPersist, page.pageNumber],
  )
  const fitBoxRef = useFitDocumentPageContent(
    // Fit only after scroll settles on the focused page — never mid-fling.
    fitToPage && heavyContent && !deferFit && Boolean(displayText),
    `${page.pageNumber}:${displayText.length}:${showRich ? 'rich' : 'plain'}:${fitTable ? 'table' : 'prose'}`,
    savedFit,
    persistFit,
    fitTable ? DOCUMENT_PAGE_FIT_TABLE_CAPS : undefined,
    deferFit,
    documentId,
    page.pageNumber,
    fitTable ? 'table' : 'prose',
  )
  const statusLabel =
    page.status === 'parsing'
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
                : t('translationPage.documents.pagePending')
  const canRetry =
    page.status === 'error' && Boolean(onRetryTranslate) && !parseArmed && hasModel

  return (
    <article className="tm-translation-doc-page-card">
      <header className="tm-translation-doc-page-card-head">
        <span>
          {t('translationPage.documents.pageLabel', {
            page: String(page.pageNumber),
            total: String(totalPages || page.pageNumber),
          })}
        </span>
        <span className={`tm-translation-doc-page-card-status ${statusToneClass(page.status)}`.trim()}>
          {statusLabel}
          {canRetry ? (
            <>
              {' · '}
              <button
                type="button"
                className="tm-translation-doc-page-card-retry"
                onClick={() => onRetryTranslate?.(page.pageNumber)}
              >
                {t('translationPage.documents.pageRetry')}
              </button>
            </>
          ) : null}
        </span>
      </header>
      <div
        ref={fitBoxRef}
        className={[
          'tm-translation-doc-page-card-body',
          pageClip ? 'tm-translation-doc-page-card-body--fit' : '',
          pageClip && fitTable ? 'tm-translation-doc-page-card-body--fit-table' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <div className={pageClip ? 'tm-translation-doc-fit' : undefined}>
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
              {canRetry ? (
                <>
                  {' '}
                  <button
                    type="button"
                    className="tm-translation-doc-page-card-retry"
                    onClick={() => onRetryTranslate?.(page.pageNumber)}
                  >
                    {t('translationPage.documents.pageRetry')}
                  </button>
                </>
              ) : null}
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
      <footer className="tm-translation-doc-page-card-foot" aria-hidden="true">
        {page.pageNumber} / {totalPages || page.pageNumber}
      </footer>
    </article>
  )
})

export { DocumentPageCard }
