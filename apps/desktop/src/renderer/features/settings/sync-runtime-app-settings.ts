import { IpcChannel } from '@toolman/shared'
import type { AppSettings } from './app-settings'

export async function syncRuntimeAppSettingsToMain(
  settings: Pick<
    AppSettings,
    'documentOcrEnabled' | 'defaultDocProcessorProviderId'
  >,
) {
  try {
    await window.api.invoke(IpcChannel.AppRuntimeSettingsSync, {
      documentOcrEnabled: settings.documentOcrEnabled,
      defaultDocProcessorProviderId: settings.defaultDocProcessorProviderId.trim() || null,
    })
  } catch {
    // non-fatal: ingest falls back to OCR disabled until sync succeeds
  }
}
