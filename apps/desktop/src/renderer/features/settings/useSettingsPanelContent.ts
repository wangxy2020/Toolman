import { useCallback, useMemo } from 'react'
import { useI18n } from '../../i18n/useI18n'
import type { AppSettings } from './app-settings'
import { buildLanguageOptions, buildShortcutRows } from './settings-panel-options'

export function useSettingsPanelContent(
  onAppSettingsChange: (patch: Partial<AppSettings>) => void,
) {
  const { t } = useI18n()
  const patchApp = useCallback(
    (patch: Partial<AppSettings>) => onAppSettingsChange(patch),
    [onAppSettingsChange],
  )
  const languageOptions = useMemo(() => buildLanguageOptions(t), [t])
  const shortcuts = useMemo(() => buildShortcutRows(t), [t])

  return { t, patchApp, languageOptions, shortcuts }
}
