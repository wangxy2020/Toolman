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

function formatLastEventSeq(seq: number): string {
  return seq > 0 ? String(seq) : '0（暂无事件）'
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

export function GroupSettingsModal({
  workspace,
  workspaceName,
  isOwner,
  syncStatus,
  onClose,
  onWorkspaceUpdated,
  onWorkspaceLeft,
}: Props) {
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

  return (
    <div className="tm-modal-overlay" onClick={onClose}>
      <div
        className="tm-modal tm-modal--knowledge-create"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="tm-modal-header">
          <h2 className="tm-modal-title">群组设置</h2>
          <button type="button" className="tm-modal-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </header>

        <div className="tm-modal-body tm-knowledge-settings-body">
          <p className="tm-form-hint">
            {workspaceName} · {workspace.memberCount} 名成员
          </p>

          <section className="tm-knowledge-settings-section">
            <h3 className="tm-knowledge-settings-heading">基本信息</h3>

            <label className="tm-form-field">
              <span className="tm-form-label">群组名称</span>
              <input
                className="tm-form-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="输入群组名称"
                maxLength={100}
                readOnly={!isOwner}
                disabled={!isOwner}
              />
            </label>

            <label className="tm-form-field">
              <span className="tm-form-label">描述</span>
              <textarea
                className="tm-form-textarea"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="简要描述群组用途"
                maxLength={500}
                rows={3}
                readOnly={!isOwner}
                disabled={!isOwner}
              />
            </label>

            {!isOwner ? (
              <p className="tm-form-hint">仅群主可修改群组名称与描述。</p>
            ) : null}
          </section>

          <section className="tm-knowledge-settings-section">
            <div className="tm-knowledge-settings-heading-row">
              <h3 className="tm-knowledge-settings-heading">存储与同步</h3>
              <button
                type="button"
                className="tm-btn tm-btn--ghost tm-btn--sm"
                onClick={() => void syncStatus.onRefresh()}
              >
                刷新状态
              </button>
            </div>

            <div className="tm-knowledge-settings-row">
              <span className="tm-form-label">本地存储路径</span>
              <div className="tm-knowledge-settings-value-row">
                <span className="tm-knowledge-settings-path" title={storagePath ?? undefined}>
                  {storageLoading ? '加载中…' : (storagePath ?? '—')}
                </span>
                <button
                  type="button"
                  className="tm-btn tm-btn--ghost"
                  disabled={!storagePath}
                  onClick={() => void openStoragePath()}
                >
                  打开目录
                </button>
              </div>
            </div>

            <div className="tm-knowledge-settings-row">
              <span className="tm-form-label">同步状态</span>
              <span className="tm-knowledge-settings-value">
                {formatSyncStatus(syncStatus.status)}
              </span>
            </div>

            <div className="tm-knowledge-settings-row">
              <span className="tm-form-label">序号模式</span>
              <span className="tm-knowledge-settings-value">
                {formatSequencingMode(syncStatus.sequencingMode)}
                {!isOwner && !syncStatus.ownerOnline ? '（群主离线）' : ''}
              </span>
            </div>

            <div className="tm-knowledge-settings-row">
              <span className="tm-form-label">最新事件序号</span>
              <span className="tm-knowledge-settings-value">
                {formatLastEventSeq(displayLastEventSeq)}
              </span>
            </div>
            <p className="tm-form-hint">
              本机已知的群组事件最大序号，用于成员间同步与排序；创建群组、分享资源等操作会递增。
            </p>

            <div className="tm-knowledge-settings-row">
              <span className="tm-form-label">上次同步</span>
              <span className="tm-knowledge-settings-value">
                {formatTimestamp(syncStatus.lastSyncAt)}
              </span>
            </div>

            <div className="tm-knowledge-settings-row">
              <span className="tm-form-label">待同步文件</span>
              <span className="tm-knowledge-settings-value">{syncStatus.pendingFiles}</span>
            </div>

            {syncStatus.error ? (
              <p className="tm-form-error" style={{ marginTop: 12 }}>
                {syncStatus.error}
              </p>
            ) : null}

            {syncStatus.peers.length > 0 ? (
              <div style={{ marginTop: 12 }}>
                <p className="tm-knowledge-settings-subheading">对端同步</p>
                <ul className="tm-knowledge-settings-watch-sources">
                  {syncStatus.peers.map((peer) => (
                    <li key={peer.deviceId}>
                      <span>{peer.deviceId.slice(0, 8)}…</span>
                      <span>
                        {formatPeerState(peer.state)} · 已收 {peer.lastReceivedSeq} / 已发{' '}
                        {peer.lastSentSeq}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="tm-form-hint" style={{ marginTop: 12 }}>
                暂无已连接的对端设备。
              </p>
            )}
          </section>

          <section className="tm-knowledge-settings-section">
            <h3 className="tm-knowledge-settings-heading">危险操作</h3>

            {isOwner ? (
              <>
                <p className="tm-form-hint">
                  解散群组后，本地成员记录与密钥将被移除，其他成员将无法继续同步此群组。
                </p>
                <button
                  type="button"
                  className="tm-btn tm-message-delete-confirm-submit"
                  disabled={actionBusy}
                  onClick={() => setConfirmAction('dissolve')}
                >
                  解散群组
                </button>
              </>
            ) : (
              <>
                <p className="tm-form-hint">
                  退出群组后，本设备将不再接收该群组的事件与文件。
                </p>
                <button
                  type="button"
                  className="tm-btn tm-message-delete-confirm-submit"
                  disabled={actionBusy}
                  onClick={() => setConfirmAction('leave')}
                >
                  退出群组
                </button>
              </>
            )}
          </section>
        </div>

        <footer className="tm-modal-footer tm-modal-footer--stacked">
          {error ? (
            <p className="tm-form-error tm-modal-footer-error">{error}</p>
          ) : null}
          <div className="tm-modal-footer-actions">
            <button type="button" className="tm-btn tm-btn--ghost" onClick={onClose} disabled={saving}>
              {isOwner ? '取消' : '关闭'}
            </button>
            {isOwner ? (
              <button
                type="button"
                className="tm-btn tm-btn--primary"
                disabled={!isDirty || saving}
                onClick={() => void handleSave()}
              >
                {saving ? '保存中…' : '保存'}
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
