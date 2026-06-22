import type { ReactNode } from 'react'

interface Props {
  title: string
  subtitle: string
  titleExtra?: ReactNode
  actions?: ReactNode
}

export function GroupPanelHeader({ title, subtitle, titleExtra, actions }: Props) {
  return (
    <header className="tm-community-market-header tm-community-panel-header tm-group-member-panel-header">
      <div className="tm-community-panel-heading">
        <div className="tm-community-panel-title-row">
          <h2 className="tm-community-panel-title">{title}</h2>
          {titleExtra}
        </div>
        <p className="tm-community-panel-subtitle">{subtitle}</p>
      </div>
      {actions ? <div className="tm-community-panel-actions">{actions}</div> : null}
    </header>
  )
}
