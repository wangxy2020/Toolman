import type { FC, FormEvent } from 'react'
import { useEffect, useState } from 'react'

import { useI18n } from '../i18n/useI18n'

type Props = {
  /** Next version number that will be created (e.g. current max + 1). */
  nextVersion: number
  /** Optional current version shown for context (0 / omit when none). */
  currentVersion?: number
  title?: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: (note: string | undefined) => void
  onCancel: () => void
}

/** Dialog for「另存为新版本」— shows target version, optional note, Cancel / Confirm. */
export const SaveAsNewVersionDialog: FC<Props> = ({
  nextVersion,
  currentVersion,
  title,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}) => {
  const { t } = useI18n()
  const [note, setNote] = useState('')

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCancel()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    onConfirm(note.trim() || undefined)
  }

  const message =
    currentVersion != null && currentVersion > 0
      ? t('projectManagerPage.saveAsNewVersion.messageFromCurrent', {
          current: String(currentVersion),
          next: String(nextVersion),
        })
      : t('projectManagerPage.saveAsNewVersion.messageFirst', {
          next: String(nextVersion),
        })

  return (
    <div className="tm-modal-overlay" onClick={onCancel}>
      <form
        className="tm-confirm-dialog"
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
        role="dialog"
        aria-modal="true"
      >
        <h2 className="tm-confirm-dialog-title">
          {title ?? t('projectManagerPage.saveAsNewVersion.title')}
        </h2>
        <p className="tm-confirm-dialog-message">{message}</p>
        <div className="tm-form-field" style={{ marginBottom: 12 }}>
          <label className="tm-form-label" htmlFor="pm-save-as-new-version-number">
            {t('projectManagerPage.saveAsNewVersion.versionLabel')}
          </label>
          <input
            id="pm-save-as-new-version-number"
            className="tm-kb-settings-input"
            value={String(nextVersion)}
            readOnly
            tabIndex={-1}
          />
        </div>
        <div className="tm-form-field" style={{ marginBottom: 16 }}>
          <label className="tm-form-label" htmlFor="pm-save-as-new-version-note">
            {t('projectManagerPage.saveAsNewVersion.noteLabel')}
          </label>
          <input
            id="pm-save-as-new-version-note"
            className="tm-kb-settings-input"
            value={note}
            placeholder={t('projectManagerPage.saveAsNewVersion.notePlaceholder')}
            onChange={(event) => setNote(event.target.value)}
            autoFocus
          />
        </div>
        <div className="tm-confirm-dialog-actions">
          <button type="button" className="tm-btn tm-btn--ghost" onClick={onCancel}>
            {cancelLabel ?? t('common.cancel')}
          </button>
          <button type="submit" className="tm-btn tm-btn--primary">
            {confirmLabel ?? t('common.confirm')}
          </button>
        </div>
      </form>
    </div>
  )
}
