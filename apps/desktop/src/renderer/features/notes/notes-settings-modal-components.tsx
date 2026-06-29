export type SettingsTab = 'storage' | 'editor' | 'display'

export const SETTINGS_TABS: { id: SettingsTab; label: string }[] = [
  { id: 'storage', label: 'storage' },
  { id: 'editor', label: 'editor' },
  { id: 'display', label: 'display' },
]

export function NotesSettingsToggle({
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
