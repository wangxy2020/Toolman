import type { ReactNode } from 'react'

import {
  CommunityPanelHeader,
  CommunityPanelPublishButton,
  CommunityPanelRefreshButton,
} from './CommunityPanelHeader'

interface Props {
  title: string
  subtitle: string
  publishLabel: string
  showPublish?: boolean
  loading?: boolean
  onRefresh: () => void
  onPublish?: () => void
  publishDisabled?: boolean
  headerExtra?: ReactNode
  isEmpty?: boolean
  emptyHint?: string
  children: ReactNode
}

export function CommunityListPanelShell({
  title,
  subtitle,
  publishLabel,
  showPublish = true,
  loading = false,
  onRefresh,
  onPublish,
  publishDisabled = false,
  headerExtra,
  isEmpty = false,
  emptyHint = '暂无内容',
  children,
}: Props) {
  return (
    <div className="tm-community-market tm-community-list-panel">
      <CommunityPanelHeader
        title={title}
        subtitle={subtitle}
        actions={
          <>
            {showPublish ? (
              <CommunityPanelPublishButton
                label={publishLabel}
                disabled={publishDisabled}
                onClick={onPublish}
              />
            ) : null}
            {headerExtra}
            <CommunityPanelRefreshButton loading={loading} disabled={loading} onClick={onRefresh} />
          </>
        }
      />

      <div className="tm-kb-file-panel tm-community-list-panel-body">
        {loading && isEmpty ? (
          <div className="tm-kb-file-panel-empty">
            <p>加载中…</p>
          </div>
        ) : isEmpty ? (
          <div className="tm-kb-file-panel-empty">
            <p>{emptyHint}</p>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  )
}
