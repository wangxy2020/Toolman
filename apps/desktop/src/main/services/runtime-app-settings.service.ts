import type { PdfParserBackend } from '@toolman/shared'
import {
  DEFAULT_ODL_HYBRID_SETTINGS,
  normalizeOdlHybridSettings,
  type OdlHybridSettings,
} from '@toolman/shared'
import type { OdlHybridConfig } from '@toolman/opendataloader'
import { reconcileOdlHybridServer } from './odl-hybrid-server-manager.service'

export interface RuntimeAppSettings {
  documentOcrEnabled: boolean
  pdfParserBackend: PdfParserBackend
  defaultDocProcessorProviderId: string | null
  plannerModelId: string | null
  odlHybrid: OdlHybridSettings
}

const DEFAULT_RUNTIME_APP_SETTINGS: RuntimeAppSettings = {
  documentOcrEnabled: true,
  pdfParserBackend: 'opendataloader',
  defaultDocProcessorProviderId: null,
  plannerModelId: null,
  odlHybrid: { ...DEFAULT_ODL_HYBRID_SETTINGS },
}

let runtimeSettings: RuntimeAppSettings = { ...DEFAULT_RUNTIME_APP_SETTINGS }

export type RuntimeAppSettingsPatch = Omit<Partial<RuntimeAppSettings>, 'odlHybrid'> & {
  odlHybrid?: Partial<OdlHybridSettings>
}

export function syncRuntimeAppSettings(patch: RuntimeAppSettingsPatch): RuntimeAppSettings {
  const prevHybridEnabled = runtimeSettings.odlHybrid.enabled
  const { odlHybrid, ...rest } = patch
  runtimeSettings = {
    ...runtimeSettings,
    ...rest,
    ...(odlHybrid ? { odlHybrid: normalizeOdlHybridSettings(odlHybrid) } : {}),
  }
  if (runtimeSettings.odlHybrid.enabled) {
    void reconcileOdlHybridServer(prevHybridEnabled ? 'settings-updated' : 'settings-enabled')
  } else if (prevHybridEnabled) {
    void reconcileOdlHybridServer('settings-disabled')
  }
  return runtimeSettings
}

export function isDocumentOcrEnabled(): boolean {
  return runtimeSettings.documentOcrEnabled
}

export function resolvePdfParserBackend(): PdfParserBackend {
  return runtimeSettings.pdfParserBackend
}

export function resolveOdlHybridSettings(): OdlHybridSettings {
  return { ...runtimeSettings.odlHybrid }
}

/** Map user settings to ODL convert() hybrid options. */
export function toOdlHybridParseConfig(settings: OdlHybridSettings): OdlHybridConfig {
  return {
    backend: settings.backend,
    url: settings.url,
    mode: settings.mode,
    hancomAiOcrStrategy: settings.hancomAiOcrStrategy,
    timeoutMs: 45 * 60 * 1000,
  }
}

export function resolveDefaultDocProcessorProviderIdFromRuntime(): string | null {
  const configured = runtimeSettings.defaultDocProcessorProviderId?.trim()
  return configured || null
}

export function resolvePlannerModelIdFromRuntime(): string | null {
  const configured = runtimeSettings.plannerModelId?.trim()
  return configured || null
}
