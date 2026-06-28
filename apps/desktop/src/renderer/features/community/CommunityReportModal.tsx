import { useEffect, useState } from 'react'

import {
  type CommunityReportReason,
  type CommunityReportTargetType,
} from '@toolman/shared'

import { useI18n } from '../../i18n/useI18n'
import { createCommunityModerationReport } from './community-api.client'

const REPORT_REASONS: CommunityReportReason[] = ['spam', 'illegal', 'copyright', 'other']

interface Props {
  targetType: CommunityReportTargetType
  targetId: string
  onClose: () => void
}

export function CommunityReportModal({ targetType, targetId, onClose }: Props) {
  const { t } = useI18n()
  const [reason, setReason] = useState<CommunityReportReason>('spam')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const handleSubmit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      await createCommunityModerationReport({
        targetType,
        targetId,
        reason,
        description: description.trim() || undefined,
      })
      setSuccess(true)
      window.setTimeout(onClose, 900)
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : t('communityPage.reportModal.submitFailed'),
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="tm-modal-overlay" onClick={onClose}>
      <div className="tm-modal tm-modal--narrow tm-modal--form" onClick={(event) => event.stopPropagation()}>
        <div className="tm-modal-header">
          <h2 className="tm-modal-title">{t('communityPage.reportModal.title')}</h2>
          <button type="button" className="tm-modal-close" onClick={onClose} aria-label={t('common.close')}>
            ×
          </button>
        </div>

        <div className="tm-modal-body">
          {error ? <div className="tm-error-bar">{error}</div> : null}
          {success ? (
            <div className="tm-community-report-success">{t('communityPage.reportModal.success')}</div>
          ) : null}

          <label className="tm-form-field">
            <span className="tm-form-label">{t('communityPage.reportModal.reasonLabel')}</span>
            <select
              className="tm-form-input"
              value={reason}
              disabled={submitting || success}
              onChange={(event) => setReason(event.target.value as CommunityReportReason)}
            >
              {REPORT_REASONS.map((item) => (
                <option key={item} value={item}>
                  {t(`communityPage.admin.reportReasons.${item}`)}
                </option>
              ))}
            </select>
          </label>

          <label className="tm-form-field">
            <span className="tm-form-label">{t('communityPage.reportModal.descriptionLabel')}</span>
            <textarea
              className="tm-form-textarea"
              rows={4}
              value={description}
              disabled={submitting || success}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={t('communityPage.reportModal.descriptionPlaceholder')}
            />
          </label>
        </div>

        <div className="tm-modal-footer">
          <button type="button" className="tm-btn" onClick={onClose} disabled={submitting}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="tm-btn tm-btn--primary"
            disabled={submitting || success}
            onClick={() => void handleSubmit()}
          >
            {submitting ? t('communityPage.reportModal.submitting') : t('communityPage.reportModal.submit')}
          </button>
        </div>
      </div>
    </div>
  )
}
