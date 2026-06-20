import { useEffect, useState } from 'react'

import { ConfirmDialog } from '../../components/ConfirmDialog'
import { IconPlus, IconRefresh, IconTrash } from '../../components/icons'
import { formatNewsDate } from './community-news-utils'
import {
  CommunityPublishModalError,
  CommunityPublishModalNotice,
  CommunityPublishModalShell,
} from './CommunityPublishModalShell'
import { RssSourceConfigModal, type RssSourceConfigInput } from './RssSourceConfigModal'
import { useCommunityNewsSources } from './useCommunityNewsSources'
import { useCommunityUser } from './useCommunityUser'

interface Props {
  onClose: () => void
  onFetched?: () => void
}

export function NewsSourcesModal({ onClose, onFetched }: Props) {
  const user = useCommunityUser()
  const sources = useCommunityNewsSources(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [sourceToDelete, setSourceToDelete] = useState<{ id: string; title: string } | null>(null)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !sourceToDelete && !showAddForm) onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, sourceToDelete, showAddForm])

  const handleFetch = async (sourceId: string) => {
    await sources.fetchSource(sourceId)
    onFetched?.()
  }

  const handleCreate = async (input: RssSourceConfigInput) => {
    if (!user.profile) {
      sources.setError('请先登录后再添加 RSS 源')
      return
    }

    const interval = input.fetchIntervalMinutes
    if (!Number.isFinite(interval) || interval < 5) {
      sources.setError('拉取间隔至少为 5 分钟')
      return
    }

    try {
      const source = await sources.createSource({
        title: input.title,
        feedUrl: input.feedUrl,
        category: 'general',
        fetchIntervalMinutes: interval,
      })
      setShowAddForm(false)
      await sources.fetchSource(source.id)
      onFetched?.()
    } catch {
      // error handled in hook
    }
  }

  const handleConfirmDelete = async () => {
    if (!sourceToDelete) return
    const sourceId = sourceToDelete.id
    setSourceToDelete(null)
    try {
      await sources.deleteSource(sourceId)
      onFetched?.()
    } catch {
      // error handled in hook
    }
  }

  return (
    <>
      <CommunityPublishModalShell
        title="RSS 源管理"
        ariaLabel="RSS 源管理"
        onClose={onClose}
        footer={
          <div className="tm-community-publish-modal-footer-actions">
            <button
              type="button"
              className="tm-community-publish-modal-footer-btn tm-community-publish-modal-footer-btn--secondary"
              onClick={onClose}
            >
              关闭
            </button>
          </div>
        }
      >
        <p className="tm-community-publish-modal-subtitle">订阅资讯源，手动或定时拉取文章</p>

        {sources.error ? <CommunityPublishModalError message={sources.error} /> : null}
        {sources.success ? <CommunityPublishModalNotice message={sources.success} /> : null}

        <div className="tm-community-news-sources-toolbar">
          <button
            type="button"
            className="tm-community-publish-toolbar-btn tm-community-publish-toolbar-btn--primary"
            disabled={!user.profile || sources.creating}
            onClick={() => setShowAddForm(true)}
          >
            <IconPlus size={14} />
            添加 RSS 源
          </button>
          <button
            type="button"
            className="tm-community-publish-toolbar-btn"
            disabled={sources.loading}
            onClick={() => void sources.load()}
          >
            <IconRefresh size={14} />
            刷新列表
          </button>
        </div>

        {!user.profile ? (
          <p className="tm-community-publish-modal-hint">登录后可添加、删除 RSS 源并手动拉取。</p>
        ) : null}

        {sources.loading && sources.items.length === 0 ? (
          <div className="tm-community-publish-modal-empty">加载 RSS 源中…</div>
        ) : sources.items.length === 0 ? (
          <div className="tm-community-publish-modal-empty">暂无 RSS 源，点击上方按钮添加</div>
        ) : (
          <ul className="tm-community-news-sources-list">
            {sources.items.map((source) => (
              <li key={source.id} className="tm-community-news-source-item">
                <div className="tm-community-news-source-main">
                  <div className="tm-community-news-source-title-row">
                    <span className="tm-community-news-source-title">{source.title}</span>
                    <span
                      className={[
                        'tm-community-news-source-status',
                        source.enabled
                          ? 'tm-community-news-source-status--enabled'
                          : 'tm-community-news-source-status--disabled',
                      ].join(' ')}
                    >
                      {source.enabled ? '启用' : '停用'}
                    </span>
                  </div>
                  <p className="tm-community-news-source-url">{source.feedUrl}</p>
                  <p className="tm-community-news-source-meta">
                    {source.category} · 每 {source.fetchIntervalMinutes} 分钟
                    {source.lastFetchedAt
                      ? ` · 上次拉取 ${formatNewsDate(source.lastFetchedAt)}`
                      : ' · 尚未拉取'}
                  </p>
                  {source.lastError ? (
                    <p className="tm-community-news-source-error">{source.lastError}</p>
                  ) : null}
                </div>
                <div className="tm-community-news-source-actions">
                  <button
                    type="button"
                    className="tm-community-publish-toolbar-btn"
                    disabled={!source.enabled || sources.fetchingId === source.id}
                    onClick={() => void handleFetch(source.id)}
                  >
                    {sources.fetchingId === source.id ? '拉取中…' : '立即拉取'}
                  </button>
                  {user.profile ? (
                    <button
                      type="button"
                      className="tm-community-publish-toolbar-btn tm-community-publish-toolbar-btn--ghost"
                      title="删除"
                      aria-label="删除 RSS 源"
                      disabled={sources.deletingId === source.id}
                      onClick={() => setSourceToDelete({ id: source.id, title: source.title })}
                    >
                      <IconTrash size={14} />
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CommunityPublishModalShell>

      {showAddForm && user.profile ? (
        <RssSourceConfigModal
          creating={sources.creating}
          error={sources.error}
          onClose={() => {
            sources.setError(null)
            setShowAddForm(false)
          }}
          onSave={handleCreate}
        />
      ) : null}

      {sourceToDelete ? (
        <ConfirmDialog
          title="删除 RSS 源"
          message={`确定删除「${sourceToDelete.title}」吗？已拉取的文章不会自动删除。`}
          confirmLabel="删除"
          danger
          onCancel={() => setSourceToDelete(null)}
          onConfirm={() => void handleConfirmDelete()}
        />
      ) : null}
    </>
  )
}
