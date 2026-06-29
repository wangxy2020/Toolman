import type { AppGetDiagnosticsOutput } from '@toolman/shared'
import type { CrashReportUploadStatus } from '@toolman/shared'
import { useI18n } from '../../i18n/useI18n'
import { SettingsCollapsibleSection, SettingsRow, SettingsToggle } from './SettingsShared'
import { statusBadge } from './diagnostics-settings-utils'

interface Props {
  snapshot: AppGetDiagnosticsOutput
  crashUploadStatus: CrashReportUploadStatus | null
  crashUploading: boolean
  onUploadEnabledChange: (checked: boolean) => void
  onUploadNow: () => void
}

export function DiagnosticsSettingsOperationsSection({
  snapshot,
  crashUploadStatus,
  crashUploading,
  onUploadEnabledChange,
  onUploadNow,
}: Props) {
  const { t } = useI18n()
  const pendingCount =
    crashUploadStatus?.pendingCount ?? snapshot.operations.crashReportPendingUpload

  return (
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
          onChange={onUploadEnabledChange}
        />
      </SettingsRow>
      <SettingsRow label={t('settings.diagnostics.operations.pendingUpload')}>
        <span className="tm-settings-static">
          {t('settings.diagnostics.operations.pendingCount', { count: pendingCount })}
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
          disabled={crashUploading || pendingCount === 0}
          onClick={onUploadNow}
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
  )
}
