import type { AppSettings } from '../settings/app-settings'

export interface ChatPageProps {
  appSettings: AppSettings
  updateAppSettings: (patch: Partial<AppSettings>) => void
}
