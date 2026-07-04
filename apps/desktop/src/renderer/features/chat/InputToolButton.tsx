import type { ButtonHTMLAttributes, ReactNode } from 'react'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  children: ReactNode
  active?: boolean
}

export function InputToolButton({
  label,
  children,
  active = false,
  className = '',
  disabled,
  ...rest
}: Props) {
  const buttonClassName = [
    'tm-input-tool',
    active ? 'tm-input-tool--active' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  const button = (
    <button
      type="button"
      className={buttonClassName}
      aria-label={label}
      disabled={disabled}
      {...rest}
    >
      {children}
    </button>
  )

  if (disabled) {
    return (
      <span className="tm-header-icon-tooltip-wrap" data-tooltip={label}>
        {button}
      </span>
    )
  }

  return button
}
