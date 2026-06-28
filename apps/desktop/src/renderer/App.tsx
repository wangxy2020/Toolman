import { useAppSettings } from './features/settings/useAppSettings'
import type { AppSettings } from './features/settings/app-settings'
import { I18nProvider } from './i18n/I18nProvider'
import { useI18n } from './i18n/useI18n'
import { ChatPage } from './features/chat/ChatPage'
import { ErrorBoundary } from './components/ErrorBoundary'
import { useP2pTrustPrompt } from './features/group/useP2pTrustPrompt'
import { GroupTrustDeviceModal } from './features/group/GroupTrustDeviceModal'
import { FirstRunWelcomeModal } from './features/onboarding/FirstRunWelcomeModal'

function AppShell({
  appSettings,
  updateAppSettings,
}: {
  appSettings: AppSettings
  updateAppSettings: (patch: Partial<AppSettings>) => void
}) {
  const { t } = useI18n()
  const p2pTrust = useP2pTrustPrompt()

  return (
    <ErrorBoundary title={t('errors.app')}>
      <ChatPage appSettings={appSettings} updateAppSettings={updateAppSettings} />
      {p2pTrust.prompt ? (
        <GroupTrustDeviceModal
          prompt={p2pTrust.prompt}
          error={p2pTrust.error}
          onTrust={async () => {
            await p2pTrust.respond(true)
          }}
          onReject={async () => {
            await p2pTrust.respond(false)
          }}
        />
      ) : null}
      <FirstRunWelcomeModal />
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
