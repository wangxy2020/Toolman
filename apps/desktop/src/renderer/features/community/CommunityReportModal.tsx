import { useEffect, useState } from 'react'

import {
  type CommunityReportReason,
  type CommunityReportTargetType,
} from '@toolman/shared'

import { createCommunityModerationReport } from './community-api.client'

const COMMUNITY_REPORT_REASON_LABELS: Record<CommunityReportReason, string> = {
  spam: '垃圾信息',
  illegal: '违法违规',
  copyright: '侵权内容',
  other: '其他',
}

const REPORT_REASONS: CommunityReportReason[] = ['spam', 'illegal', 'copyright', 'other']

interface Props {
  targetType: CommunityReportTargetType
  targetId: string
  onClose: () => void
}

export function CommunityReportModal({ targetType, targetId, onClose }: Props) {
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
      setError(submitError instanceof Error ? submitError.message : '举报失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="tm-modal-overlay" onClick={onClose}>
      <div className="tm-modal tm-modal--narrow tm-modal--form" onClick={(event) => event.stopPropagation()}>
        <div className="tm-modal-header">
          <h2 className="tm-modal-title">举报内容</h2>
          <button type="button" className="tm-modal-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>

        <div className="tm-modal-body">
          {error ? <div className="tm-error-bar">{error}</div> : null}
          {success ? <div className="tm-community-report-success">举报已提交，感谢你的反馈。</div> : null}

          <label className="tm-form-field">
            <span className="tm-form-label">举报原因</span>
            <select
              className="tm-form-input"
              value={reason}
              disabled={submitting || success}
              onChange={(event) => setReason(event.target.value as CommunityReportReason)}
            >
              {REPORT_REASONS.map((item) => (
                <option key={item} value={item}>
                  {COMMUNITY_REPORT_REASON_LABELS[item]}
                </option>
              ))}
            </select>
          </label>

          <label className="tm-form-field">
            <span className="tm-form-label">补充说明（可选）</span>
            <textarea
              className="tm-form-textarea"
              rows={4}
              value={description}
              disabled={submitting || success}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="请简要说明举报理由…"
            />
          </label>
        </div>

        <div className="tm-modal-footer">
          <button type="button" className="tm-btn" onClick={onClose} disabled={submitting}>
            取消
          </button>
          <button
            type="button"
            className="tm-btn tm-btn--primary"
            disabled={submitting || success}
            onClick={() => void handleSubmit()}
          >
            {submitting ? '提交中…' : '提交举报'}
          </button>
        </div>
      </div>
    </div>
  )
}
