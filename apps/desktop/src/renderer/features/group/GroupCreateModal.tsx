import { useState } from 'react'
import { useI18n } from '../../i18n/useI18n'

interface Props {
  onClose: () => void
  onSubmit: (input: { name: string; description?: string }) => Promise<void>
}

export function GroupCreateModal({ onClose, onSubmit }: Props) {
  const { t } = useI18n()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      setError(t('modals.groupCreate.nameRequired'))
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      await onSubmit({
        name: trimmedName,
        description: description.trim() || undefined,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('modals.groupCreate.createFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="tm-modal-overlay tm-modal-overlay--agent-settings" onClick={onClose}>
      <div
        className="tm-agent-modal tm-agent-modal--create"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-group-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="tm-agent-modal-header">
          <h3 id="create-group-title" className="tm-agent-modal-title">
            <span className="tm-agent-modal-title-dot" aria-hidden="true" />
            {t('modals.groupCreate.title')}
          </h3>
          <button type="button" className="tm-agent-modal-close" aria-label={t('common.close')} onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </header>

        <div className="tm-agent-modal-body tm-agent-modal-body--single">
          <div className="tm-agent-modal-content">
            <div className="tm-agent-settings-form">
              <div className="tm-agent-setting-row">
                <label className="tm-agent-setting-label" htmlFor="group-create-name">
                  {t('common.name')}
                  <span className="tm-agent-required" aria-hidden="true">
                    *
                  </span>
                </label>
                <input
                  id="group-create-name"
                  className="tm-agent-setting-input"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={t('modals.groupCreate.namePlaceholder')}
                  maxLength={100}
                  autoFocus
                />
              </div>

              <div className="tm-agent-setting-row tm-agent-setting-row--top">
                <label className="tm-agent-setting-label" htmlFor="group-create-description">
                  {t('common.description')}
                </label>
                <textarea
                  id="group-create-description"
                  className="tm-agent-setting-textarea"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder={t('modals.groupCreate.descriptionPlaceholder')}
                  maxLength={500}
                  rows={3}
                />
              </div>

              {error ? <p className="tm-agent-form-error">{error}</p> : null}
            </div>
          </div>
        </div>

        <footer className="tm-agent-modal-footer">
          <button
            type="button"
            className="tm-agent-modal-footer-btn tm-agent-modal-footer-btn--secondary"
            onClick={onClose}
            disabled={submitting}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="tm-agent-modal-footer-btn tm-agent-modal-footer-btn--primary"
            onClick={() => void handleSubmit()}
            disabled={submitting}
          >
            {submitting ? t('common.creating') : t('common.create')}
          </button>
        </footer>
      </div>
    </div>
  )
}
