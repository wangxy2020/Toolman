import type { AppGetDiagnosticsOutput } from '@toolman/shared'
import { useI18n } from '../../i18n/useI18n'
import { translateP2pWanReadinessReason } from '../../i18n/system-labels'
import { SettingsCollapsibleSection, SettingsRow } from './SettingsShared'
import { statusBadge } from './diagnostics-settings-utils'

interface Props {
  snapshot: AppGetDiagnosticsOutput
}

export function DiagnosticsSettingsP2pSection({ snapshot }: Props) {
  const { t } = useI18n()
  const wanReadinessReason = translateP2pWanReadinessReason(snapshot.p2p.wanReadiness, t)

  return (
    <SettingsCollapsibleSection title={t('settings.diagnostics.p2p.title')}>
      <SettingsRow label={t('settings.diagnostics.p2p.nativeModule')}>
        {statusBadge(
          snapshot.p2p.nativeAvailable,
          t('settings.diagnostics.status.available'),
          t('settings.diagnostics.status.unavailable'),
        )}
      </SettingsRow>
      <SettingsRow label={t('settings.diagnostics.p2p.deviceId')}>
        <span className="tm-settings-static">{snapshot.p2p.deviceId}</span>
      </SettingsRow>
      <SettingsRow label={t('settings.diagnostics.p2p.displayName')}>
        <span className="tm-settings-static">{snapshot.p2p.displayName ?? '—'}</span>
      </SettingsRow>
      <SettingsRow label={t('settings.diagnostics.p2p.lanDiscovery')}>
        {statusBadge(
          snapshot.p2p.discoveryRunning,
          t('settings.diagnostics.status.enabled'),
          t('settings.diagnostics.status.disabled'),
        )}
      </SettingsRow>
      <SettingsRow label={t('settings.diagnostics.p2p.iceTurn')}>
        <span className="tm-settings-static">{snapshot.p2p.iceServersSummary}</span>
      </SettingsRow>
      {!snapshot.p2p.wanReadiness.ready ? (
        <SettingsRow label={t('settings.diagnostics.p2p.wanReady')}>
          <span className="tm-settings-static" style={{ color: 'var(--tm-warning)' }}>
            {wanReadinessReason || t('settings.diagnostics.wan.notConfigured')}
          </span>
        </SettingsRow>
      ) : (
        <SettingsRow label={t('settings.diagnostics.p2p.wanReady')}>
          {statusBadge(
            true,
            t('settings.diagnostics.status.ready'),
            t('settings.diagnostics.status.notReady'),
          )}
        </SettingsRow>
      )}
      <SettingsRow label={t('settings.diagnostics.p2p.wanLanConnections')}>
        <span className="tm-settings-static">
          {t('settings.diagnostics.p2p.wanLanCount', {
            wan: snapshot.p2p.wanConnectedPeers,
            lan: snapshot.p2p.lanConnectedPeers,
          })}
        </span>
      </SettingsRow>
      <SettingsRow label={t('settings.diagnostics.p2p.workspacesConnections')}>
        <span className="tm-settings-static">
          {t('settings.diagnostics.p2p.workspacesCount', {
            workspaces: snapshot.p2p.workspaceCount,
            connections: snapshot.p2p.connectedPeers,
          })}
        </span>
      </SettingsRow>
      {snapshot.p2p.connections.length > 0 ? (
        <div className="tm-diagnostics-connection-list">
          {snapshot.p2p.connections.map((connection) => (
            <div key={connection.peerDeviceId} className="tm-diagnostics-connection-item">
              <span className="tm-diagnostics-connection-id">{connection.peerDeviceId}</span>
              <span className="tm-diagnostics-connection-state">{connection.state}</span>
              {connection.transport ? (
                <span className="tm-diagnostics-connection-mode">{connection.transport}</span>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <p className="tm-settings-row-hint">{t('settings.diagnostics.p2p.noConnections')}</p>
      )}
      {snapshot.p2p.error ? <p className="tm-settings-error">{snapshot.p2p.error}</p> : null}
    </SettingsCollapsibleSection>
  )
}
