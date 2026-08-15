import { useEffect, useState } from 'react'
import {
  IpcChannel,
  type AppDiagnosticsMobileSync,
  type AppGetDiagnosticsOutput,
} from '@toolman/shared'
import { useI18n } from '../../i18n/useI18n'
import { safeInvoke } from '../../lib/ipc-client'
import { AgentSettingsToggle } from '../chat/agent-settings-modal-components'

const EMPTY_MOBILE_SYNC: AppDiagnosticsMobileSync = {
  syncEnabled: false,
  agentHostEnabled: false,
  classroomSyncEnabled: false,
  hubRunning: false,
  hubBaseUrl: null,
  advertisedUrls: [],
  lastError: null,
  lanAccessEnabled: false,
}

export function AssistantLibSettingsSyncTab() {
  const { t } = useI18n()
  const [mobile, setMobile] = useState<AppDiagnosticsMobileSync>(EMPTY_MOBILE_SYNC)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = async () => {
    const result = await safeInvoke(IpcChannel.AppGetDiagnostics)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    const snapshot = result.data as AppGetDiagnosticsOutput
    setMobile(snapshot.mobileSync ?? EMPTY_MOBILE_SYNC)
    setError(null)
  }

  useEffect(() => {
    void refresh()
  }, [])

  const handleToggle = async (enabled: boolean) => {
    setBusy(true)
    setError(null)
    const result = await safeInvoke(IpcChannel.ClassroomSyncSetEnabled, { enabled })
    setBusy(false)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    const next = result.data as AppDiagnosticsMobileSync
    setMobile({
      ...EMPTY_MOBILE_SYNC,
      ...next,
    })
  }

  const scopes = [
    t('assistantLibPage.settingsSyncScopeCourses'),
    t('assistantLibPage.settingsSyncScopeTeaching'),
    t('assistantLibPage.settingsSyncScopeSyllabus'),
    t('assistantLibPage.settingsSyncScopeRecords'),
  ]

  const reachable = (mobile.advertisedUrls ?? []).filter(
    (url) => url && !url.includes('127.0.0.1'),
  )

  return (
    <div className="tm-kb-settings-form tm-alib-settings-sync-form">
      <p className="tm-kb-settings-hint">{t('assistantLibPage.settingsSyncHint')}</p>

      <div className="tm-kb-settings-row">
        <span className="tm-kb-settings-label">{t('assistantLibPage.settingsSyncToggle')}</span>
        <div className="tm-alib-settings-sync-toggle">
          <AgentSettingsToggle
            checked={mobile.classroomSyncEnabled}
            onChange={(checked) => {
              if (!busy) void handleToggle(checked)
            }}
          />
          <span className="tm-kb-settings-hint">
            {t('assistantLibPage.settingsSyncToggleHint')}
          </span>
        </div>
      </div>

      <div className="tm-kb-settings-row">
        <span className="tm-kb-settings-label">{t('assistantLibPage.settingsSyncScopes')}</span>
        <ul className="tm-alib-settings-sync-scopes">
          {scopes.map((label) => (
            <li key={label}>{label}</li>
          ))}
        </ul>
      </div>

      <div className="tm-kb-settings-row">
        <span className="tm-kb-settings-label">{t('assistantLibPage.settingsSyncHub')}</span>
        <span className="tm-kb-settings-hint">
          {mobile.hubRunning
            ? t('assistantLibPage.settingsSyncHubRunning', {
                url: mobile.hubBaseUrl ?? '—',
              })
            : t('assistantLibPage.settingsSyncHubStopped')}
        </span>
      </div>

      {reachable.length > 0 ? (
        <div className="tm-kb-settings-row">
          <span className="tm-kb-settings-label">{t('assistantLibPage.settingsSyncReachable')}</span>
          <ul className="tm-alib-settings-sync-scopes">
            {reachable.map((url) => (
              <li key={url}>{url}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {error || mobile.lastError ? (
        <p className="tm-kb-settings-hint tm-pm-project-info-error">
          {error ?? mobile.lastError}
        </p>
      ) : null}
    </div>
  )
}
