import { z } from 'zod'

export const OdlHybridBackendSchema = z.enum(['docling-fast', 'hancom-ai'])
export type OdlHybridBackend = z.infer<typeof OdlHybridBackendSchema>

export const OdlHybridModeSchema = z.enum(['auto', 'full'])
export type OdlHybridMode = z.infer<typeof OdlHybridModeSchema>

export const OdlHancomAiOcrStrategySchema = z.enum(['off', 'auto', 'force'])
export type OdlHancomAiOcrStrategy = z.infer<typeof OdlHancomAiOcrStrategySchema>

export const OdlHybridSettingsSchema = z.object({
  enabled: z.boolean(),
  backend: OdlHybridBackendSchema,
  url: z.string(),
  mode: OdlHybridModeSchema,
  hancomAiOcrStrategy: OdlHancomAiOcrStrategySchema,
})

export const OdlHybridSettingsPatchSchema = OdlHybridSettingsSchema.partial()

export interface OdlHybridSettings {
  enabled: boolean
  backend: OdlHybridBackend
  url: string
  mode: OdlHybridMode
  hancomAiOcrStrategy: OdlHancomAiOcrStrategy
}

export const DEFAULT_ODL_HYBRID_URL = 'http://localhost:5002'

export const DEFAULT_ODL_HYBRID_SETTINGS: OdlHybridSettings = {
  enabled: false,
  backend: 'docling-fast',
  url: DEFAULT_ODL_HYBRID_URL,
  mode: 'full',
  hancomAiOcrStrategy: 'force',
}

export function normalizeOdlHybridSettings(
  raw?: Partial<OdlHybridSettings> | null,
): OdlHybridSettings {
  if (!raw) return { ...DEFAULT_ODL_HYBRID_SETTINGS }
  return {
    enabled: raw.enabled === true,
    backend: OdlHybridBackendSchema.safeParse(raw.backend).success
      ? (raw.backend as OdlHybridBackend)
      : DEFAULT_ODL_HYBRID_SETTINGS.backend,
    url: typeof raw.url === 'string' && raw.url.trim() ? raw.url.trim() : DEFAULT_ODL_HYBRID_URL,
    mode: OdlHybridModeSchema.safeParse(raw.mode).success
      ? (raw.mode as OdlHybridMode)
      : DEFAULT_ODL_HYBRID_SETTINGS.mode,
    hancomAiOcrStrategy: OdlHancomAiOcrStrategySchema.safeParse(raw.hancomAiOcrStrategy).success
      ? (raw.hancomAiOcrStrategy as OdlHancomAiOcrStrategy)
      : DEFAULT_ODL_HYBRID_SETTINGS.hancomAiOcrStrategy,
  }
}
