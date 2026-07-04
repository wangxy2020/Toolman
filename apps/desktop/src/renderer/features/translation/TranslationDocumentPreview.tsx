import { useEffect, useState } from 'react'
import { FileReadBinaryOutputSchema, IpcChannel } from '@toolman/shared'
import { IconPlus } from '../../components/icons'
import { useI18n } from '../../i18n/useI18n'
import { splitTranslationParagraphs } from './translation-paragraphs'
import type { DocumentPageState } from './useDocumentPageTranslation'
import type { TranslationDocumentItem } from './translation-storage'

interface Props {
  document: TranslationDocumentItem | null
  pages: DocumentPageState[]
  totalPages: number
  frameHeight: number
  onOpenDocument: () => void
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return new Blob([bytes], { type: mimeType })
}

function SourcePageBlocks({
  pages,
  totalPages,
}: {
  pages: DocumentPageState[]
  totalPages: number
}) {
  const { t } = useI18n()

  if (pages.length === 0) {
    return (
      <div className="tm-translation-doc-status tm-translation-doc-page-slot">
        <p>{t('translationPage.documents.pagesBootstrapping')}</p>
      </div>
    )
  }

  return (
    <div className="tm-translation-doc-source-list">
      {pages.map((page) => {
        const paragraphs = splitTranslationParagraphs(page.sourceText)
        return (
          <article
            key={page.pageNumber}
            className={
              page.pageNumber === 1
                ? 'tm-translation-doc-page-slot tm-translation-doc-page-slot--first'
                : 'tm-translation-doc-page-slot'
            }
          >
            <div className="tm-translation-doc-source-page">
              {page.sourceText.trim() ? (
                paragraphs.map((text, index) => (
                  <p
                    key={`${page.pageNumber}-${index}`}
                    data-para-index={index}
                    className="tm-translation-contrast-para"
                  >
                    {text || '\u00a0'}
                  </p>
                ))
              ) : (
                <p className="tm-translation-contrast-para tm-translation-contrast-para--placeholder">
                  {t('translationPage.documents.pageLabel', {
                    page: String(page.pageNumber),
                    total: String(totalPages || pages.length),
                  })}
                </p>
              )}
            </div>
          </article>
        )
      })}
    </div>
  )
}

export function TranslationDocumentPreview({
  document,
  pages,
  totalPages,
  frameHeight,
  onOpenDocument,
}: Props) {
  const { t } = useI18n()
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [previewMimeType, setPreviewMimeType] = useState<string | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)

  useEffect(() => {
    if (!document?.filePath) {
      setPreviewUrl(null)
      setPreviewMimeType(null)
      setPreviewError(null)
      setLoadingPreview(false)
      return
    }

    let cancelled = false
    let objectUrl: string | null = null
    setLoadingPreview(true)
    setPreviewError(null)
    setPreviewUrl(null)
    setPreviewMimeType(null)

    void (async () => {
      try {
        const result = await window.api.invoke(IpcChannel.FileReadBinary, {
          path: document.filePath,
        })
        if (cancelled) return
        if (!result.ok) {
          setPreviewError(result.error.message)
          return
        }

        const data = FileReadBinaryOutputSchema.parse(result.data)
        const blob = base64ToBlob(data.base64, data.mimeType)
        objectUrl = URL.createObjectURL(blob)
        if (cancelled) {
          URL.revokeObjectURL(objectUrl)
          return
        }
        setPreviewMimeType(data.mimeType)
        setPreviewUrl(objectUrl)
      } catch (error) {
        if (cancelled) return
        setPreviewError(
          error instanceof Error ? error.message : t('translationPage.documents.previewFailed'),
        )
      } finally {
        if (!cancelled) setLoadingPreview(false)
      }
    })()

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [document?.filePath, document?.id, t])

  if (!document) {
    return (
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
    )
  }

  const canEmbedPdf = previewMimeType === 'application/pdf'

  // Keep the native PDF toolbar; page pitch is matched via CSS variables on the parent.
  const frameSrc =
    previewUrl && canEmbedPdf
      ? `${previewUrl}#navpanes=0&pagemode=none&view=FitH`
      : null

  return (
    <div
      className="tm-translation-doc-viewer tm-translation-documents-col-inner"
      style={{ minHeight: frameHeight }}
    >
      {loadingPreview ? (
        <div className="tm-translation-doc-status" role="status">
          <span>{t('translationPage.documents.loadingPreview')}</span>
        </div>
      ) : previewError ? (
        <div className="tm-translation-doc-status tm-translation-doc-status--error">
          <p>{previewError}</p>
        </div>
      ) : frameSrc ? (
        <iframe
          className="tm-translation-doc-frame"
          title={t('translationPage.documents.previewAria')}
          src={frameSrc}
          style={{ height: frameHeight }}
        />
      ) : (
        <div className="tm-translation-doc-source-pane">
          <SourcePageBlocks pages={pages} totalPages={totalPages} />
        </div>
      )}
    </div>
  )
}
