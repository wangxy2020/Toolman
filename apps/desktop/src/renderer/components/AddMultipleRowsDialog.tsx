import type { FC, FormEvent } from 'react'
import { useEffect, useState } from 'react'

import { useI18n } from '../i18n/useI18n'

const DEFAULT_COUNT = 10
const MIN_COUNT = 1
const MAX_COUNT = 500

type Props = {
  title?: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: (count: number) => void
  onCancel: () => void
}

/** Prompt for how many empty rows to append (⌘/Ctrl-click Add). */
export const AddMultipleRowsDialog: FC<Props> = ({
  title,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}) => {
  const { t } = useI18n()
  const [raw, setRaw] = useState(String(DEFAULT_COUNT))

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

  const parsed = Number.parseInt(raw.trim(), 10)
  const count =
    Number.isFinite(parsed) && parsed >= MIN_COUNT
      ? Math.min(MAX_COUNT, parsed)
      : null

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault()
    if (count == null) return
    onConfirm(count)
  }

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
          {title ?? t('projectManagerPage.costTable.addMultiple.title')}
        </h2>
        <p className="tm-confirm-dialog-message">
          {t('projectManagerPage.costTable.addMultiple.message', {
            max: String(MAX_COUNT),
          })}
        </p>
        <div className="tm-form-field" style={{ marginBottom: 16 }}>
          <label className="tm-form-label" htmlFor="pm-add-multiple-rows-count">
            {t('projectManagerPage.costTable.addMultiple.countLabel')}
          </label>
          <input
            id="pm-add-multiple-rows-count"
            className="tm-kb-settings-input"
            type="number"
            inputMode="numeric"
            min={MIN_COUNT}
            max={MAX_COUNT}
            step={1}
            value={raw}
            onChange={(event) => setRaw(event.target.value)}
            autoFocus
          />
        </div>
        <div className="tm-confirm-dialog-actions">
          <button type="button" className="tm-btn tm-btn--ghost" onClick={onCancel}>
            {cancelLabel ?? t('common.cancel')}
          </button>
          <button type="submit" className="tm-btn tm-btn--primary" disabled={count == null}>
            {confirmLabel ?? t('common.confirm')}
          </button>
        </div>
      </form>
    </div>
  )
}
