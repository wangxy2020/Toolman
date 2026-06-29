import { useI18n } from '../../i18n/useI18n'
import { SettingsPageLayout } from './SettingsShared'
import { useDiagnosticsSettings } from './useDiagnosticsSettings'
import { DiagnosticsSettingsHeaderSection } from './DiagnosticsSettingsHeaderSection'
import { DiagnosticsSettingsDatabaseSection } from './DiagnosticsSettingsDatabaseSection'
import { DiagnosticsSettingsCommunitySections } from './DiagnosticsSettingsCommunitySections'
import { DiagnosticsSettingsP2pSection } from './DiagnosticsSettingsP2pSection'
import { DiagnosticsSettingsLibp2pSection } from './DiagnosticsSettingsLibp2pSection'
import { DiagnosticsSettingsProvenanceSection } from './DiagnosticsSettingsProvenanceSection'
import { DiagnosticsSettingsOperationsSection } from './DiagnosticsSettingsOperationsSection'
import { DiagnosticsSettingsEventsSection } from './DiagnosticsSettingsEventsSection'

export function DiagnosticsSettingsPanel() {
  const { t } = useI18n()
  const {
    snapshot,
    loading,
    error,
    yjsToggling,
    cidToggling,
    restartingLibp2p,
    toggleError,
    setToggleError,
    crashUploadStatus,
    crashUploading,
    setCrashUploadEnabled,
    uploadCrashReportsNow,
    refresh,
    setCommunityYjsEnabled,
    setCommunityCidEnabled,
    restartLibp2pNetwork,
  } = useDiagnosticsSettings()

  return (
    <SettingsPageLayout>
      <DiagnosticsSettingsHeaderSection
        snapshot={snapshot}
        loading={loading}
        error={error}
        toggleError={toggleError}
        restartingLibp2p={restartingLibp2p}
        onRefresh={() => void refresh()}
        onRestartLibp2p={() => void restartLibp2pNetwork()}
      />

      {snapshot ? (
        <>
          <DiagnosticsSettingsDatabaseSection snapshot={snapshot} />
          <DiagnosticsSettingsCommunitySections
            snapshot={snapshot}
            yjsToggling={yjsToggling}
            cidToggling={cidToggling}
            loading={loading}
            onYjsToggle={(enabled) => void setCommunityYjsEnabled(enabled)}
            onCidToggle={(enabled) => void setCommunityCidEnabled(enabled)}
          />
          <DiagnosticsSettingsP2pSection snapshot={snapshot} />
          <DiagnosticsSettingsLibp2pSection
            snapshot={snapshot}
            restartingLibp2p={restartingLibp2p}
            onRestartLibp2p={() => void restartLibp2pNetwork()}
          />
          <DiagnosticsSettingsProvenanceSection snapshot={snapshot} />
          <DiagnosticsSettingsOperationsSection
            snapshot={snapshot}
            crashUploadStatus={crashUploadStatus}
            crashUploading={crashUploading}
            onUploadEnabledChange={(checked) => {
              void setCrashUploadEnabled(checked).catch((err) => {
                setToggleError(
                  err instanceof Error
                    ? err.message
                    : t('settings.diagnostics.operations.updateCrashSettingsFailed'),
                )
              })
            }}
            onUploadNow={() => {
              void uploadCrashReportsNow().catch((err) => {
                setToggleError(
                  err instanceof Error
                    ? err.message
                    : t('settings.diagnostics.operations.uploadCrashFailed'),
                )
              })
            }}
          />
          <DiagnosticsSettingsEventsSection snapshot={snapshot} />
        </>
      ) : null}
    </SettingsPageLayout>
  )
}
