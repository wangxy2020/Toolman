import type { ReactNode } from 'react'

interface Props {
  title: string
  subtitle: string
  actions?: ReactNode
}

export function GroupPanelHeader({ title, subtitle, actions }: Props) {
  return (
    <div className="tm-group-member-panel-header">
      <div>
        <h2 className="tm-group-member-panel-title">{title}</h2>
        <p className="tm-group-member-panel-subtitle">{subtitle}</p>
      </div>
      {actions}
    </div>
  )
}
