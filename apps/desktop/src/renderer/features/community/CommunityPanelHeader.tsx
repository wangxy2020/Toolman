import type { ReactNode } from 'react'

import { IconPlus, IconRefresh } from '../../components/icons'

interface HeaderProps {
  title: string
  subtitle?: string
  titleExtra?: ReactNode
  actions?: ReactNode
}

export function CommunityPanelHeader({ title, subtitle, titleExtra, actions }: HeaderProps) {
  return (
    <header className="tm-community-market-header tm-community-panel-header">
      <div className="tm-community-panel-heading">
        <div className="tm-community-panel-title-row">
          <h2 className="tm-community-panel-title">{title}</h2>
          {titleExtra}
        </div>
        {subtitle ? <p className="tm-community-panel-subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="tm-community-panel-actions">{actions}</div> : null}
    </header>
  )
}

interface RefreshButtonProps {
  disabled?: boolean
  loading?: boolean
  title?: string
  onClick: () => void
}

export function CommunityPanelRefreshButton({
  disabled = false,
  loading = false,
  title = '刷新',
  onClick,
}: RefreshButtonProps) {
  return (
    <button
      type="button"
      className="tm-community-panel-icon-btn"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
    >
      <IconRefresh size={16} className={loading ? 'tm-icon-spin' : undefined} />
    </button>
  )
}

interface PublishButtonProps {
  label: string
  disabled?: boolean
  onClick?: () => void
}

export function CommunityPanelPublishButton({ label, disabled = false, onClick }: PublishButtonProps) {
  return (
    <button
      type="button"
      className="tm-community-panel-publish-btn"
      disabled={disabled || !onClick}
      onClick={onClick}
    >
      <IconPlus size={16} />
      <span>{label}</span>
    </button>
  )
}

interface SecondaryButtonProps {
  children: ReactNode
  disabled?: boolean
  title?: string
  ariaLabel?: string
  onClick: () => void
}

export function CommunityPanelSecondaryButton({
  children,
  disabled = false,
  title,
  ariaLabel,
  onClick,
}: SecondaryButtonProps) {
  return (
    <button
      type="button"
      className="tm-community-panel-secondary-btn"
      title={title}
      aria-label={ariaLabel ?? title}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
