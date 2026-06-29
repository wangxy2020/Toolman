import type { AppGetDiagnosticsOutput } from '@toolman/shared'
import { useI18n } from '../../i18n/useI18n'
import { SettingsCollapsibleSection, SettingsRow } from './SettingsShared'
import { statusBadge } from './diagnostics-settings-utils'

interface Props {
  snapshot: AppGetDiagnosticsOutput
  restartingLibp2p: boolean
  onRestartLibp2p: () => void
}

export function DiagnosticsSettingsLibp2pSection({
  snapshot,
  restartingLibp2p,
  onRestartLibp2p,
}: Props) {
  const { t } = useI18n()

  return (
    <SettingsCollapsibleSection title={t('settings.diagnostics.libp2p.sectionTitle')}>
      {snapshot.p2p.libp2pRestart.tripped ? (
        <div className="tm-diagnostics-banner tm-diagnostics-banner--error tm-diagnostics-banner--inline">
          <p>{t('settings.diagnostics.libp2p.trippedInline')}</p>
          <button
            type="button"
            className="tm-btn tm-btn--secondary tm-btn--sm"
            onClick={onRestartLibp2p}
            disabled={restartingLibp2p}
          >
            {restartingLibp2p
              ? t('settings.diagnostics.libp2p.restarting')
              : t('settings.diagnostics.libp2p.restartInline')}
          </button>
        </div>
      ) : null}
      <SettingsRow label={t('settings.diagnostics.libp2p.restartStatus')}>
        <span className="tm-settings-static">
          {t('settings.diagnostics.libp2p.restartAttempt', {
            attempt: snapshot.p2p.libp2pRestart.attempt,
          })}
          {snapshot.p2p.libp2pRestart.tripped ? t('settings.diagnostics.libp2p.tripped') : ''}
          {snapshot.p2p.libp2pRestart.nextDelayMs != null
            ? t('settings.diagnostics.libp2p.nextDelay', {
                seconds: Math.round(snapshot.p2p.libp2pRestart.nextDelayMs / 1000),
              })
            : ''}
        </span>
      </SettingsRow>
      <SettingsRow label={t('settings.diagnostics.libp2p.nativeModule')}>
        {statusBadge(
          snapshot.p2p.libp2pAvailable,
          t('settings.diagnostics.status.available'),
          t('settings.diagnostics.status.unavailable'),
        )}
      </SettingsRow>
      <SettingsRow label={t('settings.diagnostics.libp2p.runningStatus')}>
        {statusBadge(
          snapshot.p2p.libp2pRunning,
          t('settings.diagnostics.status.running'),
          t('settings.diagnostics.status.stopped'),
        )}
      </SettingsRow>
      <SettingsRow label={t('settings.diagnostics.libp2p.localPeerId')}>
        <span className="tm-settings-static">{snapshot.p2p.libp2pPeerId ?? '—'}</span>
      </SettingsRow>
      <SettingsRow label={t('settings.diagnostics.libp2p.connections')}>
        <span className="tm-settings-static">
          {snapshot.p2p.libp2pPeerCount} / {snapshot.p2p.connectedPeers}
        </span>
      </SettingsRow>
      <SettingsRow label={t('settings.diagnostics.libp2p.dht')}>
        <span className="tm-settings-static">
          {snapshot.p2p.dhtMode ?? '—'} ·{' '}
          {snapshot.p2p.dhtReady == null
            ? '—'
            : snapshot.p2p.dhtReady
              ? t('settings.diagnostics.libp2p.dhtReady')
              : t('settings.diagnostics.libp2p.dhtNotReady')}
        </span>
      </SettingsRow>
      {snapshot.p2p.libp2pPeers.length > 0 ? (
        <div className="tm-diagnostics-connection-list">
          {snapshot.p2p.libp2pPeers.map((peer) => (
            <div key={peer.peerId} className="tm-diagnostics-connection-item">
              <span className="tm-diagnostics-connection-id">{peer.peerId}</span>
              <span className="tm-diagnostics-connection-state">{peer.transport}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="tm-settings-row-hint">{t('settings.diagnostics.libp2p.noPeers')}</p>
      )}
    </SettingsCollapsibleSection>
  )
}
