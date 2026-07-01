import type { ReactNode } from 'react'

import { CommunityPanelHeader } from '../community/CommunityPanelHeader'

interface Props {
  title: string
  subtitle?: string
  actions?: ReactNode
  children: ReactNode
}

export function ProjectManagerPanelShell({
  title,
  subtitle,
  actions,
  children,
}: Props) {
  return (
    <div className="tm-community-market tm-community-list-panel">
      <CommunityPanelHeader title={title} subtitle={subtitle} actions={actions} />
      <div className="tm-kb-file-panel tm-community-list-panel-body">
        <div className="tm-kb-file-list">{children}</div>
      </div>
    </div>
  )
}
