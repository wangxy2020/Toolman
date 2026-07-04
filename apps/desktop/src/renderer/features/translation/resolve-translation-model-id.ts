import type { Provider } from '@toolman/shared'
import { buildModelOptions, isModelIdAvailable } from '../chat/model-utils'

/** Preferred translation models, in order. */
export const TRANSLATION_PREFERRED_MODEL_NAMES = ['gemma4:latest', 'qwen3.5:9b'] as const

/** Pick gemma4:latest, then qwen3.5:9b, then the first available chat model. */
export function pickPreferredTranslationModelId(providers: Provider[]): string | null {
  for (const modelName of TRANSLATION_PREFERRED_MODEL_NAMES) {
    for (const provider of providers) {
      const modelId = `${provider.id}:${modelName}`
      if (isModelIdAvailable(modelId, providers)) return modelId
    }
  }

  const first = buildModelOptions(providers).find((option) =>
    isModelIdAvailable(option.modelId, providers),
  )
  return first?.modelId ?? null
}

/**
 * Resolve model for translation.
 * - Explicit settings.modelId wins when still available.
 * - Otherwise prefer gemma4:latest, then qwen3.5:9b, then any available model.
 */
export function resolveTranslationModelId(options: {
  settingsModelId: string | null
  providers: Provider[]
}): string | null {
  const explicit = options.settingsModelId?.trim() || null
  if (explicit && isModelIdAvailable(explicit, options.providers)) {
    return explicit
  }
  return pickPreferredTranslationModelId(options.providers)
}
