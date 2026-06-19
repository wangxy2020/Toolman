import type { ReactNode } from 'react'
import { GroupPanelHeader } from './GroupPanelHeader'

interface Props {
  title: string
  workspaceName: string
  hint: string
  icon?: ReactNode
}

export function GroupPlaceholderPanel({ title, workspaceName, hint, icon }: Props) {
  return (
    <div className="tm-group-member-panel">
      <GroupPanelHeader title={title} subtitle={`${workspaceName} · 即将推出`} />
      <div className="tm-group-member-panel-empty">
        {icon ? <span className="tm-group-member-panel-empty-icon">{icon}</span> : null}
        <p>{hint}</p>
      </div>
    </div>
  )
}
