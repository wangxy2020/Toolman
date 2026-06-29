import type { ReactNode } from 'react'

export function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M12 3l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 15.8 7.2 17.9l.9-5.4L4.2 8.7l5.4-.8L12 3z" />
    </svg>
  )
}

function ChevronRightIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.75">
      <rect x="7" y="2" width="10" height="20" rx="2" />
      <path d="M11 18h2" strokeLinecap="round" />
    </svg>
  )
}

export function WechatIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path
        d="M7 10h.01M11 10h.01M15 10h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 0 1-4-.8L3 20l1.2-3.6C3.41 15.03 3 13.55 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.75">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" strokeLinecap="round" />
    </svg>
  )
}

export function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" strokeLinecap="round" />
      <path d="M16 17l5-5-5-5M21 12H9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function DeleteIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export interface AccountActionItem {
  key: string
  icon: ReactNode
  label: string
  secondary?: string
  danger?: boolean
  disabled?: boolean
  onClick: () => void
}

export function AccountActionBox({
  icon,
  label,
  secondary,
  danger,
  highlight,
  disabled,
  interactive = true,
  onClick,
}: {
  icon: ReactNode
  label: string
  secondary?: string
  danger?: boolean
  highlight?: boolean
  disabled?: boolean
  interactive?: boolean
  onClick?: () => void
}) {
  const className = [
    'tm-user-center-account-action-box',
    danger ? 'tm-user-center-account-action-box--danger' : '',
    highlight ? 'tm-user-center-account-action-box--membership' : '',
    secondary ? 'tm-user-center-account-action-box--multiline' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const content = (
    <>
      <span className="tm-user-center-account-action-icon">{icon}</span>
      <span className="tm-user-center-account-action-label">
        <span className="tm-user-center-account-action-primary">{label}</span>
        {secondary ? (
          <span className="tm-user-center-account-action-secondary">{secondary}</span>
        ) : null}
      </span>
      <span className="tm-user-center-account-action-chevron">
        <ChevronRightIcon />
      </span>
    </>
  )

  if (!interactive) {
    return <div className={className}>{content}</div>
  }

  return (
    <button type="button" className={className} disabled={disabled} onClick={onClick}>
      {content}
    </button>
  )
}

export function AccountPasswordInput({
  value,
  placeholder,
  disabled,
  autoComplete,
  onChange,
}: {
  value: string
  placeholder: string
  disabled?: boolean
  autoComplete?: string
  onChange: (value: string) => void
}) {
  return (
    <div className="tm-auth-entry-input-shell">
      <input
        className="tm-auth-entry-input"
        type="password"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

export function AccountField({
  label,
  type = 'text',
  value,
  disabled,
  autoComplete,
  inputMode,
  onChange,
}: {
  label: string
  type?: string
  value: string
  disabled?: boolean
  autoComplete?: string
  inputMode?: 'tel' | 'numeric' | 'email'
  onChange: (value: string) => void
}) {
  return (
    <label className="tm-user-center-field">
      <span className="tm-user-center-field-label">{label}</span>
      <div className="tm-user-center-field-input-wrap">
        <input
          className="tm-user-center-field-input"
          type={type}
          value={value}
          disabled={disabled}
          autoComplete={autoComplete}
          inputMode={inputMode}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </label>
  )
}
