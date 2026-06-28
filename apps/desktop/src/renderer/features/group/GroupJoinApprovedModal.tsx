import { useI18n } from '../../i18n/useI18n'

interface Props {
  workspaceName: string
  onClose: () => void
}

export function GroupJoinApprovedModal({ workspaceName, onClose }: Props) {
  const { t } = useI18n()

  return (
    <div className="tm-modal-overlay" onClick={onClose}>
      <div
        className="tm-confirm-dialog"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <h2 className="tm-confirm-dialog-title">{t('modals.groupJoinApproved.title')}</h2>
        <p className="tm-confirm-dialog-message">
          {t('modals.groupJoinApproved.message', { name: workspaceName })}
        </p>
        <div className="tm-confirm-dialog-actions">
          <button type="button" className="tm-btn tm-btn--primary" onClick={onClose}>
            {t('modals.groupJoinApproved.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
