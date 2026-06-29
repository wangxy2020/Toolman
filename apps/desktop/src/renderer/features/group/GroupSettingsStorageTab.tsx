import {
  formatGroupPeerState,
  formatGroupSyncStatus,
} from '../../i18n/group-sync-labels'
import { formatSettingsTimestamp, syncStatusDotClass } from './group-settings-modal-utils'
import type { UseGroupSettingsModalResult } from './useGroupSettingsModal'

type GroupSettingsStorageTabProps = Pick<
  UseGroupSettingsModalResult,
  | 't'
  | 'syncStatus'
  | 'storagePath'
  | 'storageLoading'
  | 'openStoragePath'
  | 'displayLastEventSeq'
  | 'sequencingLabel'
  | 'replicationLabel'
  | 'meshDetail'
>

export function GroupSettingsStorageTab({
  t,
  syncStatus,
  storagePath,
  storageLoading,
  openStoragePath,
  displayLastEventSeq,
  sequencingLabel,
  replicationLabel,
  meshDetail,
}: GroupSettingsStorageTabProps) {
  return (
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
        <div className="tm-group-settings-path-box" title={storagePath ?? undefined}>
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
            {formatSettingsTimestamp(syncStatus.lastSyncAt)}
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
  )
}
