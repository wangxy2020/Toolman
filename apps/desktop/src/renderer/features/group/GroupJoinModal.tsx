import { useEffect, useState } from 'react'
import { IpcChannel } from '@toolman/shared'
import { useI18n } from '../../i18n/useI18n'
import { translateP2pWanReadinessReason } from '../../i18n/system-labels'
import { GroupMemberLimitModal } from './GroupMemberLimitModal'
import { P2pJoinError } from './useP2pWorkspaces'

interface Props {
  onClose: () => void
  onSubmit: (input: { inviteToken: string; displayName?: string }) => Promise<void>
  onUpgradeMembership?: () => void
}

export function GroupJoinModal({ onClose, onSubmit, onUpgradeMembership }: Props) {
  const { t } = useI18n()
  const [inviteInput, setInviteInput] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [memberLimitOpen, setMemberLimitOpen] = useState(false)
  const [wanWarning, setWanWarning] = useState<string | null>(null)

  useEffect(() => {
    void window.api.invoke(IpcChannel.P2pNetworkGetConfig).then((result) => {
      if (!result.ok) return
      const config = result.data as {
        wanReadiness?: { ready: boolean; reason?: string }
      }
      const readiness = config.wanReadiness
      if (!readiness?.ready) {
        setWanWarning(
          translateP2pWanReadinessReason(readiness ?? { ready: false }, t, {
            turnNotConfiguredKey: 'modals.groupJoin.wanDefaultWarning',
            missingCredentialsKey: 'modals.groupJoin.wanMissingCredentials',
            fallbackKey: 'modals.groupJoin.wanDefaultWarning',
          }),
        )
      }
    })
  }, [t])

  const handleSubmit = async () => {
    const trimmed = inviteInput.trim()
    if (!trimmed) {
      setError(t('modals.groupJoin.inviteRequired'))
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
      setError(err instanceof Error ? err.message : t('modals.groupJoin.joinFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <div className="tm-modal-overlay" onClick={onClose}>
      <div className="tm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="tm-modal-header">
          <h2 className="tm-modal-title">{t('modals.groupJoin.title')}</h2>
          <button type="button" className="tm-modal-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="tm-modal-body">
          {wanWarning ? (
            <div className="tm-diagnostics-banner tm-diagnostics-banner--warn" role="status">
              <p>{wanWarning}</p>
              <p className="tm-settings-row-hint">{t('modals.groupJoin.wanHint')}</p>
            </div>
          ) : null}
          {error && <div className="tm-error-bar">{error}</div>}

          <label className="tm-model-form-field">
            <span className="tm-model-form-label">{t('modals.groupJoin.inviteLabel')}</span>
            <textarea
              className="tm-model-form-input"
              value={inviteInput}
              onChange={(e) => setInviteInput(e.target.value)}
              placeholder={t('modals.groupJoin.invitePlaceholder')}
              rows={4}
              autoFocus
            />
          </label>

          <label className="tm-model-form-field">
            <span className="tm-model-form-label">{t('modals.groupJoin.displayNameLabel')}</span>
            <input
              className="tm-model-form-input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t('modals.groupJoin.displayNamePlaceholder')}
              maxLength={100}
            />
          </label>
        </div>

        <div className="tm-modal-footer">
          <button type="button" className="tm-btn tm-btn--secondary" onClick={onClose} disabled={submitting}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="tm-btn tm-btn--primary"
            onClick={() => void handleSubmit()}
            disabled={submitting}
          >
            {submitting ? t('common.joining') : t('common.join')}
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
