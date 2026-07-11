import { useCallback, useState } from 'react'

import { useI18n } from '../../i18n/useI18n'

export type PmNewProjectBriefValues = {
  name: string
  overview: string
  durationDays?: number
}

interface Props {
  defaultName: string
  submitting?: boolean
  onCancel: () => void
  onSubmit: (values: PmNewProjectBriefValues) => void | Promise<void>
}

export function PmNewProjectBriefForm({
  defaultName,
  submitting = false,
  onCancel,
  onSubmit,
}: Props) {
  const { t } = useI18n()
  const [name, setName] = useState('')
  const [overview, setOverview] = useState('')
  const [durationDays, setDurationDays] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = useCallback(async () => {
    const trimmedOverview = overview.trim()
    if (!trimmedOverview) {
      setError(t('projectManagerPage.agent.briefOverviewRequired'))
      return
    }
    setError(null)
    const parsedDuration = durationDays.trim()
      ? Number.parseInt(durationDays.trim(), 10)
      : undefined
    await onSubmit({
      name: name.trim() || defaultName,
      overview: trimmedOverview,
      durationDays:
        parsedDuration != null && Number.isFinite(parsedDuration) && parsedDuration > 0
          ? parsedDuration
          : undefined,
    })
  }, [defaultName, durationDays, name, onSubmit, overview, t])

  return (
    <div className="tm-pm-new-project-brief">
      <div className="tm-pm-new-project-brief-header">
        <strong>{t('projectManagerPage.agent.briefTitle')}</strong>
        <span className="tm-pm-new-project-brief-hint">
          {t('projectManagerPage.agent.briefHint', { defaultName })}
        </span>
      </div>

      <label className="tm-pm-new-project-brief-field">
        <span>{t('projectManagerPage.agent.briefName')}</span>
        <input
          className="tm-pm-database-input"
          value={name}
          placeholder={defaultName}
          disabled={submitting}
          onChange={(event) => setName(event.target.value)}
        />
      </label>

      <label className="tm-pm-new-project-brief-field">
        <span>
          {t('projectManagerPage.agent.briefOverview')}
          <em className="tm-pm-new-project-brief-required">*</em>
        </span>
        <textarea
          className="tm-pm-new-project-brief-textarea"
          rows={4}
          value={overview}
          disabled={submitting}
          placeholder={t('projectManagerPage.agent.briefOverviewPlaceholder')}
          onChange={(event) => setOverview(event.target.value)}
        />
      </label>

      <label className="tm-pm-new-project-brief-field">
        <span>{t('projectManagerPage.agent.briefDuration')}</span>
        <input
          className="tm-pm-database-input"
          type="number"
          min={1}
          value={durationDays}
          disabled={submitting}
          placeholder={t('projectManagerPage.agent.briefDurationPlaceholder')}
          onChange={(event) => setDurationDays(event.target.value)}
        />
      </label>

      {error ? <p className="tm-pm-new-project-brief-error">{error}</p> : null}

      <div className="tm-pm-new-project-brief-actions">
        <button
          type="button"
          className="tm-pm-new-project-brief-cancel"
          disabled={submitting}
          onClick={onCancel}>
          {t('projectManagerPage.agent.briefCancel')}
        </button>
        <button
          type="button"
          className="tm-pm-new-project-brief-confirm"
          disabled={submitting}
          onClick={() => void handleSubmit()}>
          {t('projectManagerPage.agent.briefSubmit')}
        </button>
      </div>
    </div>
  )
}
