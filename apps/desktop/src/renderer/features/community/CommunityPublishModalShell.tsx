import { type ReactNode } from 'react'

import { IconX } from '../../components/icons'
import { useI18n } from '../../i18n/useI18n'

interface ShellProps {
  title: string
  titleId?: string
  ariaLabel?: string
  onClose: () => void
  children: ReactNode
  footer: ReactNode
  modalClassName?: string
  stacked?: boolean
}

export function CommunityPublishModalShell({
  title,
  titleId = 'community-publish-modal-title',
  ariaLabel,
  onClose,
  children,
  footer,
  modalClassName,
  stacked = false,
}: ShellProps) {
  const { t } = useI18n()

  return (
    <div
      className={[
        'tm-modal-overlay',
        'tm-modal-overlay--community-publish',
        stacked ? 'tm-modal-overlay--community-publish-stacked' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div
        className={['tm-community-publish-modal', modalClassName].filter(Boolean).join(' ')}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-label={ariaLabel}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="tm-community-publish-modal-header">
          <div className="tm-community-publish-modal-heading">
            <h3 id={titleId} className="tm-community-publish-modal-title">
              <span className="tm-community-publish-modal-title-dot" aria-hidden="true" />
              {title}
            </h3>
          </div>
          <button
            type="button"
            className="tm-community-publish-modal-close"
            aria-label={t('common.close')}
            onClick={onClose}
          >
            <IconX size={16} />
          </button>
        </header>

        <div className="tm-community-publish-modal-body">{children}</div>

        <footer className="tm-community-publish-modal-footer">{footer}</footer>
      </div>
    </div>
  )
}

interface FooterActionsProps {
  cancelLabel?: string
  confirmLabel?: string
  onCancel: () => void
  onConfirm?: () => void
  cancelDisabled?: boolean
  confirmDisabled?: boolean
  confirmOnly?: boolean
}

export function CommunityPublishModalFooterActions({
  cancelLabel,
  confirmLabel,
  onCancel,
  onConfirm,
  cancelDisabled = false,
  confirmDisabled = false,
  confirmOnly = false,
}: FooterActionsProps) {
  const { t } = useI18n()

  return (
    <div className="tm-community-publish-modal-footer-actions">
      {!confirmOnly ? (
        <button
          type="button"
          className="tm-community-publish-modal-footer-btn tm-community-publish-modal-footer-btn--secondary"
          onClick={onCancel}
          disabled={cancelDisabled}
        >
          {cancelLabel ?? t('communityPage.publish.cancel')}
        </button>
      ) : null}
      {confirmLabel ? (
        <button
          type="button"
          className="tm-community-publish-modal-footer-btn tm-community-publish-modal-footer-btn--primary"
          onClick={onConfirm}
          disabled={confirmDisabled}
        >
          {confirmLabel}
        </button>
      ) : null}
    </div>
  )
}

export function CommunityPublishModalError({ message }: { message: string }) {
  return <div className="tm-community-publish-modal-error">{message}</div>
}

export function CommunityPublishModalNotice({ message }: { message: string }) {
  return <div className="tm-community-publish-modal-notice">{message}</div>
}
