export function GroupPickerCheckbox({
  checked,
  indeterminate,
  small,
  disabled,
  onChange,
}: {
  checked: boolean
  indeterminate?: boolean
  small?: boolean
  disabled?: boolean
  onChange: () => void
}) {
  return (
    <label
      className={[
        'tm-group-resource-picker-check',
        small ? 'tm-group-resource-picker-check--small' : '',
        checked ? 'tm-group-resource-picker-check--checked' : '',
        indeterminate ? 'tm-group-resource-picker-check--indeterminate' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={(event) => event.stopPropagation()}
    >
      <input
        type="checkbox"
        className="tm-group-resource-picker-check-input"
        checked={checked}
        disabled={disabled}
        onChange={onChange}
      />
      <span className="tm-group-resource-picker-check-box" aria-hidden="true">
        {checked ? '✓' : indeterminate ? '−' : ''}
      </span>
    </label>
  )
}
