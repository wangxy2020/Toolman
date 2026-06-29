import { SettingsPage } from '../settings/SettingsPage'
import type { ChatPageState } from './useChatPage'

export type ChatPageSettingsViewProps = Pick<
  ChatPageState,
  | 'workspaceId'
  | 'settingsSection'
  | 'appSettings'
  | 'updateAppSettings'
  | 'messageSettings'
  | 'updateMessageSettings'
  | 'chat'
>

export function ChatPageSettingsView({
  workspaceId,
  settingsSection,
  appSettings,
  updateAppSettings,
  messageSettings,
  updateMessageSettings,
  chat,
}: ChatPageSettingsViewProps) {
  return (
    <SettingsPage
      workspaceId={workspaceId}
      initialSection={settingsSection}
      appSettings={appSettings}
      onAppSettingsChange={updateAppSettings}
      messageSettings={messageSettings}
      onMessageSettingsChange={updateMessageSettings}
      onProvidersSaved={() => void chat.loadProviders()}
    />
  )
}
