import { useCallback, useEffect, useState } from 'react'

import type { CommunityHubHealthOutput, CommunityHubStatusOutput } from '@toolman/shared'

import { IconRefresh, IconX } from '../../components/icons'
import {
  getCommunityHubHealth,
  getCommunityHubStatus,
} from './community-api.client'
import { notifyCommunityNewsSourcesChanged } from './community-events'
import { NewsSourcesPanel } from './NewsSourcesPanel'

interface Props {
  onClose: () => void
}

type SettingsTab = 'hub' | 'rss'

const SETTINGS_TABS: { id: SettingsTab; label: string }[] = [
  { id: 'hub', label: 'Hub 服务' },
  { id: 'rss', label: '资讯源' },
]

function hubStatusLabel(status: CommunityHubStatusOutput | null): string {
  if (!status) return '加载中…'
  if (status.running) return '运行中'
  if (status.error) return '不可用'
  return '未启动'
}

export function CommunitySettingsModal({ onClose }: Props) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('hub')
  const [hubStatus, setHubStatus] = useState<CommunityHubStatusOutput | null>(null)
  const [hubHealth, setHubHealth] = useState<CommunityHubHealthOutput | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadHub = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const status = await getCommunityHubStatus()
      setHubStatus(status)
      if (status.running) {
        const health = await getCommunityHubHealth()
        setHubHealth(health)
      } else {
        setHubHealth(null)
      }
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : '加载 Hub 状态失败'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadHub()
  }, [loadHub])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="tm-modal-overlay tm-modal-overlay--group-settings" onClick={onClose}>
      <div
        className="tm-group-settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="community-settings-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="tm-group-settings-modal-header">
          <div className="tm-group-settings-modal-heading">
            <h3 id="community-settings-title" className="tm-group-settings-modal-title">
              <span className="tm-group-settings-modal-title-dot" aria-hidden="true" />
              社区设置
            </h3>
            <p className="tm-group-settings-modal-subtitle">本地 Community Hub 与资讯源配置</p>
          </div>
          <button
            type="button"
            className="tm-group-settings-modal-close"
            aria-label="关闭"
            onClick={onClose}
          >
            <IconX size={16} />
          </button>
        </header>

        <div className="tm-group-settings-modal-body">
          <nav className="tm-group-settings-modal-nav" aria-label="社区设置分类">
            {SETTINGS_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={[
                  'tm-group-settings-modal-nav-item',
                  activeTab === tab.id ? 'tm-group-settings-modal-nav-item--active' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          <div className="tm-group-settings-modal-content">
            {error ? <div className="tm-group-settings-error">{error}</div> : null}

            {activeTab === 'hub' ? (
              <div className="tm-group-settings-form">
                <div className="tm-group-settings-field">
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                    }}
                  >
                    <span className="tm-group-settings-section-title">Hub 服务状态</span>
                    <button
                      type="button"
                      className="tm-group-settings-inline-btn"
                      disabled={loading}
                      onClick={() => void loadHub()}
                    >
                      <IconRefresh size={14} className={loading ? 'tm-icon-spin' : undefined} />
                      刷新
                    </button>
                  </div>
                </div>

                <div className="tm-group-settings-field">
                  <span className="tm-group-settings-label">运行状态</span>
                  <span>{hubStatusLabel(hubStatus)}</span>
                </div>
                {hubStatus?.baseUrl ? (
                  <div className="tm-group-settings-field">
                    <span className="tm-group-settings-label">访问地址</span>
                    <span>{hubStatus.baseUrl}</span>
                  </div>
                ) : null}
                {hubStatus?.port ? (
                  <div className="tm-group-settings-field">
                    <span className="tm-group-settings-label">端口</span>
                    <span>{hubStatus.port}</span>
                  </div>
                ) : null}
                {hubHealth?.version ? (
                  <div className="tm-group-settings-field">
                    <span className="tm-group-settings-label">版本</span>
                    <span>{hubHealth.version}</span>
                  </div>
                ) : null}
                {hubHealth?.dataDir ? (
                  <div className="tm-group-settings-field">
                    <span className="tm-group-settings-label">数据目录</span>
                    <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>
                      {hubHealth.dataDir}
                    </span>
                  </div>
                ) : null}
                {hubHealth?.userCount != null ? (
                  <div className="tm-group-settings-field">
                    <span className="tm-group-settings-label">社区用户</span>
                    <span>{hubHealth.userCount}</span>
                  </div>
                ) : null}
                {hubHealth?.resourceCount != null ? (
                  <div className="tm-group-settings-field">
                    <span className="tm-group-settings-label">资源数量</span>
                    <span>{hubHealth.resourceCount}</span>
                  </div>
                ) : null}
                {hubStatus?.error ? (
                  <div className="tm-group-settings-error tm-group-settings-error--inline">
                    {hubStatus.error}
                  </div>
                ) : null}

                <p className="tm-group-settings-hint">
                  社区数据保存在本机 Community Hub（SQLite）。使用{' '}
                  <code>pnpm dev:p2p:a</code> / <code>pnpm dev:p2p:b</code>{' '}
                  双开测试时，两个实例会共享同一 Hub 与数据库，留言与市场内容可互相可见。
                </p>
              </div>
            ) : (
              <NewsSourcesPanel onChanged={() => notifyCommunityNewsSourcesChanged()} embedded />
            )}
          </div>
        </div>

        <footer className="tm-group-settings-modal-footer">
          <div className="tm-group-settings-modal-footer-actions">
            <button
              type="button"
              className="tm-group-settings-modal-footer-btn tm-group-settings-modal-footer-btn--primary"
              onClick={onClose}
            >
              关闭
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
