import type { AppGetDiagnosticsOutput } from '@toolman/shared'
import type { CrashReportUploadStatus } from '@toolman/shared'
import { useI18n } from '../../i18n/useI18n'
import { SettingsCollapsibleSection, SettingsRow, SettingsToggle } from './SettingsShared'

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
      <SettingsRow label={t('settings.diagnostics.operations.logFile')}>
        <span className="tm-settings-static" title={snapshot.operations.logFilePath}>
          {snapshot.operations.logFilePath}
        </span>
      </SettingsRow>
      <SettingsRow label={t('settings.diagnostics.operations.crashReports')}>
        <span
          className="tm-settings-static"
          title={t('settings.diagnostics.operations.crashReportCount', {
            count: snapshot.operations.crashReportCount,
            dir: snapshot.operations.crashReportDir,
          })}
        >
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
          <span className="tm-settings-static" title={snapshot.operations.crashReportIngestUrl}>
            {snapshot.operations.crashReportIngestUrl}
          </span>
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
    </SettingsCollapsibleSection>
  )
}
