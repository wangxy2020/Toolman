import { useEffect, useState } from 'react'

import { ConfirmDialog } from '../../components/ConfirmDialog'
import { IconPlus, IconRefresh, IconTrash } from '../../components/icons'
import { formatNewsDate } from './community-news-utils'
import { useCommunityNewsSources } from './useCommunityNewsSources'
import { useCommunityUser } from './useCommunityUser'

interface Props {
  onClose: () => void
  onFetched?: () => void
}

const DEFAULT_FETCH_INTERVAL = 60

export function NewsSourcesModal({ onClose, onFetched }: Props) {
  const user = useCommunityUser()
  const sources = useCommunityNewsSources(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [sourceToDelete, setSourceToDelete] = useState<{ id: string; title: string } | null>(null)
  const [title, setTitle] = useState('')
  const [feedUrl, setFeedUrl] = useState('')
  const [siteUrl, setSiteUrl] = useState('')
  const [category, setCategory] = useState('general')
  const [fetchIntervalMinutes, setFetchIntervalMinutes] = useState(String(DEFAULT_FETCH_INTERVAL))

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !sourceToDelete) onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, sourceToDelete])

  const resetAddForm = () => {
    setTitle('')
    setFeedUrl('')
    setSiteUrl('')
    setCategory('general')
    setFetchIntervalMinutes(String(DEFAULT_FETCH_INTERVAL))
    setShowAddForm(false)
  }

  const handleFetch = async (sourceId: string) => {
    await sources.fetchSource(sourceId)
    onFetched?.()
  }

  const handleCreate = async () => {
    if (!user.profile) {
      sources.setError('请先登录后再添加 RSS 源')
      return
    }

    const trimmedTitle = title.trim()
    const trimmedFeedUrl = feedUrl.trim()
    if (!trimmedTitle || !trimmedFeedUrl) {
      sources.setError('请填写源名称和 Feed 地址')
      return
    }

    const interval = Number.parseInt(fetchIntervalMinutes, 10)
    if (!Number.isFinite(interval) || interval < 5) {
      sources.setError('拉取间隔至少为 5 分钟')
      return
    }

    try {
      const source = await sources.createSource({
        title: trimmedTitle,
        feedUrl: trimmedFeedUrl,
        siteUrl: siteUrl.trim() || undefined,
        category: category.trim() || undefined,
        fetchIntervalMinutes: interval,
      })
      resetAddForm()
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
      <div className="tm-modal-overlay" onClick={onClose}>
        <div
          className="tm-modal tm-modal--news-sources"
          onClick={(event) => event.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label="RSS 源管理"
        >
          <div className="tm-modal-header">
            <div>
              <h2 className="tm-modal-title">RSS 源管理</h2>
              <p className="tm-community-news-sources-subtitle">订阅资讯源，手动或定时拉取文章</p>
            </div>
            <button type="button" className="tm-modal-close" onClick={onClose} aria-label="关闭">
              ×
            </button>
          </div>

          <div className="tm-modal-body tm-community-news-sources-body">
            {sources.error ? <div className="tm-error-bar">{sources.error}</div> : null}
            {sources.success ? (
              <div className="tm-community-market-success">{sources.success}</div>
            ) : null}

            <div className="tm-community-news-sources-toolbar">
              <button
                type="button"
                className="tm-btn tm-btn--primary"
                disabled={!user.profile || sources.creating}
                onClick={() => setShowAddForm((open) => !open)}
              >
                <IconPlus size={14} />
                {showAddForm ? '收起表单' : '添加 RSS 源'}
              </button>
              <button
                type="button"
                className="tm-btn"
                disabled={sources.loading}
                onClick={() => void sources.load()}
              >
                <IconRefresh size={14} />
                刷新列表
              </button>
            </div>

            {!user.profile ? (
              <p className="tm-community-news-sources-hint">登录后可添加、删除 RSS 源并手动拉取。</p>
            ) : null}

            {showAddForm && user.profile ? (
              <section className="tm-community-news-sources-form">
                <div className="tm-community-news-sources-form-grid">
                  <label className="tm-form-field">
                    <span className="tm-form-label">源名称</span>
                    <input
                      className="tm-form-input"
                      value={title}
                      placeholder="例如：Toolman 博客"
                      onChange={(event) => setTitle(event.target.value)}
                    />
                  </label>
                  <label className="tm-form-field">
                    <span className="tm-form-label">分类</span>
                    <input
                      className="tm-form-input"
                      value={category}
                      placeholder="general"
                      onChange={(event) => setCategory(event.target.value)}
                    />
                  </label>
                  <label className="tm-form-field tm-community-news-sources-form-span">
                    <span className="tm-form-label">Feed 地址</span>
                    <input
                      className="tm-form-input"
                      value={feedUrl}
                      placeholder="https://example.com/feed.xml"
                      onChange={(event) => setFeedUrl(event.target.value)}
                    />
                  </label>
                  <label className="tm-form-field tm-community-news-sources-form-span">
                    <span className="tm-form-label">站点地址（可选）</span>
                    <input
                      className="tm-form-input"
                      value={siteUrl}
                      placeholder="https://example.com"
                      onChange={(event) => setSiteUrl(event.target.value)}
                    />
                  </label>
                  <label className="tm-form-field">
                    <span className="tm-form-label">拉取间隔（分钟）</span>
                    <input
                      className="tm-form-input"
                      type="number"
                      min={5}
                      max={1440}
                      value={fetchIntervalMinutes}
                      onChange={(event) => setFetchIntervalMinutes(event.target.value)}
                    />
                  </label>
                </div>
                <div className="tm-community-news-sources-form-actions">
                  <button type="button" className="tm-btn" onClick={resetAddForm} disabled={sources.creating}>
                    取消
                  </button>
                  <button
                    type="button"
                    className="tm-btn tm-btn--primary"
                    disabled={sources.creating || !title.trim() || !feedUrl.trim()}
                    onClick={() => void handleCreate()}
                  >
                    {sources.creating ? '添加中…' : '添加并拉取'}
                  </button>
                </div>
              </section>
            ) : null}

            {sources.loading && sources.items.length === 0 ? (
              <div className="tm-session-empty">加载 RSS 源中…</div>
            ) : sources.items.length === 0 ? (
              <div className="tm-community-market-list-empty">暂无 RSS 源，点击上方按钮添加</div>
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
                        className="tm-btn"
                        disabled={!source.enabled || sources.fetchingId === source.id}
                        onClick={() => void handleFetch(source.id)}
                      >
                        {sources.fetchingId === source.id ? '拉取中…' : '立即拉取'}
                      </button>
                      {user.profile ? (
                        <button
                          type="button"
                          className="tm-btn tm-btn--ghost"
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
          </div>

          <div className="tm-modal-footer">
            <button type="button" className="tm-btn" onClick={onClose}>
              关闭
            </button>
          </div>
        </div>
      </div>

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
