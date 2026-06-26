import { useCallback, useEffect, useState } from 'react'
import { IpcChannel, type AppGetDiagnosticsOutput } from '@toolman/shared'
import { useI18n } from '../../i18n/useI18n'
import { translateP2pWanReadinessReason } from '../../i18n/system-labels'
import {
  SettingsPageLayout,
  SettingsRow,
  SettingsSection,
  SettingsCollapsibleSection,
  SettingsToggle,
} from './SettingsShared'
import { useCrashReportUpload } from './useCrashReportUpload'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString()
}

function statusBadge(ok: boolean | null | undefined, okLabel: string, badLabel: string) {
  if (ok == null) return <span className="tm-settings-static">—</span>
  return (
    <span className={ok ? 'tm-diagnostics-badge tm-diagnostics-badge--ok' : 'tm-diagnostics-badge tm-diagnostics-badge--bad'}>
      {ok ? okLabel : badLabel}
    </span>
  )
}

export function DiagnosticsSettingsPanel() {
  const { t } = useI18n()
  const [snapshot, setSnapshot] = useState<AppGetDiagnosticsOutput | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [yjsToggling, setYjsToggling] = useState(false)
  const [cidToggling, setCidToggling] = useState(false)
  const [restartingLibp2p, setRestartingLibp2p] = useState(false)
  const [toggleError, setToggleError] = useState<string | null>(null)
  const {
    status: crashUploadStatus,
    uploading: crashUploading,
    setUploadEnabled: setCrashUploadEnabled,
    uploadNow: uploadCrashReportsNow,
    refresh: refreshCrashUploadStatus,
  } = useCrashReportUpload()

  const refresh = useCallback(async () => {
    setLoading(true)
    const result = await window.api.invoke(IpcChannel.AppGetDiagnostics)
    setLoading(false)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    setSnapshot(result.data as AppGetDiagnosticsOutput)
    setError(null)
    await refreshCrashUploadStatus().catch(() => undefined)
  }, [refreshCrashUploadStatus])

  useEffect(() => {
    void refresh()
    void window.api.invoke(IpcChannel.AppProvenanceBeacon, { event: 'app.diagnostics.view' })
  }, [refresh])

  const setCommunityYjsEnabled = async (enabled: boolean) => {
    setYjsToggling(true)
    setToggleError(null)
    const result = await window.api.invoke(IpcChannel.CommunityYjsSetEnabled, { enabled })
    setYjsToggling(false)
    if (!result.ok) {
      setToggleError(result.error.message)
      return
    }
    await refresh()
  }

  const setCommunityCidEnabled = async (enabled: boolean) => {
    setCidToggling(true)
    setToggleError(null)
    const result = await window.api.invoke(IpcChannel.CommunityCidSetEnabled, { enabled })
    setCidToggling(false)
    if (!result.ok) {
      setToggleError(result.error.message)
      return
    }
    await refresh()
  }

  const restartLibp2pNetwork = async () => {
    setRestartingLibp2p(true)
    setToggleError(null)
    const result = await window.api.invoke(IpcChannel.P2pNetworkRestartLibp2p)
    setRestartingLibp2p(false)
    if (!result.ok) {
      setToggleError(result.error.message)
      return
    }
    await refresh()
  }

  const libp2pTripped = snapshot?.p2p.libp2pRestart.tripped ?? false
  const wanNotReady = snapshot?.p2p.wanReadiness.ready === false
  const wanReadinessReason = snapshot
    ? translateP2pWanReadinessReason(snapshot.p2p.wanReadiness, t)
    : ''

  return (
    <SettingsPageLayout>
      <SettingsSection
        title={t('settings.diagnostics.title')}
        intro={t('settings.diagnostics.intro')}
        action={
          <button
            type="button"
            className="tm-btn tm-btn--ghost tm-btn--sm"
            onClick={() => void refresh()}
            disabled={loading}
          >
            {loading ? t('settings.diagnostics.refreshing') : t('settings.diagnostics.refresh')}
          </button>
        }
      >
        {error ? <p className="tm-settings-error">{error}</p> : null}
        {toggleError ? <p className="tm-settings-error">{toggleError}</p> : null}
        {libp2pTripped ? (
          <div className="tm-diagnostics-banner tm-diagnostics-banner--error" role="alert">
            <p>
              {t('settings.diagnostics.libp2p.trippedBanner', {
                attempt: snapshot?.p2p.libp2pRestart.attempt ?? 0,
                reason: snapshot?.p2p.libp2pRestart.lastReason
                  ? t('settings.diagnostics.libp2p.trippedReason', {
                      reason: snapshot.p2p.libp2pRestart.lastReason,
                    })
                  : '',
              })}
            </p>
            <button
              type="button"
              className="tm-btn tm-btn--secondary tm-btn--sm"
              onClick={() => void restartLibp2pNetwork()}
              disabled={restartingLibp2p}
            >
              {restartingLibp2p
                ? t('settings.diagnostics.libp2p.restarting')
                : t('settings.diagnostics.libp2p.restartNetwork')}
            </button>
          </div>
        ) : null}
        {wanNotReady ? (
          <div className="tm-diagnostics-banner tm-diagnostics-banner--warn" role="status">
            <p>
              {t('settings.diagnostics.wan.notReadyBanner', {
                reason: wanReadinessReason || t('settings.diagnostics.wan.defaultReason'),
              })}
            </p>
          </div>
        ) : null}
        {snapshot ? (
          <p className="tm-settings-row-hint">
            {t('settings.diagnostics.collectedAt', { time: formatTime(snapshot.collectedAt) })}
          </p>
        ) : null}
      </SettingsSection>

      {snapshot ? (
        <>
          <SettingsSection title={t('settings.diagnostics.database.title')}>
            <SettingsRow label={t('settings.diagnostics.database.sqlitePath')}>
              <span className="tm-settings-static">{snapshot.database.path}</span>
            </SettingsRow>
            <SettingsRow label={t('settings.diagnostics.database.size')}>
              <span className="tm-settings-static">{formatBytes(snapshot.database.sizeBytes)}</span>
            </SettingsRow>
            <SettingsRow
              label={t('settings.diagnostics.database.streamingMessages')}
              hint={t('settings.diagnostics.database.streamingMessagesHint')}
            >
              <span className="tm-settings-static">{snapshot.database.streamingMessageCount}</span>
            </SettingsRow>
          </SettingsSection>

          <SettingsSection title={t('settings.diagnostics.ingest.title')}>
            <SettingsRow label={t('settings.diagnostics.ingest.pendingJobs')}>
              <span className="tm-settings-static">{snapshot.ingest.pendingJobs}</span>
            </SettingsRow>
            <SettingsRow label={t('settings.diagnostics.ingest.failedJobs')}>
              {statusBadge(
                snapshot.ingest.failedJobs === 0,
                t('settings.diagnostics.ingest.noFailures'),
                t('settings.diagnostics.ingest.failureCount', { count: snapshot.ingest.failedJobs }),
              )}
            </SettingsRow>
          </SettingsSection>

          <SettingsSection title={t('settings.diagnostics.hub.title')}>
            <SettingsRow label={t('settings.diagnostics.hub.sidecar')}>
              {statusBadge(
                snapshot.communityHub.running,
                t('settings.diagnostics.status.running'),
                t('settings.diagnostics.status.stopped'),
              )}
            </SettingsRow>
            <SettingsRow label={t('settings.diagnostics.hub.baseUrl')}>
              <span className="tm-settings-static">{snapshot.communityHub.baseUrl ?? '—'}</span>
            </SettingsRow>
            <SettingsRow label={t('settings.diagnostics.hub.healthCheck')}>
              {statusBadge(
                snapshot.communityHub.healthStatus === 'healthy',
                snapshot.communityHub.healthStatus ?? t('settings.diagnostics.hub.notChecked'),
                snapshot.communityHub.healthStatus ?? t('settings.diagnostics.hub.abnormal'),
              )}
            </SettingsRow>
            <SettingsRow label={t('settings.diagnostics.hub.version')}>
              <span className="tm-settings-static">{snapshot.communityHub.version ?? '—'}</span>
            </SettingsRow>
            <SettingsRow label={t('settings.diagnostics.hub.resourcesUsers')}>
              <span className="tm-settings-static">
                {snapshot.communityHub.resourceCount != null
                  ? t('settings.diagnostics.hub.resourceCount', {
                      count: snapshot.communityHub.resourceCount,
                    })
                  : '—'}{' '}
                ·{' '}
                {snapshot.communityHub.userCount != null
                  ? t('settings.diagnostics.hub.userCount', { count: snapshot.communityHub.userCount })
                  : '—'}
              </span>
            </SettingsRow>
            {snapshot.communityHub.error ? (
              <p className="tm-settings-error">{snapshot.communityHub.error}</p>
            ) : null}
          </SettingsSection>

          <SettingsCollapsibleSection title={t('settings.diagnostics.yjs.title')} debugOnly>
            <SettingsRow
              label={t('settings.diagnostics.yjs.featureToggle')}
              hint={t('settings.diagnostics.yjs.featureToggleHint')}
            >
              <SettingsToggle
                checked={snapshot.communityYjs.enabled}
                disabled={yjsToggling || loading}
                onChange={(enabled) => void setCommunityYjsEnabled(enabled)}
              />
            </SettingsRow>
            <SettingsRow label={t('settings.diagnostics.yjs.provider')}>
              {statusBadge(
                snapshot.communityYjs.running,
                t('settings.diagnostics.status.running'),
                t('settings.diagnostics.status.stopped'),
              )}
            </SettingsRow>
            <SettingsRow label={t('settings.diagnostics.yjs.localDid')}>
              <span className="tm-settings-static">{snapshot.communityYjs.localDid ?? '—'}</span>
            </SettingsRow>
            <SettingsRow label={t('settings.diagnostics.yjs.signingPolicy')}>
              <span className="tm-settings-static">
                {snapshot.communityYjs.requireSignedUpdates
                  ? t('settings.diagnostics.yjs.signedOnly')
                  : t('settings.diagnostics.yjs.allowUnsigned')}
              </span>
            </SettingsRow>
            <SettingsRow label={t('settings.diagnostics.yjs.verifyStats')}>
              <span className="tm-settings-static">
                {t('settings.diagnostics.yjs.acceptedSigned', {
                  count: snapshot.communityYjs.acceptedSignedUpdates,
                })}{' '}
                ·{' '}
                {t('settings.diagnostics.yjs.rejectedUnsigned', {
                  count: snapshot.communityYjs.rejectedUnsignedUpdates,
                })}{' '}
                ·{' '}
                {t('settings.diagnostics.yjs.verifyFailures', {
                  count: snapshot.communityYjs.verifyFailures,
                })}
              </span>
            </SettingsRow>
            <SettingsRow label={t('settings.diagnostics.yjs.blockedDids')}>
              <span className="tm-settings-static">{snapshot.communityYjs.blockedDidCount}</span>
            </SettingsRow>
            {snapshot.communityYjs.lastError ? (
              <p className="tm-settings-error">{snapshot.communityYjs.lastError}</p>
            ) : null}
          </SettingsCollapsibleSection>

          <SettingsCollapsibleSection title={t('settings.diagnostics.cid.title')} debugOnly>
            <SettingsRow
              label={t('settings.diagnostics.cid.featureToggle')}
              hint={t('settings.diagnostics.cid.featureToggleHint')}
            >
              <SettingsToggle
                checked={snapshot.communityCid.enabled}
                disabled={cidToggling || loading}
                onChange={(enabled) => void setCommunityCidEnabled(enabled)}
              />
            </SettingsRow>
            <SettingsRow label={t('settings.diagnostics.cid.provider')}>
              {statusBadge(
                snapshot.communityCid.running,
                t('settings.diagnostics.status.running'),
                t('settings.diagnostics.status.stopped'),
              )}
            </SettingsRow>
            <SettingsRow label={t('settings.diagnostics.cid.indexed')}>
              <span className="tm-settings-static">
                {t('settings.diagnostics.cid.indexedCount', {
                  packages: snapshot.communityCid.indexedPackages,
                  chunks: snapshot.communityCid.indexedChunks,
                })}
              </span>
            </SettingsRow>
            <SettingsRow label={t('settings.diagnostics.cid.dht')}>
              <span className="tm-settings-static">
                {t('settings.diagnostics.cid.dhtCount', {
                  provides: snapshot.communityCid.dhtProvides,
                  lookups: snapshot.communityCid.dhtProviderLookups,
                })}
              </span>
            </SettingsRow>
            <SettingsRow label={t('settings.diagnostics.cid.fetchVerify')}>
              <span className="tm-settings-static">
                {t('settings.diagnostics.cid.fetchVerifyCount', {
                  fetched: snapshot.communityCid.fetchedPackages,
                  failures: snapshot.communityCid.verifyFailures,
                })}
              </span>
            </SettingsRow>
            {snapshot.communityCid.lastError ? (
              <p className="tm-settings-error">{snapshot.communityCid.lastError}</p>
            ) : null}
          </SettingsCollapsibleSection>

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

          <SettingsCollapsibleSection title={t('settings.diagnostics.libp2p.sectionTitle')}>
            {snapshot.p2p.libp2pRestart.tripped ? (
              <div className="tm-diagnostics-banner tm-diagnostics-banner--error tm-diagnostics-banner--inline">
                <p>{t('settings.diagnostics.libp2p.trippedInline')}</p>
                <button
                  type="button"
                  className="tm-btn tm-btn--secondary tm-btn--sm"
                  onClick={() => void restartLibp2pNetwork()}
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

          <SettingsCollapsibleSection title={t('settings.diagnostics.provenance.title')}>
            <SettingsRow label={t('settings.diagnostics.provenance.copyright')}>
              <span className="tm-settings-static">{snapshot.provenance.copyrightNotice}</span>
            </SettingsRow>
            <SettingsRow label={t('settings.diagnostics.provenance.license')}>
              <span className="tm-settings-static">{snapshot.provenance.license}</span>
            </SettingsRow>
            <SettingsRow label={t('settings.diagnostics.provenance.buildId')}>
              <span className="tm-settings-static">{snapshot.provenance.buildId}</span>
            </SettingsRow>
            <SettingsRow label={t('settings.diagnostics.provenance.buildFingerprint')}>
              <span className="tm-settings-static tm-settings-static--mono">{snapshot.provenance.buildFingerprint}</span>
            </SettingsRow>
            <SettingsRow label={t('settings.diagnostics.provenance.gitCommit')}>
              <span className="tm-settings-static tm-settings-static--mono">
                {snapshot.provenance.gitCommit.slice(0, 12)}
                {snapshot.provenance.gitDirty ? t('settings.diagnostics.provenance.dirty') : ''}
              </span>
            </SettingsRow>
            <SettingsRow label={t('settings.diagnostics.provenance.builtAt')}>
              <span className="tm-settings-static">{formatTime(Date.parse(snapshot.provenance.builtAt))}</span>
            </SettingsRow>
            <SettingsRow label={t('settings.diagnostics.provenance.beaconCount')}>
              <span className="tm-settings-static">{snapshot.provenance.beaconCount}</span>
            </SettingsRow>
          </SettingsCollapsibleSection>

          <SettingsCollapsibleSection title={t('settings.diagnostics.operations.title')}>
            <SettingsRow label={t('settings.diagnostics.operations.appVersion')}>
              <span className="tm-settings-static">{snapshot.operations.appVersion}</span>
            </SettingsRow>
            <SettingsRow label={t('settings.diagnostics.operations.logFile')}>
              <span className="tm-settings-static">{snapshot.operations.logFilePath}</span>
            </SettingsRow>
            <SettingsRow label={t('settings.diagnostics.operations.crashReports')}>
              <span className="tm-settings-static">
                {t('settings.diagnostics.operations.crashReportCount', {
                  count: snapshot.operations.crashReportCount,
                  dir: snapshot.operations.crashReportDir,
                })}
              </span>
            </SettingsRow>
            <SettingsRow
              label={t('settings.diagnostics.operations.uploadCrashReports')}
              hint={t('settings.diagnostics.operations.uploadCrashReportsHint')}
            >
              <SettingsToggle
                checked={crashUploadStatus?.uploadEnabled ?? snapshot.operations.crashReportUploadEnabled}
                disabled={crashUploading}
                onChange={(checked) => {
                  void setCrashUploadEnabled(checked).catch((err) => {
                    setToggleError(
                      err instanceof Error
                        ? err.message
                        : t('settings.diagnostics.operations.updateCrashSettingsFailed'),
                    )
                  })
                }}
              />
            </SettingsRow>
            <SettingsRow label={t('settings.diagnostics.operations.pendingUpload')}>
              <span className="tm-settings-static">
                {t('settings.diagnostics.operations.pendingCount', {
                  count:
                    crashUploadStatus?.pendingCount ?? snapshot.operations.crashReportPendingUpload,
                })}
              </span>
            </SettingsRow>
            {snapshot.operations.crashReportIngestUrl ? (
              <SettingsRow label={t('settings.diagnostics.operations.ingestUrl')}>
                <span className="tm-settings-static">{snapshot.operations.crashReportIngestUrl}</span>
              </SettingsRow>
            ) : null}
            {crashUploadStatus?.lastUploadError ? (
              <p className="tm-settings-row-hint">{crashUploadStatus.lastUploadError}</p>
            ) : null}
            <SettingsRow label={t('settings.diagnostics.operations.uploadNow')}>
              <button
                type="button"
                className="tm-data-btn"
                disabled={
                  crashUploading ||
                  (crashUploadStatus?.pendingCount ?? snapshot.operations.crashReportPendingUpload) === 0
                }
                onClick={() => {
                  void uploadCrashReportsNow().catch((err) => {
                    setToggleError(
                      err instanceof Error
                        ? err.message
                        : t('settings.diagnostics.operations.uploadCrashFailed'),
                    )
                  })
                }}
              >
                {crashUploading
                  ? t('settings.diagnostics.operations.uploading')
                  : t('settings.diagnostics.operations.uploadPending')}
              </button>
            </SettingsRow>
            <SettingsRow label={t('settings.diagnostics.operations.updateChannel')}>
              <span className="tm-settings-static">{snapshot.operations.update.channel}</span>
            </SettingsRow>
            <SettingsRow label={t('settings.diagnostics.operations.latestVersion')}>
              {statusBadge(
                !snapshot.operations.update.updateAvailable,
                snapshot.operations.update.latestVersion ?? snapshot.operations.update.currentVersion,
                t('settings.diagnostics.operations.updateAvailable', {
                  version: snapshot.operations.update.latestVersion ?? '',
                }),
              )}
            </SettingsRow>
            <SettingsRow label={t('settings.diagnostics.operations.manifestPath')}>
              <span className="tm-settings-static">{snapshot.operations.update.manifestPath}</span>
            </SettingsRow>
            {snapshot.operations.update.notes ? (
              <p className="tm-settings-row-hint">{snapshot.operations.update.notes}</p>
            ) : null}
          </SettingsCollapsibleSection>

          {snapshot.recentEvents.length > 0 ? (
            <SettingsCollapsibleSection title={t('settings.diagnostics.events.section')}>
              <ul className="tm-diagnostics-event-list">
                {snapshot.recentEvents.map((event, index) => (
                  <li key={`${event.at}-${index}`} className={`tm-diagnostics-event tm-diagnostics-event--${event.level}`}>
                    <span className="tm-diagnostics-event-time">{formatTime(event.at)}</span>
                    <span className="tm-diagnostics-event-subsystem">{event.subsystem}</span>
                    <span className="tm-diagnostics-event-message">{event.message}</span>
                  </li>
                ))}
              </ul>
            </SettingsCollapsibleSection>
          ) : null}
        </>
      ) : null}
    </SettingsPageLayout>
  )
}
