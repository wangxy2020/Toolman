import { useI18n } from '../../i18n/useI18n'

interface Props {
  onClose: () => void
  onCancelRequest: () => Promise<void>
}

export function GroupJoinPendingModal({ onClose, onCancelRequest }: Props) {
  const { t } = useI18n()

  return (
    <div className="tm-modal-overlay" onClick={onClose}>
      <div
        className="tm-confirm-dialog"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <h2 className="tm-confirm-dialog-title">{t('modals.groupJoinPending.title')}</h2>
        <p className="tm-confirm-dialog-message">{t('modals.groupJoinPending.message')}</p>
        <div className="tm-confirm-dialog-actions">
          <button
            type="button"
            className="tm-btn tm-btn--ghost"
            onClick={() => void onCancelRequest()}
          >
            {t('modals.groupJoinPending.cancelRequest')}
          </button>
          <button type="button" className="tm-btn tm-btn--primary" onClick={onClose}>
            {t('modals.groupJoinPending.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
