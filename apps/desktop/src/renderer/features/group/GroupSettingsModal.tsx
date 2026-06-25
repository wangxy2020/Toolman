import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  IpcChannel,
  type P2pReplicationTopology,
  type P2pSequencingMode,
  type P2pSyncPeerStatus,
  type P2pSyncStatus,
  type P2pWorkspace,
} from '@toolman/shared'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { useI18n } from '../../i18n/useI18n'
import {
  formatGroupPeerState,
  formatGroupSequencingMode,
  formatGroupSyncStatus,
  formatReplicationTopologyLabel,
} from '../../i18n/group-sync-labels'
import { translateGroupName } from '../../i18n/system-labels'

interface SyncStatusProps {
  status: P2pSyncStatus
  error: string | null
  sequencingMode: P2pSequencingMode
  ownerOnline: boolean
  replicationTopology: P2pReplicationTopology
  meshPeersConnected: number
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
  const { t } = useI18n()
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
      setError(t('groupPage.settings.nameRequired'))
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
    formatGroupSequencingMode(syncStatus.sequencingMode, t) +
    (!isOwner && !syncStatus.ownerOnline ? t('groupPage.settings.ownerOffline') : '')
  const replicationLabel = formatReplicationTopologyLabel(syncStatus.replicationTopology, t)
  const meshDetail =
    syncStatus.replicationTopology === 'member_mesh'
      ? ` · ${t('groupPage.settings.memberNodes', { count: syncStatus.meshPeersConnected })}`
      : ''
  const tabs: { id: SettingsTab; label: string }[] = [
    { id: 'general', label: t('groupPage.settings.tabs.general') },
    { id: 'storage', label: t('groupPage.settings.tabs.storage') },
    { id: 'danger', label: t('groupPage.settings.tabs.danger') },
  ]

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
              {t('groupPage.settingsTitle')}
            </h3>
            <p className="tm-group-settings-modal-subtitle">
              {workspaceName} · {t('groupPage.settings.memberCount', { count: workspace.memberCount })}
            </p>
          </div>
          <button type="button" className="tm-group-settings-modal-close" aria-label={t('common.close')} onClick={onClose}>
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
          <nav className="tm-group-settings-modal-nav" aria-label={t('groupPage.settingsNavAria')}>
            {tabs.map((tab) => (
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
                <span className="tm-group-settings-section-title">{t('groupPage.settings.generalSection')}</span>

                <div className="tm-group-settings-field">
                  <label className="tm-group-settings-label" htmlFor="group-settings-name">
                    {t('groupPage.settings.groupName')} <span className="tm-group-settings-required">*</span>
                  </label>
                  <input
                    id="group-settings-name"
                    className="tm-group-settings-input"
                    value={translateGroupName(name, t)}
                    onChange={(event) => setName(event.target.value)}
                    placeholder={t('groupPage.settings.namePlaceholder')}
                    maxLength={100}
                    readOnly={!isOwner}
                    disabled={!isOwner}
                  />
                </div>

                <div className="tm-group-settings-field">
                  <label className="tm-group-settings-label" htmlFor="group-settings-description">
                    {t('common.description')}
                  </label>
                  <textarea
                    id="group-settings-description"
                    className="tm-group-settings-textarea"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder={t('groupPage.settings.descriptionPlaceholder')}
                    maxLength={500}
                    rows={3}
                    readOnly={!isOwner}
                    disabled={!isOwner}
                  />
                </div>

                {!isOwner ? (
                  <p className="tm-group-settings-hint">{t('groupPage.settings.ownerHint')}</p>
                ) : null}
              </div>
            ) : null}

            {activeTab === 'storage' ? (
              <div className="tm-group-settings-form">
                <div className="tm-group-settings-section-head">
                  <span className="tm-group-settings-section-title">{t('groupPage.settings.storageSection')}</span>
                  <div className="tm-group-settings-inline-actions">
                    <button
                      type="button"
                      className="tm-group-settings-inline-btn"
                      onClick={() => void syncStatus.onRefresh()}
                    >
                      {t('groupPage.settings.refreshStatus')}
                    </button>
                    <button
                      type="button"
                      className="tm-group-settings-inline-btn"
                      disabled={!storagePath}
                      onClick={() => void openStoragePath()}
                    >
                      {t('groupPage.settings.openDir')}
                    </button>
                  </div>
                </div>

                <div className="tm-group-settings-field">
                  <span className="tm-group-settings-label">{t('groupPage.settings.localPath')}</span>
                  <div
                    className="tm-group-settings-path-box"
                    title={storagePath ?? undefined}
                  >
                    {storageLoading ? t('common.loading') : (storagePath ?? '—')}
                  </div>
                </div>

                <div className="tm-group-settings-stat-grid">
                  <div className="tm-group-settings-stat-card">
                    <span className="tm-group-settings-stat-label">{t('groupPage.settings.syncStatus')}</span>
                    <span className="tm-group-settings-stat-value">
                      <span className={syncStatusDotClass(syncStatus.status)} aria-hidden="true" />
                      {formatGroupSyncStatus(syncStatus.status, t)}
                    </span>
                  </div>
                  <div className="tm-group-settings-stat-card">
                    <span className="tm-group-settings-stat-label">{t('groupPage.settings.sequencingMode')}</span>
                    <span className="tm-group-settings-stat-value">{sequencingLabel}</span>
                  </div>
                  <div className="tm-group-settings-stat-card">
                    <span className="tm-group-settings-stat-label">{t('groupPage.settings.replicationTopology')}</span>
                    <span className="tm-group-settings-stat-value">
                      {replicationLabel}
                      {meshDetail}
                    </span>
                  </div>
                  <div className="tm-group-settings-stat-card">
                    <span className="tm-group-settings-stat-label">{t('groupPage.settings.lastEventSeq')}</span>
                    <span className="tm-group-settings-stat-value tm-group-settings-stat-value--mono">
                      {displayLastEventSeq}
                    </span>
                  </div>
                  <div className="tm-group-settings-stat-card">
                    <span className="tm-group-settings-stat-label">{t('groupPage.settings.lastSyncTime')}</span>
                    <span className="tm-group-settings-stat-value tm-group-settings-stat-value--mono tm-group-settings-stat-value--muted">
                      {formatTimestamp(syncStatus.lastSyncAt)}
                    </span>
                  </div>
                  <div className="tm-group-settings-stat-card">
                    <span className="tm-group-settings-stat-label">{t('groupPage.settings.pendingFiles')}</span>
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

                <p className="tm-group-settings-callout">{t('groupPage.settings.eventSeqCallout')}</p>

                {syncStatus.peers.length > 0 ? (
                  <div className="tm-group-settings-peers">
                    <span className="tm-group-settings-section-title">{t('groupPage.settings.peerSync')}</span>
                    <ul className="tm-group-settings-peer-list">
                      {syncStatus.peers.map((peer) => (
                        <li key={peer.deviceId} className="tm-group-settings-peer-item">
                          <span className="tm-group-settings-peer-id">{peer.deviceId.slice(0, 8)}…</span>
                          <span className="tm-group-settings-peer-meta">
                            {formatGroupPeerState(peer.state, t)} ·{' '}
                            {t('groupPage.settings.peerReceivedSent', {
                              received: peer.lastReceivedSeq,
                              sent: peer.lastSentSeq,
                            })}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="tm-group-settings-hint">{t('groupPage.settings.noPeers')}</p>
                )}
              </div>
            ) : null}

            {activeTab === 'danger' ? (
              <div className="tm-group-settings-form">
                <span className="tm-group-settings-section-title">{t('groupPage.settings.dangerSection')}</span>

                <div className="tm-group-settings-danger-card">
                  {isOwner ? (
                    <>
                      <p className="tm-group-settings-hint">{t('groupPage.settings.dissolveHint')}</p>
                      <button
                        type="button"
                        className="tm-group-settings-danger-btn"
                        disabled={actionBusy}
                        onClick={() => setConfirmAction('dissolve')}
                      >
                        {t('groupPage.settings.dissolveBtn')}
                      </button>
                    </>
                  ) : (
                    <>
                      <p className="tm-group-settings-hint">{t('groupPage.settings.leaveHint')}</p>
                      <button
                        type="button"
                        className="tm-group-settings-danger-btn"
                        disabled={actionBusy}
                        onClick={() => setConfirmAction('leave')}
                      >
                        {t('groupPage.settings.leaveBtn')}
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
              {isOwner ? t('common.cancel') : t('common.close')}
            </button>
            {isOwner ? (
              <button
                type="button"
                className="tm-group-settings-modal-footer-btn tm-group-settings-modal-footer-btn--primary"
                disabled={!isDirty || saving}
                onClick={() => void handleSave()}
              >
                {saving ? t('common.loading') : t('knowledgePage.settings.saveConfig')}
              </button>
            ) : null}
          </div>
        </footer>
      </div>

      {confirmAction === 'leave' ? (
        <ConfirmDialog
          title={t('groupPage.settings.leaveTitle')}
          message={t('groupPage.settings.leaveConfirm', { name: workspaceName })}
          confirmLabel={t('groupPage.settings.leaveTitle')}
          danger
          onCancel={() => setConfirmAction(null)}
          onConfirm={() => void handleLeave()}
        />
      ) : null}

      {confirmAction === 'dissolve' ? (
        <ConfirmDialog
          title={t('groupPage.settings.dissolveTitle')}
          message={t('groupPage.settings.dissolveConfirm', { name: workspaceName })}
          confirmLabel={t('groupPage.settings.dissolveTitle')}
          danger
          onCancel={() => setConfirmAction(null)}
          onConfirm={() => void handleDissolve()}
        />
      ) : null}
    </div>
  )
}
