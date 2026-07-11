import type { ReactNode } from 'react'

import { CommunityPanelHeader } from '../community/CommunityPanelHeader'

interface Props {
  title: string
  subtitle?: string
  actions?: ReactNode
  /** When false, omit the left title/subtitle header (PM non-stats views). */
  showHeader?: boolean
  children: ReactNode
}

export function ProjectManagerPanelShell({
  title,
  subtitle,
  actions,
  showHeader = true,
  children,
}: Props) {
  return (
    <div
      className={[
        'tm-community-market',
        'tm-community-list-panel',
        showHeader ? '' : 'tm-pm-shell--no-header',
      ]
        .filter(Boolean)
        .join(' ')}>
      {showHeader ? (
        <CommunityPanelHeader title={title} subtitle={subtitle} actions={actions} />
      ) : null}
      <div className="tm-kb-file-panel tm-community-list-panel-body">
        <div className="tm-kb-file-list">{children}</div>
      </div>
    </div>
  )
}
