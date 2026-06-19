export interface RuntimeAppSettings {
  documentOcrEnabled: boolean
}

const DEFAULT_RUNTIME_APP_SETTINGS: RuntimeAppSettings = {
  documentOcrEnabled: true,
}

let runtimeSettings: RuntimeAppSettings = { ...DEFAULT_RUNTIME_APP_SETTINGS }

export function syncRuntimeAppSettings(patch: Partial<RuntimeAppSettings>): RuntimeAppSettings {
  runtimeSettings = { ...runtimeSettings, ...patch }
  return runtimeSettings
}

export function getRuntimeAppSettings(): RuntimeAppSettings {
  return runtimeSettings
}

export function isDocumentOcrEnabled(): boolean {
  return runtimeSettings.documentOcrEnabled
}
