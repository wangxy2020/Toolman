import { useState } from 'react'
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
  onLanToggle: (enabled: boolean) => void
  onWanToggle: (enabled: boolean) => void
}

export function DiagnosticsSettingsMobileSection({
  snapshot,
  syncToggling,
  hostToggling,
  loading,
  onSyncToggle,
  onHostToggle,
  onLanToggle,
  onWanToggle,
}: Props) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  const mobile = snapshot.mobileSync ?? {
    syncEnabled: false,
    agentHostEnabled: false,
    classroomSyncEnabled: false,
    hubRunning: false,
    hubBaseUrl: null,
    advertisedUrls: [],
    lastError: null,
    lanAccessEnabled: false,
    wanSyncEnabled: false,
  }
  const pairingCode = mobile.personalPairingCode || mobile.hubToken || ''
  const reachable = (mobile.advertisedUrls ?? []).filter(
    (url) => url && !url.includes('127.0.0.1'),
  )
  const busy = syncToggling || loading
  const loopbackOnly =
    Boolean(mobile.syncEnabled) &&
    !mobile.lanAccessEnabled &&
    reachable.length === 0

  const copyPairingCode = async () => {
    if (!pairingCode) return
    try {
      await navigator.clipboard.writeText(pairingCode)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
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
          disabled={busy}
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
      <SettingsRow
        label={t('settings.diagnostics.mobileSync.lanToggle')}
        hint={t('settings.diagnostics.mobileSync.lanToggleHint')}
      >
        <SettingsToggle
          checked={Boolean(mobile.lanAccessEnabled)}
          disabled={busy}
          onChange={onLanToggle}
        />
      </SettingsRow>
      {loopbackOnly ? (
        <p className="tm-settings-error">{t('settings.diagnostics.mobileSync.loopbackOnly')}</p>
      ) : null}
      <SettingsRow
        label={t('settings.diagnostics.mobileSync.devicePairing')}
        hint={t('settings.diagnostics.mobileSync.devicePairingHint')}
      >
        <div className="tm-settings-token-row">
          {pairingCode ? (
            <>
              <span className="tm-settings-static tm-settings-static--mono">{pairingCode}</span>
              <button
                type="button"
                className="tm-btn tm-btn--ghost tm-btn--sm"
                onClick={() => void copyPairingCode()}
              >
                {copied
                  ? t('settings.diagnostics.mobileSync.copiedToken')
                  : t('settings.diagnostics.mobileSync.copyPairing')}
              </button>
            </>
          ) : (
            <span className="tm-settings-token-mask">—</span>
          )}
        </div>
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
      {reachable.length > 0 ? (
        <SettingsRow label={t('settings.diagnostics.mobileSync.reachable')}>
          <span className="tm-settings-static">{reachable.join(' · ')}</span>
        </SettingsRow>
      ) : null}
      <SettingsRow
        label={t('settings.diagnostics.mobileSync.wanToggle')}
        hint={t('settings.diagnostics.mobileSync.wanToggleHint')}
      >
        <SettingsToggle
          checked={Boolean(mobile.wanSyncEnabled)}
          disabled={busy}
          onChange={onWanToggle}
        />
      </SettingsRow>
      {mobile.lastError ? <p className="tm-settings-error">{mobile.lastError}</p> : null}
    </SettingsCollapsibleSection>
  )
}
