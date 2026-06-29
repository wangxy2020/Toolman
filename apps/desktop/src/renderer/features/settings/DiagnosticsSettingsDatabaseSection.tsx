import type { AppGetDiagnosticsOutput } from '@toolman/shared'
import { useI18n } from '../../i18n/useI18n'
import { SettingsRow, SettingsSection } from './SettingsShared'
import { formatBytes, statusBadge } from './diagnostics-settings-utils'

interface Props {
  snapshot: AppGetDiagnosticsOutput
}

export function DiagnosticsSettingsDatabaseSection({ snapshot }: Props) {
  const { t } = useI18n()

  return (
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
    </>
  )
}
