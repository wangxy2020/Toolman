export function AgentSettingsToggle({
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

export function AgentSettingsHelpHint({ title }: { title: string }) {
  return (
    <span className="tm-agent-help" title={title} aria-label={title}>
      ⓘ
    </span>
  )
}
