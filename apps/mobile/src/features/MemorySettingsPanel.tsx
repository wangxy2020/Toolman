import { Text } from 'react-native'
import { useI18n } from '../i18n'
import { saveModulePrefs } from '../settings/prefs'
import { useMobileApp } from '../state/MobileAppContext'
import { Field, Section, SettingsScroll, Toggle, settingsUiStyles as styles } from './settingsUi'

export function MemorySettingsPanel() {
  const { t } = useI18n()
  const { modulePrefs, setModulePrefs } = useMobileApp()
  const app = modulePrefs.app

  const patchApp = async (patch: Partial<typeof app>) => {
    const next = { ...modulePrefs, app: { ...app, ...patch } }
    setModulePrefs(next)
    await saveModulePrefs(next)
  }

  return (
    <SettingsScroll>
      <Section title={t('memory.title')}>
        <Toggle
          label={t('memory.enable')}
          value={app.memoryEnabled}
          onChange={(memoryEnabled) => void patchApp({ memoryEnabled })}
        />
        <Text style={styles.hint}>{t('memory.enableHint')}</Text>
        <Field
          label={t('memory.retentionDays')}
          value={String(app.memoryRetentionDays)}
          onChangeText={(value) => {
            const days = Number(value.replace(/[^\d]/g, ''))
            if (!Number.isFinite(days) || days <= 0) return
            void patchApp({ memoryRetentionDays: Math.min(365, days) })
          }}
        />
      </Section>
    </SettingsScroll>
  )
}
