import type { Provider } from '@toolman/shared'
import { pickDefaultModelId } from '../chat/model-utils'

/** @deprecated Prefer runtime network-first pick; kept for older imports/tests. */
export const TRANSLATION_PREFERRED_MODEL_NAMES = [] as const

/** Prefer configured network chat models, then any available local chat model. */
export function pickPreferredTranslationModelId(providers: Provider[]): string | null {
  return pickDefaultModelId([], providers)
}

/**
 * Resolve model for translation.
 * - Explicit settings.modelId wins when still available.
 * - Otherwise prefer network models, then any available local model.
 */
export function resolveTranslationModelId(options: {
  settingsModelId: string | null
  providers: Provider[]
}): string | null {
  return pickDefaultModelId([], options.providers, undefined, options.settingsModelId)
}
