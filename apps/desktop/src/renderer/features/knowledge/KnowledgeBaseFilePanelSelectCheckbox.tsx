export function KnowledgeBaseFilePanelSelectCheckbox({
  checked,
  disabled,
  onChange,
  title,
}: {
  checked: boolean
  disabled?: boolean
  onChange: () => void
  title: string
}) {
  return (
    <label className="tm-kb-file-card-select" title={title}>
      <input
        type="checkbox"
        className="tm-kb-file-card-select-input"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
      />
      <span
        className={[
          'tm-kb-file-card-select-box',
          checked ? 'tm-kb-file-card-select-box--checked' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-hidden="true"
      />
    </label>
  )
}
