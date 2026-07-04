export interface RuntimeAppSettings {
  documentOcrEnabled: boolean
  defaultDocProcessorProviderId: string | null
  plannerModelId: string | null
}

const DEFAULT_RUNTIME_APP_SETTINGS: RuntimeAppSettings = {
  documentOcrEnabled: true,
  defaultDocProcessorProviderId: null,
  plannerModelId: null,
}

let runtimeSettings: RuntimeAppSettings = { ...DEFAULT_RUNTIME_APP_SETTINGS }

export function syncRuntimeAppSettings(patch: Partial<RuntimeAppSettings>): RuntimeAppSettings {
  runtimeSettings = { ...runtimeSettings, ...patch }
  return runtimeSettings
}

export function getRuntimeAppSettings(): RuntimeAppSettings {
  return { ...runtimeSettings }
}

export function isDocumentOcrEnabled(): boolean {
  return runtimeSettings.documentOcrEnabled
}

export function resolveDefaultDocProcessorProviderIdFromRuntime(): string | null {
  const configured = runtimeSettings.defaultDocProcessorProviderId?.trim()
  return configured || null
}

export function resolvePlannerModelIdFromRuntime(): string | null {
  const configured = runtimeSettings.plannerModelId?.trim()
  return configured || null
}
