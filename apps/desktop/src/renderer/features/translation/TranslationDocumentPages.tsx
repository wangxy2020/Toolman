import { memo, useEffect, useRef, type RefObject } from 'react'
import { useI18n } from '../../i18n/useI18n'
import type { DocumentPageState } from './useDocumentPageTranslation'

interface Props {
  pages: DocumentPageState[]
  totalPages: number
  bootstrapping: boolean
  bootstrapError: string | null
  hasDocument: boolean
  hasModel: boolean
  scrollRootRef: RefObject<HTMLElement | null>
  onEnsurePage: (pageNumber: number) => void
}

const DocumentPageCard = memo(function DocumentPageCard({
  page,
  totalPages,
}: {
  page: DocumentPageState
  totalPages: number
}) {
  const { t } = useI18n()

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
          {page.status === 'loading-source' || page.status === 'translating'
            ? t('translationPage.documents.pageTranslating')
            : page.status === 'error'
              ? t('translationPage.documents.pageError')
              : page.status === 'empty'
                ? t('translationPage.documents.pageEmpty')
                : page.status === 'done'
                  ? t('translationPage.documents.pageDone')
                  : t('translationPage.documents.pagePending')}
        </span>
      </header>
      <div className="tm-translation-doc-page-card-body">
        {page.translatedText ? (
          <pre className="tm-translation-doc-page-card-text">{page.translatedText}</pre>
        ) : page.status === 'error' ? (
          <p className="tm-translation-doc-page-card-placeholder tm-translation-doc-page-card-placeholder--error">
            {page.error || t('translationPage.documents.pageError')}
          </p>
        ) : page.status === 'empty' ? (
          <p className="tm-translation-doc-page-card-placeholder">
            {t('translationPage.documents.pageEmpty')}
          </p>
        ) : page.status === 'loading-source' || page.status === 'translating' ? (
          <p className="tm-translation-doc-page-card-placeholder">
            {t('translationPage.documents.pageTranslating')}
          </p>
        ) : (
          <p className="tm-translation-doc-page-card-placeholder">
            {t('translationPage.documents.pageClickTranslate')}
          </p>
        )}
      </div>
    </article>
  )
})

export function TranslationDocumentPages({
  pages,
  totalPages,
  bootstrapping,
  bootstrapError,
  hasDocument,
  hasModel,
  scrollRootRef,
  onEnsurePage,
}: Props) {
  const { t } = useI18n()
  const listRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const root = scrollRootRef.current
    const list = listRef.current
    if (!root || !list) return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const pageNumber = Number((entry.target as HTMLElement).dataset.pageNumber)
          if (!Number.isFinite(pageNumber) || pageNumber < 1) continue
          onEnsurePage(pageNumber)
          if (pageNumber < totalPages) onEnsurePage(pageNumber + 1)
        }
      },
      {
        root,
        rootMargin: '120px 0px',
        threshold: 0.15,
      },
    )

    const nodes = list.querySelectorAll<HTMLElement>('[data-page-number]')
    nodes.forEach((node) => observer.observe(node))
    return () => observer.disconnect()
  }, [onEnsurePage, pages.length, scrollRootRef, totalPages])

  if (!hasDocument) {
    return (
      <div className="tm-translation-doc-pages tm-translation-doc-pages--empty">
        <p>{t('translationPage.documents.targetEmpty')}</p>
      </div>
    )
  }

  if (bootstrapping) {
    return (
      <div className="tm-translation-doc-pages tm-translation-doc-pages--empty">
        <p>{t('translationPage.documents.pagesBootstrapping')}</p>
      </div>
    )
  }

  if (bootstrapError) {
    return (
      <div className="tm-translation-doc-pages tm-translation-doc-pages--empty tm-translation-doc-pages--error">
        <p>{bootstrapError}</p>
      </div>
    )
  }

  if (!hasModel) {
    return (
      <div className="tm-translation-doc-pages tm-translation-doc-pages--empty">
        <p>{t('translationPage.workspace.noModel')}</p>
      </div>
    )
  }

  return (
    <div
      ref={listRef}
      className="tm-translation-doc-pages"
      aria-label={t('translationPage.workspace.targetLabel')}
    >
      {pages.map((page) => (
        <div
          key={page.pageNumber}
          className={
            page.pageNumber === 1
              ? 'tm-translation-doc-page-slot tm-translation-doc-page-slot--first'
              : 'tm-translation-doc-page-slot'
          }
          data-page-number={page.pageNumber}
        >
          <DocumentPageCard page={page} totalPages={totalPages || pages.length} />
        </div>
      ))}
    </div>
  )
}
