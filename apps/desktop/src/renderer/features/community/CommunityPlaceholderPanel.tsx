import type { ReactNode } from 'react'

interface Props {
  title: string
  hint: string
  icon?: ReactNode
}

export function CommunityPlaceholderPanel({ title, hint, icon }: Props) {
  return (
    <div className="tm-group-member-panel">
      <div className="tm-group-member-panel-header">
        <div>
          <h2 className="tm-group-member-panel-title">{title}</h2>
          <p className="tm-group-member-panel-subtitle">社区 · 即将推出</p>
        </div>
      </div>
      <div className="tm-group-member-panel-empty">
        {icon ? <span className="tm-group-member-panel-empty-icon">{icon}</span> : null}
        <p>{hint}</p>
      </div>
    </div>
  )
}
