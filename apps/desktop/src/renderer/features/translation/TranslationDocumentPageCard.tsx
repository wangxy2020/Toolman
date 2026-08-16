import { memo } from 'react'
import { useI18n } from '../../i18n/useI18n'
import { TranslationDocumentMarkdown } from './TranslationDocumentMarkdown'
import { TranslationDocumentTranslatedText } from './TranslationDocumentTranslatedText'
import {
  emptyPageMessageKey,
  HYBRID_UNAVAILABLE_ERROR,
  hasDisplayableParsePreviewContent,
  isRichMarkdownPreview,
} from './translation-page-source-quality'
import type { DocumentPageState } from './useDocumentPageTranslation'

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

export { DocumentPageCard }
