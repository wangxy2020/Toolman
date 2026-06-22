import { useState } from 'react'
import { GroupMemberLimitModal } from './GroupMemberLimitModal'
import { P2pJoinError } from './useP2pWorkspaces'

interface Props {
  onClose: () => void
  onSubmit: (input: { inviteToken: string; displayName?: string }) => Promise<void>
  onUpgradeMembership?: () => void
}

export function GroupJoinModal({ onClose, onSubmit, onUpgradeMembership }: Props) {
  const [inviteInput, setInviteInput] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [memberLimitOpen, setMemberLimitOpen] = useState(false)

  const handleSubmit = async () => {
    const trimmed = inviteInput.trim()
    if (!trimmed) {
      setError('请输入邀请码或邀请链接')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      await onSubmit({
        inviteToken: trimmed,
        displayName: displayName.trim() || undefined,
      })
      onClose()
    } catch (err) {
      if (err instanceof P2pJoinError && err.code === 'P2P_MEMBER_LIMIT') {
        setMemberLimitOpen(true)
        setError(null)
        return
      }
      setError(err instanceof Error ? err.message : '加入失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div className="tm-modal-overlay" onClick={onClose}>
      <div className="tm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="tm-modal-header">
          <h2 className="tm-modal-title">加入群组</h2>
          <button type="button" className="tm-modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="tm-modal-body">
          {error && <div className="tm-error-bar">{error}</div>}

          <label className="tm-model-form-field">
            <span className="tm-model-form-label">邀请码 / 邀请链接</span>
            <textarea
              className="tm-model-form-input"
              value={inviteInput}
              onChange={(e) => setInviteInput(e.target.value)}
              placeholder="粘贴 toolman://join?... 或邀请码"
              rows={4}
              autoFocus
            />
          </label>

          <label className="tm-model-form-field">
            <span className="tm-model-form-label">群内显示名（可选）</span>
            <input
              className="tm-model-form-input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="在群组中显示的名称"
              maxLength={100}
            />
          </label>
        </div>

        <div className="tm-modal-footer">
          <button type="button" className="tm-btn tm-btn--secondary" onClick={onClose} disabled={submitting}>
            取消
          </button>
          <button
            type="button"
            className="tm-btn tm-btn--primary"
            onClick={() => void handleSubmit()}
            disabled={submitting}
          >
            {submitting ? '加入中…' : '加入'}
          </button>
        </div>
      </div>
      </div>

      <GroupMemberLimitModal
        open={memberLimitOpen}
        onClose={() => setMemberLimitOpen(false)}
        onUpgrade={onUpgradeMembership}
      />
    </>
  )
}
