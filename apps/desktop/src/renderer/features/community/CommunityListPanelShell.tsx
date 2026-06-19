import type { ReactNode } from 'react'

import { IconPlus, IconRefresh } from '../../components/icons'

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
  banner?: ReactNode
  error?: ReactNode
  success?: ReactNode
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
  banner,
  error,
  success,
  isEmpty = false,
  emptyHint = '暂无内容',
  children,
}: Props) {
  return (
    <div className="tm-community-market tm-community-list-panel">
      <header className="tm-community-market-header">
        <div>
          <h2 className="tm-community-market-title">{title}</h2>
          <p className="tm-community-market-subtitle">{subtitle}</p>
        </div>
        <div className="tm-community-news-header-actions">
          {showPublish ? (
            <button
              type="button"
              className="tm-btn tm-btn--primary"
              disabled={publishDisabled || !onPublish}
              onClick={onPublish}
            >
              <IconPlus size={14} />
              {publishLabel}
            </button>
          ) : null}
          {headerExtra}
          <button
            type="button"
            className="tm-btn"
            title="刷新"
            aria-label="刷新"
            disabled={loading}
            onClick={onRefresh}
          >
            <IconRefresh size={14} />
          </button>
        </div>
      </header>

      {banner}
      {error}
      {success}

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
