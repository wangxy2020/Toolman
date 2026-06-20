interface AuthGuardModalProps {
  isOpen: boolean
  title: string
  description: string
  confirmText?: string
  cancelText?: string
  onConfirm: () => void
  onCancel: () => void
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

export function AuthGuardModal({
  isOpen,
  title,
  description,
  confirmText = '去注册',
  cancelText = '我知道了',
  onConfirm,
  onCancel,
}: AuthGuardModalProps) {
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
          <AuthGuardLockIcon />
        </div>

        <div className="tm-auth-guard-content">
          <h3 id="auth-guard-title" className="tm-auth-guard-title">
            {title}
          </h3>
          <p className="tm-auth-guard-desc">{description}</p>
        </div>

        <div className="tm-auth-guard-actions">
          <button
            type="button"
            className="tm-auth-guard-btn tm-auth-guard-btn--secondary"
            onClick={onCancel}
          >
            {cancelText}
          </button>
          <button
            type="button"
            className="tm-auth-guard-btn tm-auth-guard-btn--primary"
            onClick={onConfirm}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
