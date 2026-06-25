import { useAppSettings } from './features/settings/useAppSettings'
import type { AppSettings } from './features/settings/app-settings'
import { I18nProvider } from './i18n/I18nProvider'
import { useI18n } from './i18n/useI18n'
import { ChatPage } from './features/chat/ChatPage'
import { ErrorBoundary } from './components/ErrorBoundary'

function AppShell({
  appSettings,
  updateAppSettings,
}: {
  appSettings: AppSettings
  updateAppSettings: (patch: Partial<AppSettings>) => void
}) {
  const { t } = useI18n()

  return (
    <ErrorBoundary title={t('errors.app')}>
      <ChatPage appSettings={appSettings} updateAppSettings={updateAppSettings} />
    </ErrorBoundary>
  )
}

export default function App() {
  const { settings, updateSettings } = useAppSettings()

  return (
    <I18nProvider language={settings.language}>
      <AppShell appSettings={settings} updateAppSettings={updateSettings} />
    </I18nProvider>
  )
}
