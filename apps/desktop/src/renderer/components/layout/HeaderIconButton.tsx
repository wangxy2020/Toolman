import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'

export interface HeaderIconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  children: ReactNode
  active?: boolean
  accent?: boolean
}

export const HeaderIconButton = forwardRef<HTMLButtonElement, HeaderIconButtonProps>(
  function HeaderIconButton(
    { label, children, active = false, accent = false, className = '', disabled, ...rest },
    ref,
  ) {
    const buttonClassName = [
      'tm-chat-header-settings-btn',
      accent ? 'tm-chat-header-settings-btn--accent' : '',
      active ? 'tm-chat-header-settings-btn--active' : '',
      className,
    ]
      .filter(Boolean)
      .join(' ')

    const button = (
      <button
        ref={ref}
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
  },
)
