import type { AppGetDiagnosticsOutput } from '@toolman/shared'
import { useI18n } from '../../i18n/useI18n'
import { SettingsCollapsibleSection, SettingsRow } from './SettingsShared'
import { formatTime } from './diagnostics-settings-utils'

interface Props {
  snapshot: AppGetDiagnosticsOutput
}

export function DiagnosticsSettingsProvenanceSection({ snapshot }: Props) {
  const { t } = useI18n()

  return (
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
  )
}
