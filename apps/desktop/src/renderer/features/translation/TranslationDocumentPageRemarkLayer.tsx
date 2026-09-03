import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../../i18n/useI18n'

interface Props {
  pageNumber: number
  value: string
  expanded: boolean
  onChange: (value: string) => void
  onClose?: () => void
  onOpen?: () => void
}

export function TranslationDocumentPageRemarkLayer({
  pageNumber,
  value,
  expanded,
  onChange,
  onClose,
  onOpen,
}: Props) {
  const { t } = useI18n()
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [draft, setDraft] = useState(value)

  useEffect(() => {
    setDraft(value)
  }, [pageNumber, value])

  useEffect(() => {
    if (expanded) inputRef.current?.focus()
  }, [expanded, pageNumber])

  if (!expanded) {
    const preview = draft.trim()
    if (!preview) return null
    return (
      <button
        type="button"
        className="tm-translation-doc-remark-chip"
        onClick={onOpen}
        title={t('translationPage.documents.remarkTitle', { page: String(pageNumber) })}
      >
        <span className="tm-translation-doc-remark-chip-label">
          {t('translationPage.documents.saveToNotes')}
        </span>
        <span className="tm-translation-doc-remark-chip-preview">{preview}</span>
      </button>
    )
  }

  return (
    <div className="tm-translation-doc-remark-layer">
      <div className="tm-translation-doc-remark-head">
        <span>
          {t('translationPage.documents.remarkTitle', { page: String(pageNumber) })}
        </span>
        <button
          type="button"
          className="tm-translation-doc-remark-close"
          onClick={onClose}
          aria-label={t('translationPage.documents.remarkClose')}
        >
          ×
        </button>
      </div>
      <textarea
        ref={inputRef}
        className="tm-translation-doc-remark-input"
        value={draft}
        onChange={(event) => {
          const next = event.target.value
          setDraft(next)
          onChange(next)
        }}
        placeholder={t('translationPage.documents.remarkPlaceholder')}
      />
    </div>
  )
}
