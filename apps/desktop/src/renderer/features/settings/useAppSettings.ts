import { useCallback, useEffect, useState } from 'react'
import {
  applyDisplaySettings,
  watchSystemTheme,
} from './apply-display-settings'
import {
  DEFAULT_APP_SETTINGS,
  loadAppSettings,
  saveAppSettings,
  type AppSettings,
} from './app-settings'
import { normalizeNavModules } from './nav-modules'
import { syncRuntimeAppSettingsToMain } from './sync-runtime-app-settings'

export function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS)

  useEffect(() => {
    const loaded = loadAppSettings()
    setSettings(loaded)
    applyDisplaySettings(loaded)
    void syncRuntimeAppSettingsToMain(loaded)
  }, [])

  useEffect(() => {
    return watchSystemTheme(() => {
      setSettings((current) => {
        if (current.theme !== 'system') return current
        applyDisplaySettings(current)
        return current
      })
    })
  }, [])

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((prev) => {
      const merged = { ...prev, ...patch }
      const next =
        patch.sidebarVisibleModules != null || patch.sidebarHiddenModules != null
          ? {
              ...merged,
              ...normalizeNavModules(merged.sidebarVisibleModules, merged.sidebarHiddenModules),
            }
          : merged
      saveAppSettings(next)
      applyDisplaySettings(next)
      void syncRuntimeAppSettingsToMain(next)
      return next
    })
  }, [])

  return { settings, updateSettings }
}
