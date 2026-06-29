import type { ReactNode } from 'react'

import { IconChevronRight } from '../../components/icons'

export function Toggle({
  checked,
  onChange,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`tm-msg-toggle ${checked ? 'tm-msg-toggle--on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="tm-msg-toggle-thumb" />
    </button>
  )
}

export function SettingSelect<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <select
      className="tm-msg-select"
      value={value}
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

export function SettingLabel({
  children,
  help,
}: {
  children: ReactNode
  help?: string
}) {
  return (
    <span className="tm-msg-setting-label">
      {children}
      {help ? (
        <span className="tm-msg-help" title={help} aria-label={help}>
          ⓘ
        </span>
      ) : null}
    </span>
  )
}

export function CollapsibleSection({
  title,
  open,
  onToggle,
  children,
}: {
  title: string
  open: boolean
  onToggle: () => void
  children?: ReactNode
}) {
  return (
    <section className="tm-msg-settings-section">
      <button type="button" className="tm-msg-settings-section-head" onClick={onToggle}>
        <span>{title}</span>
        <IconChevronRight open={open} size={12} />
      </button>
      {open && children ? <div className="tm-msg-settings-section-body">{children}</div> : null}
    </section>
  )
}
