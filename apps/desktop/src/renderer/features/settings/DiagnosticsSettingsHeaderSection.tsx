import type { AppGetDiagnosticsOutput } from '@toolman/shared'
import { useI18n } from '../../i18n/useI18n'
import { translateP2pWanReadinessReason } from '../../i18n/system-labels'
import { SettingsSection } from './SettingsShared'
import { formatTime } from './diagnostics-settings-utils'

interface Props {
  snapshot: AppGetDiagnosticsOutput | null
  loading: boolean
  error: string | null
  toggleError: string | null
  restartingLibp2p: boolean
  onRefresh: () => void
  onRestartLibp2p: () => void
}

export function DiagnosticsSettingsHeaderSection({
  snapshot,
  loading,
  error,
  toggleError,
  restartingLibp2p,
  onRefresh,
  onRestartLibp2p,
}: Props) {
  const { t } = useI18n()
  const libp2pTripped = snapshot?.p2p.libp2pRestart.tripped ?? false
  const wanNotReady = snapshot?.p2p.wanReadiness.ready === false
  const wanReadinessReason = snapshot
    ? translateP2pWanReadinessReason(snapshot.p2p.wanReadiness, t)
    : ''

  return (
    <SettingsSection
      title={t('settings.diagnostics.title')}
      intro={t('settings.diagnostics.intro')}
      action={
        <button
          type="button"
          className="tm-btn tm-btn--ghost tm-btn--sm"
          onClick={onRefresh}
          disabled={loading}
        >
          {loading ? t('settings.diagnostics.refreshing') : t('settings.diagnostics.refresh')}
        </button>
      }
    >
      {error ? <p className="tm-settings-error">{error}</p> : null}
      {toggleError ? <p className="tm-settings-error">{toggleError}</p> : null}
      {snapshot && libp2pTripped ? (
        <div className="tm-diagnostics-banner tm-diagnostics-banner--error" role="alert">
          <p>
            {t('settings.diagnostics.libp2p.trippedBanner', {
              attempt: snapshot.p2p.libp2pRestart.attempt,
              reason: snapshot.p2p.libp2pRestart.lastReason
                ? t('settings.diagnostics.libp2p.trippedReason', {
                    reason: snapshot.p2p.libp2pRestart.lastReason,
                  })
                : '',
            })}
          </p>
          <button
            type="button"
            className="tm-btn tm-btn--secondary tm-btn--sm"
            onClick={onRestartLibp2p}
            disabled={restartingLibp2p}
          >
            {restartingLibp2p
              ? t('settings.diagnostics.libp2p.restarting')
              : t('settings.diagnostics.libp2p.restartNetwork')}
          </button>
        </div>
      ) : null}
      {snapshot && wanNotReady ? (
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
  )
}
