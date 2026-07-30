import type { FC, FormEvent } from 'react'
import { useEffect, useState } from 'react'

import { useI18n } from '../../../../i18n/useI18n'
import {
  formatMeteringPeriodName,
  isAutoMeteringPeriodName,
} from './pm-metering-baselines'
import { formatWorkItemDate, parseDateInput } from '../schedule/pm-gantt-utils'

type Props = {
  mode?: 'capture' | 'edit'
  initialDateMs?: number
  /** Suggested / current name e.g. 周期1 (2026-09-15) */
  initialName: string
  /** Auto name index (周期N) — used when date changes and name is still auto. */
  nameIndex?: number
  onCancel: () => void
  onConfirm: (input: { name: string; asOfDate: string }) => void
}

function toDateInputValue(ms: number): string {
  return formatWorkItemDate(ms)
}

/**
 * Create / edit metering period — same chrome as Gantt baseline dialog,
 * copy tuned for 价格表 · 计量「创建周期」.
 */
const MeteringBaselineCaptureDialog: FC<Props> = ({
  mode = 'capture',
  initialDateMs,
  initialName,
  nameIndex,
  onCancel,
  onConfirm,
}) => {
  const { t } = useI18n()
  const [name, setName] = useState(initialName)
  const [nameTouched, setNameTouched] = useState(mode === 'edit')
  const [dateText, setDateText] = useState(() =>
    toDateInputValue(initialDateMs ?? Date.now()),
  )
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setName(initialName)
    setNameTouched(mode === 'edit')
  }, [initialName, mode])

  useEffect(() => {
    setDateText(toDateInputValue(initialDateMs ?? Date.now()))
  }, [initialDateMs])

  useEffect(() => {
    if (nameIndex == null) return
    if (nameTouched && !isAutoMeteringPeriodName(name)) return
    const parsed = parseDateInput(dateText)
    if (parsed == null) return
    const next = formatMeteringPeriodName(nameIndex, toDateInputValue(parsed))
    if (next !== name) setName(next)
  }, [dateText, nameIndex, nameTouched, name])

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
    const trimmedName = name.trim()
    if (!trimmedName) {
      setError(t('projectManagerPage.costTable.meteringBaselineCapture.invalidName'))
      return
    }
    const parsed = parseDateInput(dateText)
    if (parsed == null) {
      setError(t('projectManagerPage.costTable.meteringBaselineCapture.invalidDate'))
      return
    }
    setError(null)
    onConfirm({ name: trimmedName, asOfDate: toDateInputValue(parsed) })
  }

  const titleKey =
    mode === 'edit'
      ? 'projectManagerPage.costTable.meteringBaselineEdit.title'
      : 'projectManagerPage.costTable.meteringBaselineCapture.title'
  const messageKey =
    mode === 'edit'
      ? 'projectManagerPage.costTable.meteringBaselineEdit.message'
      : 'projectManagerPage.costTable.meteringBaselineCapture.message'
  const confirmKey =
    mode === 'edit'
      ? 'projectManagerPage.costTable.meteringBaselineEdit.confirm'
      : 'projectManagerPage.costTable.meteringBaselineCapture.confirm'

  return (
    <div className="tm-modal-overlay" onClick={onCancel}>
      <div
        className="tm-confirm-dialog tm-pm-baseline-capture-dialog"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tm-pm-metering-baseline-capture-title"
      >
        <h2 id="tm-pm-metering-baseline-capture-title" className="tm-confirm-dialog-title">
          {t(titleKey)}
        </h2>
        <p className="tm-confirm-dialog-message">{t(messageKey)}</p>
        <form onSubmit={handleSubmit}>
          <label className="tm-pm-baseline-capture-field">
            <span>{t('projectManagerPage.costTable.meteringBaselineCapture.nameLabel')}</span>
            <input
              type="text"
              className="tm-pm-baseline-capture-text tm-pm-baseline-capture-text--full"
              value={name}
              maxLength={200}
              autoFocus
              onChange={(event) => {
                setName(event.target.value)
                setNameTouched(
                  mode === 'edit' || !isAutoMeteringPeriodName(event.target.value),
                )
                if (error) setError(null)
              }}
            />
          </label>
          <label className="tm-pm-baseline-capture-field">
            <span>{t('projectManagerPage.costTable.meteringBaselineCapture.dateLabel')}</span>
            <div className="tm-pm-baseline-capture-inputs">
              <input
                type="text"
                className="tm-pm-baseline-capture-text"
                value={dateText}
                placeholder="YYYY-MM-DD"
                inputMode="numeric"
                onChange={(event) => {
                  setDateText(event.target.value)
                  if (error) setError(null)
                }}
              />
              <input
                type="date"
                className="tm-pm-baseline-capture-picker"
                value={parseDateInput(dateText) != null ? dateText : ''}
                onChange={(event) => {
                  const next = event.target.value
                  if (!next) return
                  setDateText(next)
                  if (error) setError(null)
                }}
                aria-label={t('projectManagerPage.costTable.meteringBaselineCapture.pickDate')}
              />
            </div>
          </label>
          {error ? <p className="tm-pm-baseline-capture-error">{error}</p> : null}
          <div className="tm-confirm-dialog-actions">
            <button type="button" className="tm-btn tm-btn--ghost" onClick={onCancel}>
              {t('common.cancel')}
            </button>
            <button type="submit" className="tm-btn tm-btn--primary">
              {t(confirmKey)}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default MeteringBaselineCaptureDialog
