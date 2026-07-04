import type { TranslationLanguage } from '@toolman/shared'
import {
  DEFAULT_TRANSLATION_LANGUAGES,
  normalizeTranslationLanguages,
} from '../chat/translation-utils'

export const TRANSLATION_SETTINGS_STORAGE_KEY = 'toolman:translation-settings'

export interface TranslationSettings {
  /**
   * Translation model id (`providerId:modelName`).
   * Null means “not chosen yet”; runtime resolves to gemma4:latest, then qwen3.5:9b.
   */
  modelId: string | null
  languages: [TranslationLanguage, TranslationLanguage]
  /** When true, detect source language from text; otherwise use languages[0] → languages[1]. */
  autoDetectSource: boolean
  /** Persist the active contrast after a successful translation. */
  autoSaveAfterTranslate: boolean
}

export const DEFAULT_TRANSLATION_SETTINGS: TranslationSettings = {
  modelId: null,
  languages: [...DEFAULT_TRANSLATION_LANGUAGES],
  autoDetectSource: true,
  autoSaveAfterTranslate: false,
}

export function normalizeTranslationSettings(
  raw: Partial<TranslationSettings> | null | undefined,
): TranslationSettings {
  const modelId =
    typeof raw?.modelId === 'string' && raw.modelId.trim().length > 0 ? raw.modelId.trim() : null

  return {
    modelId,
    languages: normalizeTranslationLanguages(raw?.languages),
    autoDetectSource: raw?.autoDetectSource !== false,
    autoSaveAfterTranslate: raw?.autoSaveAfterTranslate === true,
  }
}

export function loadTranslationSettings(): TranslationSettings {
  try {
    const raw = localStorage.getItem(TRANSLATION_SETTINGS_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_TRANSLATION_SETTINGS, languages: [...DEFAULT_TRANSLATION_LANGUAGES] }
    return normalizeTranslationSettings(JSON.parse(raw) as Partial<TranslationSettings>)
  } catch {
    return { ...DEFAULT_TRANSLATION_SETTINGS, languages: [...DEFAULT_TRANSLATION_LANGUAGES] }
  }
}

export function saveTranslationSettings(settings: TranslationSettings): void {
  localStorage.setItem(
    TRANSLATION_SETTINGS_STORAGE_KEY,
    JSON.stringify(normalizeTranslationSettings(settings)),
  )
}
