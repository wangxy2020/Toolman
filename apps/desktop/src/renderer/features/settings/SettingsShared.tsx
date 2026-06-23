import type { ReactNode } from 'react'

export function SettingsPageLayout({ children }: { children: ReactNode }) {
  return <div className="tm-settings-page-body">{children}</div>
}

export function SettingsSection({
  title,
  badge,
  action,
  intro,
  children,
}: {
  title: string
  badge?: boolean
  action?: ReactNode
  intro?: string
  children: ReactNode
}) {
  return (
    <section className="tm-display-card">
      <header className="tm-display-card-header">
        <h3 className="tm-display-card-title">
          {title}
          {badge ? <span className="tm-display-badge">New</span> : null}
        </h3>
        {action}
      </header>
      <div className="tm-display-card-body">
        {intro ? <p className="tm-settings-intro">{intro}</p> : null}
        {children}
      </div>
    </section>
  )
}

export function SettingsRow({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children?: ReactNode
}) {
  return (
    <div className="tm-display-row">
      <div className="tm-display-row-label">
        <span>{label}</span>
        {hint ? <p className="tm-settings-row-hint">{hint}</p> : null}
      </div>
      <div className="tm-display-row-control">{children}</div>
    </div>
  )
}

export function SettingsToggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-disabled={disabled}
      disabled={disabled}
      className={`tm-msg-toggle ${checked ? 'tm-msg-toggle--on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="tm-msg-toggle-thumb" />
    </button>
  )
}

export function SettingsSelect<T extends string>({
  value,
  options,
  onChange,
  disabled,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
  disabled?: boolean
}) {
  return (
    <select
      className="tm-settings-select"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as T)}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  )
}

export function SettingsInput({
  value,
  onChange,
  type = 'text',
  placeholder,
  min,
  disabled,
}: {
  value: string | number
  onChange: (value: string) => void
  type?: 'text' | 'number' | 'password'
  placeholder?: string
  min?: number
  disabled?: boolean
}) {
  return (
    <input
      className="tm-settings-input"
      type={type}
      value={value}
      placeholder={placeholder}
      min={min}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

export function SettingsPlaceholder({ title, description }: { title: string; description: string }) {
  return (
    <SettingsSection title={title}>
      <p className="tm-settings-placeholder-text">{description}</p>
    </SettingsSection>
  )
}
