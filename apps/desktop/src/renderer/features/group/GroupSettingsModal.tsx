import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  IpcChannel,
  type P2pSequencingMode,
  type P2pSyncPeerStatus,
  type P2pSyncStatus,
  type P2pWorkspace,
} from '@toolman/shared'
import { ConfirmDialog } from '../../components/ConfirmDialog'

interface SyncStatusProps {
  status: P2pSyncStatus
  error: string | null
  sequencingMode: P2pSequencingMode
  ownerOnline: boolean
  lastEventSeq: number
  lastSyncAt?: number
  peers: P2pSyncPeerStatus[]
  pendingFiles: number
  onRefresh: () => void
}

interface Props {
  workspace: P2pWorkspace
  workspaceName: string
  isOwner: boolean
  syncStatus: SyncStatusProps
  onClose: () => void
  onWorkspaceUpdated: (workspace: P2pWorkspace) => void
  onWorkspaceLeft: () => void
}

type ConfirmAction = 'leave' | 'dissolve' | null
type SettingsTab = 'general' | 'storage' | 'danger'

const SETTINGS_TABS: { id: SettingsTab; label: string }[] = [
  { id: 'general', label: '基本信息' },
  { id: 'storage', label: '存储与同步' },
  { id: 'danger', label: '危险操作' },
]

function formatSyncStatus(status: P2pSyncStatus): string {
  switch (status) {
    case 'idle':
      return '空闲'
    case 'syncing':
      return '同步中'
    case 'error':
      return '错误'
  }
}

function formatSequencingMode(mode: P2pSequencingMode): string {
  return mode === 'owner_authoritative' ? '群主权威模式' : 'Lamport 降级模式'
}

function formatPeerState(state: P2pSyncPeerStatus['state']): string {
  switch (state) {
    case 'connected':
      return '已连接'
    case 'connecting':
      return '连接中'
    case 'reconnecting':
      return '重连中'
    case 'signaling':
      return '信令交换中'
    case 'idle':
      return '空闲'
    case 'closed':
      return '已关闭'
  }
}

function formatTimestamp(timestamp?: number): string {
  if (!timestamp) return '—'
  return new Date(timestamp).toLocaleString()
}

function syncStatusDotClass(status: P2pSyncStatus): string {
  switch (status) {
    case 'idle':
      return 'tm-group-settings-status-dot tm-group-settings-status-dot--idle'
    case 'syncing':
      return 'tm-group-settings-status-dot tm-group-settings-status-dot--syncing'
    case 'error':
      return 'tm-group-settings-status-dot tm-group-settings-status-dot--error'
  }
}

export function GroupSettingsModal({
  workspace,
  workspaceName,
  isOwner,
  syncStatus,
  onClose,
  onWorkspaceUpdated,
  onWorkspaceLeft,
}: Props) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general')
  const [name, setName] = useState(workspace.name)
  const [description, setDescription] = useState(workspace.description ?? '')
  const [storagePath, setStoragePath] = useState<string | null>(null)
  const [storageLoading, setStorageLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [actionBusy, setActionBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null)

  useEffect(() => {
    setName(workspace.name)
    setDescription(workspace.description ?? '')
  }, [workspace.id, workspace.name, workspace.description])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const loadStoragePath = useCallback(async () => {
    setStorageLoading(true)
    const result = await window.api.invoke(IpcChannel.P2pWorkspaceGetStoragePath, {
      id: workspace.id,
    })
    setStorageLoading(false)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    const data = result.data as { storagePath: string }
    setStoragePath(data.storagePath)
  }, [workspace.id])

  useEffect(() => {
    void loadStoragePath()
  }, [loadStoragePath])

  const isDirty = useMemo(() => {
    const trimmedName = name.trim()
    const trimmedDescription = description.trim()
    return (
      trimmedName !== workspace.name ||
      (trimmedDescription || null) !== (workspace.description ?? null)
    )
  }, [description, name, workspace.description, workspace.name])

  const openStoragePath = async () => {
    if (!storagePath) return
    const result = await window.api.invoke(IpcChannel.AppShellOpenPath, { path: storagePath })
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    const data = result.data as { opened: boolean; error?: string }
    if (!data.opened && data.error) {
      setError(data.error)
    }
  }

  const handleSave = async () => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      setError('群组名称不能为空')
      setActiveTab('general')
      return
    }

    setSaving(true)
    setError(null)

    const result = await window.api.invoke(IpcChannel.P2pWorkspaceUpdate, {
      id: workspace.id,
      name: trimmedName,
      description: description.trim() || null,
    })

    setSaving(false)

    if (!result.ok) {
      setError(result.error.message)
      return
    }

    const data = result.data as { workspace: P2pWorkspace }
    onWorkspaceUpdated(data.workspace)
    onClose()
  }

  const handleLeave = async () => {
    setActionBusy(true)
    setError(null)

    const result = await window.api.invoke(IpcChannel.P2pWorkspaceLeave, { id: workspace.id })

    setActionBusy(false)
    setConfirmAction(null)

    if (!result.ok) {
      setError(result.error.message)
      return
    }

    onWorkspaceLeft()
  }

  const handleDissolve = async () => {
    setActionBusy(true)
    setError(null)

    const result = await window.api.invoke(IpcChannel.P2pWorkspaceDelete, { id: workspace.id })

    setActionBusy(false)
    setConfirmAction(null)

    if (!result.ok) {
      setError(result.error.message)
      return
    }

    onWorkspaceLeft()
  }

  const displayLastEventSeq = Math.max(syncStatus.lastEventSeq, workspace.lastEventSeq)
  const sequencingLabel =
    formatSequencingMode(syncStatus.sequencingMode) +
    (!isOwner && !syncStatus.ownerOnline ? '（群主离线）' : '')

  return (
    <div className="tm-modal-overlay tm-modal-overlay--group-settings" onClick={onClose}>
      <div
        className="tm-group-settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="group-settings-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="tm-group-settings-modal-header">
          <div className="tm-group-settings-modal-heading">
            <h3 id="group-settings-title" className="tm-group-settings-modal-title">
              <span className="tm-group-settings-modal-title-dot" aria-hidden="true" />
              群组设置
            </h3>
            <p className="tm-group-settings-modal-subtitle">
              {workspaceName} · {workspace.memberCount} 名成员
            </p>
          </div>
          <button type="button" className="tm-group-settings-modal-close" aria-label="关闭" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </header>

        <div className="tm-group-settings-modal-body">
          <nav className="tm-group-settings-modal-nav" aria-label="群组设置分类">
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

            {activeTab === 'general' ? (
              <div className="tm-group-settings-form">
                <span className="tm-group-settings-section-title">常规设置</span>

                <div className="tm-group-settings-field">
                  <label className="tm-group-settings-label" htmlFor="group-settings-name">
                    群组名称 <span className="tm-group-settings-required">*</span>
                  </label>
                  <input
                    id="group-settings-name"
                    className="tm-group-settings-input"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="输入群组名称"
                    maxLength={100}
                    readOnly={!isOwner}
                    disabled={!isOwner}
                  />
                </div>

                <div className="tm-group-settings-field">
                  <label className="tm-group-settings-label" htmlFor="group-settings-description">
                    描述
                  </label>
                  <textarea
                    id="group-settings-description"
                    className="tm-group-settings-textarea"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="简要描述群组用途…"
                    maxLength={500}
                    rows={3}
                    readOnly={!isOwner}
                    disabled={!isOwner}
                  />
                </div>

                {!isOwner ? (
                  <p className="tm-group-settings-hint">仅群主可修改群组名称与描述。</p>
                ) : null}
              </div>
            ) : null}

            {activeTab === 'storage' ? (
              <div className="tm-group-settings-form">
                <div className="tm-group-settings-section-head">
                  <span className="tm-group-settings-section-title">数据底座状态</span>
                  <div className="tm-group-settings-inline-actions">
                    <button
                      type="button"
                      className="tm-group-settings-inline-btn"
                      onClick={() => void syncStatus.onRefresh()}
                    >
                      刷新状态
                    </button>
                    <button
                      type="button"
                      className="tm-group-settings-inline-btn"
                      disabled={!storagePath}
                      onClick={() => void openStoragePath()}
                    >
                      打开目录
                    </button>
                  </div>
                </div>

                <div className="tm-group-settings-field">
                  <span className="tm-group-settings-label">本地存储路径</span>
                  <div
                    className="tm-group-settings-path-box"
                    title={storagePath ?? undefined}
                  >
                    {storageLoading ? '加载中…' : (storagePath ?? '—')}
                  </div>
                </div>

                <div className="tm-group-settings-stat-grid">
                  <div className="tm-group-settings-stat-card">
                    <span className="tm-group-settings-stat-label">同步状态</span>
                    <span className="tm-group-settings-stat-value">
                      <span className={syncStatusDotClass(syncStatus.status)} aria-hidden="true" />
                      {formatSyncStatus(syncStatus.status)}
                    </span>
                  </div>
                  <div className="tm-group-settings-stat-card">
                    <span className="tm-group-settings-stat-label">序号模式</span>
                    <span className="tm-group-settings-stat-value">{sequencingLabel}</span>
                  </div>
                  <div className="tm-group-settings-stat-card">
                    <span className="tm-group-settings-stat-label">最新事件序号</span>
                    <span className="tm-group-settings-stat-value tm-group-settings-stat-value--mono">
                      {displayLastEventSeq}
                    </span>
                  </div>
                  <div className="tm-group-settings-stat-card">
                    <span className="tm-group-settings-stat-label">上次同步时间</span>
                    <span className="tm-group-settings-stat-value tm-group-settings-stat-value--mono tm-group-settings-stat-value--muted">
                      {formatTimestamp(syncStatus.lastSyncAt)}
                    </span>
                  </div>
                  <div className="tm-group-settings-stat-card">
                    <span className="tm-group-settings-stat-label">待同步文件</span>
                    <span className="tm-group-settings-stat-value tm-group-settings-stat-value--mono">
                      {syncStatus.pendingFiles}
                    </span>
                  </div>
                </div>

                {syncStatus.error ? (
                  <div className="tm-group-settings-error tm-group-settings-error--inline">
                    {syncStatus.error}
                  </div>
                ) : null}

                <p className="tm-group-settings-callout">
                  本机已知的群组事件最大序号，用于成员间同步与排序；创建群组、分享资源等操作会递增。
                </p>

                {syncStatus.peers.length > 0 ? (
                  <div className="tm-group-settings-peers">
                    <span className="tm-group-settings-section-title">对端同步</span>
                    <ul className="tm-group-settings-peer-list">
                      {syncStatus.peers.map((peer) => (
                        <li key={peer.deviceId} className="tm-group-settings-peer-item">
                          <span className="tm-group-settings-peer-id">{peer.deviceId.slice(0, 8)}…</span>
                          <span className="tm-group-settings-peer-meta">
                            {formatPeerState(peer.state)} · 已收 {peer.lastReceivedSeq} / 已发{' '}
                            {peer.lastSentSeq}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="tm-group-settings-hint">暂无已连接的对端设备。</p>
                )}
              </div>
            ) : null}

            {activeTab === 'danger' ? (
              <div className="tm-group-settings-form">
                <span className="tm-group-settings-section-title">危险操作</span>

                <div className="tm-group-settings-danger-card">
                  {isOwner ? (
                    <>
                      <p className="tm-group-settings-hint">
                        解散群组后，本地成员记录与密钥将被移除，其他成员将无法继续同步此群组。
                      </p>
                      <button
                        type="button"
                        className="tm-group-settings-danger-btn"
                        disabled={actionBusy}
                        onClick={() => setConfirmAction('dissolve')}
                      >
                        解散群组
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="tm-group-settings-hint">
                        退出群组后，本设备将不再接收该群组的事件与文件。
                      </p>
                      <button
                        type="button"
                        className="tm-group-settings-danger-btn"
                        disabled={actionBusy}
                        onClick={() => setConfirmAction('leave')}
                      >
                        退出群组
                      </button>
                    </>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <footer className="tm-group-settings-modal-footer">
          <div className="tm-group-settings-modal-footer-actions">
            <button
              type="button"
              className="tm-group-settings-modal-footer-btn tm-group-settings-modal-footer-btn--secondary"
              onClick={onClose}
              disabled={saving}
            >
              {isOwner ? '取消' : '关闭'}
            </button>
            {isOwner ? (
              <button
                type="button"
                className="tm-group-settings-modal-footer-btn tm-group-settings-modal-footer-btn--primary"
                disabled={!isDirty || saving}
                onClick={() => void handleSave()}
              >
                {saving ? '保存中…' : '保存设置'}
              </button>
            ) : null}
          </div>
        </footer>
      </div>

      {confirmAction === 'leave' ? (
        <ConfirmDialog
          title="退出群组"
          message={`确定要退出「${workspaceName}」吗？退出后需重新通过邀请链接加入。`}
          confirmLabel="退出群组"
          danger
          onCancel={() => setConfirmAction(null)}
          onConfirm={() => void handleLeave()}
        />
      ) : null}

      {confirmAction === 'dissolve' ? (
        <ConfirmDialog
          title="解散群组"
          message={`确定要解散「${workspaceName}」吗？此操作不可撤销，所有成员将失去访问权限。`}
          confirmLabel="解散群组"
          danger
          onCancel={() => setConfirmAction(null)}
          onConfirm={() => void handleDissolve()}
        />
      ) : null}
    </div>
  )
}
