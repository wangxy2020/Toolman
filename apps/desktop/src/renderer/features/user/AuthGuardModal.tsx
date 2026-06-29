import type { ReactNode } from 'react'

import { useI18n } from '../../i18n/useI18n'

interface AuthGuardModalProps {
  isOpen: boolean
  title: string
  description?: string
  confirmText?: string
  cancelText?: string
  onConfirm: () => void
  onCancel: () => void
  icon?: 'lock' | 'welcome'
  children?: ReactNode
}

function AuthGuardLockIcon() {
  return (
    <svg className="tm-auth-guard-icon-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
      />
    </svg>
  )
}

function AuthGuardWelcomeIcon() {
  return (
    <svg className="tm-auth-guard-icon-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3zM5 17l.75 2.25L8 20l-2.25.75L5 23l-.75-2.25L2 20l2.25-.75L5 17zM19 13l.75 2.25L22 16l-2.25.75L19 19l-.75-2.25L16 16l2.25-.75L19 13z"
      />
    </svg>
  )
}

export function AuthGuardModal({
  isOpen,
  title,
  description,
  confirmText,
  cancelText,
  onConfirm,
  onCancel,
  icon = 'lock',
  children,
}: AuthGuardModalProps) {
  const { t } = useI18n()
  const resolvedConfirmText = confirmText ?? t('user.guard.goRegister')
  const resolvedCancelText = cancelText ?? t('user.guard.dismiss')

  if (!isOpen) return null

  return (
    <div className="tm-modal-overlay tm-modal-overlay--auth-guard" onClick={onCancel}>
      <div
        className="tm-auth-guard-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-guard-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="tm-auth-guard-icon" aria-hidden="true">
          {icon === 'welcome' ? <AuthGuardWelcomeIcon /> : <AuthGuardLockIcon />}
        </div>

        <div className="tm-auth-guard-content">
          <h3 id="auth-guard-title" className="tm-auth-guard-title">
            {title}
          </h3>
          {description ? <p className="tm-auth-guard-desc">{description}</p> : null}
          {children ? <div className="tm-auth-guard-extra">{children}</div> : null}
        </div>

        <div className="tm-auth-guard-actions">
          <button
            type="button"
            className="tm-auth-guard-btn tm-auth-guard-btn--secondary"
            onClick={onCancel}
          >
            {resolvedCancelText}
          </button>
          <button
            type="button"
            className="tm-auth-guard-btn tm-auth-guard-btn--primary"
            onClick={onConfirm}
          >
            {resolvedConfirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
