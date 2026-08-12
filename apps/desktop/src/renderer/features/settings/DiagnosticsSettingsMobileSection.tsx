import type { AppGetDiagnosticsOutput } from '@toolman/shared'
import { useI18n } from '../../i18n/useI18n'
import { SettingsCollapsibleSection, SettingsRow, SettingsToggle } from './SettingsShared'
import { statusBadge } from './diagnostics-settings-utils'

interface Props {
  snapshot: AppGetDiagnosticsOutput
  syncToggling: boolean
  hostToggling: boolean
  loading: boolean
  onSyncToggle: (enabled: boolean) => void
  onHostToggle: (enabled: boolean) => void
}

export function DiagnosticsSettingsMobileSection({
  snapshot,
  syncToggling,
  hostToggling,
  loading,
  onSyncToggle,
  onHostToggle,
}: Props) {
  const { t } = useI18n()
  const mobile = snapshot.mobileSync ?? {
    syncEnabled: false,
    agentHostEnabled: false,
    hubRunning: false,
    hubBaseUrl: null,
    lastError: null,
  }

  return (
    <SettingsCollapsibleSection
      title={t('settings.diagnostics.mobileSync.title')}
      defaultCollapsed={false}
    >
      <SettingsRow
        label={t('settings.diagnostics.mobileSync.syncToggle')}
        hint={t('settings.diagnostics.mobileSync.syncToggleHint')}
      >
        <SettingsToggle
          checked={Boolean(mobile.syncEnabled)}
          disabled={syncToggling || loading}
          onChange={onSyncToggle}
        />
      </SettingsRow>
      <SettingsRow
        label={t('settings.diagnostics.mobileSync.hostToggle')}
        hint={t('settings.diagnostics.mobileSync.hostToggleHint')}
      >
        <SettingsToggle
          checked={Boolean(mobile.agentHostEnabled)}
          disabled={hostToggling || loading}
          onChange={onHostToggle}
        />
      </SettingsRow>
      <SettingsRow label={t('settings.diagnostics.mobileSync.hub')}>
        {statusBadge(
          Boolean(mobile.hubRunning),
          t('settings.diagnostics.status.running'),
          t('settings.diagnostics.status.stopped'),
        )}
      </SettingsRow>
      <SettingsRow label={t('settings.diagnostics.mobileSync.baseUrl')}>
        <span className="tm-settings-static">{mobile.hubBaseUrl ?? '—'}</span>
      </SettingsRow>
      {mobile.lastError ? <p className="tm-settings-error">{mobile.lastError}</p> : null}
    </SettingsCollapsibleSection>
  )
}
