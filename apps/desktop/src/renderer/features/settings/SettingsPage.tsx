import { useEffect, useState } from 'react'
import { ErrorBoundary } from '../../components/ErrorBoundary'
import { useI18n } from '../../i18n/useI18n'
import type { MessageSettings } from '../chat/message-settings'
import type { AppSettings } from './app-settings'
import { SettingsPanelContent } from './SettingsPanelContent'
import {
  DEFAULT_SETTINGS_SECTION,
  SETTINGS_NAV_GROUPS,
  type SettingsSectionId,
} from './settings-nav'

interface Props {
  workspaceId: string | null
  initialSection?: SettingsSectionId
  appSettings: AppSettings
  onAppSettingsChange: (patch: Partial<AppSettings>) => void
  messageSettings: MessageSettings
  onMessageSettingsChange: (patch: Partial<MessageSettings>) => void
  onProvidersSaved?: () => void
}

export function SettingsPage({
  workspaceId,
  initialSection,
  appSettings,
  onAppSettingsChange,
  messageSettings,
  onMessageSettingsChange,
  onProvidersSaved,
}: Props) {
  const { t } = useI18n()
  const [activeSection, setActiveSection] = useState<SettingsSectionId>(
    initialSection ?? DEFAULT_SETTINGS_SECTION,
  )

  useEffect(() => {
    if (initialSection) setActiveSection(initialSection)
  }, [initialSection])

  return (
    <ErrorBoundary title={t('errors.settings')}>
      <div className="tm-settings-page">
        <nav className="tm-settings-nav">
          {SETTINGS_NAV_GROUPS.map((group, groupIndex) => (
            <div key={groupIndex} className="tm-settings-nav-group">
              {groupIndex > 0 && <div className="tm-settings-nav-divider" />}
              {group.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`tm-settings-nav-item ${activeSection === item.id ? 'tm-settings-nav-item--active' : ''}`}
                  onClick={() => setActiveSection(item.id)}
                >
                  {t(`settings.sections.${item.id}`)}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <main className="tm-settings-content">
          <SettingsPanelContent
            section={activeSection}
            workspaceId={workspaceId}
            appSettings={appSettings}
            messageSettings={messageSettings}
            onAppSettingsChange={onAppSettingsChange}
            onMessageSettingsChange={onMessageSettingsChange}
            onProvidersSaved={onProvidersSaved}
          />
        </main>
      </div>
    </ErrorBoundary>
  )
}
