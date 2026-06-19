import { useCallback, useState } from 'react'
import {
  DEFAULT_MESSAGE_SETTINGS,
  loadMessageSettings,
  saveMessageSettings,
  type MessageSettings,
} from './message-settings'

export function useMessageSettings() {
  const [settings, setSettings] = useState<MessageSettings>(() => loadMessageSettings())

  const updateSettings = useCallback((patch: Partial<MessageSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch }
      saveMessageSettings(next)
      return next
    })
  }, [])

  const resetSettings = useCallback(() => {
    setSettings({ ...DEFAULT_MESSAGE_SETTINGS })
    saveMessageSettings(DEFAULT_MESSAGE_SETTINGS)
  }, [])

  return { settings, updateSettings, resetSettings }
}
