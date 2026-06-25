import { useI18n } from '../i18n/useI18n'

interface Props {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel,
  danger = false,
  onConfirm,
  onCancel,
}: Props) {
  const { t } = useI18n()
  const resolvedConfirmLabel = confirmLabel ?? t('common.confirm')
  const resolvedCancelLabel = cancelLabel ?? t('common.cancel')

  return (
    <div className="tm-modal-overlay" onClick={onCancel}>
      <div className="tm-confirm-dialog" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <h2 className="tm-confirm-dialog-title">{title}</h2>
        <p className="tm-confirm-dialog-message">{message}</p>
        <div className="tm-confirm-dialog-actions">
          <button type="button" className="tm-btn tm-btn--ghost" onClick={onCancel}>
            {resolvedCancelLabel}
          </button>
          <button
            type="button"
            className={`tm-btn ${danger ? 'tm-message-delete-confirm-submit' : 'tm-btn--primary'}`}
            onClick={onConfirm}
          >
            {resolvedConfirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
