import type { ReactNode } from 'react'

export function AssistantSettingsToggle({
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
      className={`tm-agent-toggle ${checked ? 'tm-agent-toggle--on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="tm-agent-toggle-thumb" />
    </button>
  )
}

export function AssistantSettingsHelpHint({ title }: { title: string }) {
  return (
    <span className="tm-agent-help" title={title} aria-label={title}>
      ⓘ
    </span>
  )
}

export function AssistantSettingsRequiredMark({ children }: { children?: ReactNode }) {
  return (
    <span className="tm-agent-required" aria-hidden="true">
      {children ?? '*'}
    </span>
  )
}
