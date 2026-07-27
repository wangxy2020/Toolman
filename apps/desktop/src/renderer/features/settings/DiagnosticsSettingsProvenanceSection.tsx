import type { AppGetDiagnosticsOutput } from '@toolman/shared'
import { useI18n } from '../../i18n/useI18n'
import { SettingsCollapsibleSection, SettingsRow } from './SettingsShared'
import { formatTime } from './diagnostics-settings-utils'

interface Props {
  snapshot: AppGetDiagnosticsOutput
}

export function DiagnosticsSettingsProvenanceSection({ snapshot }: Props) {
  const { t } = useI18n()
  const { provenance } = snapshot

  return (
    <SettingsCollapsibleSection title={t('settings.diagnostics.provenance.title')}>
      <SettingsRow label={t('settings.diagnostics.provenance.copyright')}>
        <span className="tm-settings-static" title={provenance.copyrightNotice}>
          {provenance.copyrightNotice}
        </span>
      </SettingsRow>
      <SettingsRow label={t('settings.diagnostics.provenance.license')}>
        <span className="tm-settings-static" title={provenance.license}>
          {provenance.license}
        </span>
      </SettingsRow>
      <SettingsRow label={t('settings.diagnostics.provenance.buildId')}>
        <span className="tm-settings-static" title={provenance.buildId}>
          {provenance.buildId}
        </span>
      </SettingsRow>
      <SettingsRow label={t('settings.diagnostics.provenance.buildFingerprint')}>
        <span className="tm-settings-static tm-settings-static--mono" title={provenance.buildFingerprint}>
          {provenance.buildFingerprint}
        </span>
      </SettingsRow>
      <SettingsRow label={t('settings.diagnostics.provenance.gitCommit')}>
        <span
          className="tm-settings-static tm-settings-static--mono"
          title={`${provenance.gitCommit}${provenance.gitDirty ? t('settings.diagnostics.provenance.dirty') : ''}`}
        >
          {provenance.gitCommit.slice(0, 12)}
          {provenance.gitDirty ? t('settings.diagnostics.provenance.dirty') : ''}
        </span>
      </SettingsRow>
      <SettingsRow label={t('settings.diagnostics.provenance.builtAt')}>
        <span className="tm-settings-static">{formatTime(Date.parse(provenance.builtAt))}</span>
      </SettingsRow>
      <SettingsRow label={t('settings.diagnostics.provenance.beaconCount')}>
        <span className="tm-settings-static">{provenance.beaconCount}</span>
      </SettingsRow>
    </SettingsCollapsibleSection>
  )
}
