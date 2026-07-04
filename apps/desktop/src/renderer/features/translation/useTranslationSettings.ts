import { useCallback, useState } from 'react'
import {
  loadTranslationSettings,
  saveTranslationSettings,
  type TranslationSettings,
} from './translation-settings-storage'

export function useTranslationSettings() {
  const [settings, setSettings] = useState<TranslationSettings>(() => loadTranslationSettings())

  const updateSettings = useCallback((next: TranslationSettings) => {
    const normalized = saveAndNormalize(next)
    setSettings(normalized)
    return normalized
  }, [])

  return { settings, updateSettings }
}

function saveAndNormalize(next: TranslationSettings): TranslationSettings {
  saveTranslationSettings(next)
  return loadTranslationSettings()
}
