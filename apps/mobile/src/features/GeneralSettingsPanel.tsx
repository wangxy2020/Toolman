import { Pressable, Text, View } from 'react-native'
import { useI18n } from '../i18n'
import type { AppLanguage } from '../i18n/language'
import { saveModulePrefs } from '../settings/prefs'
import { useMobileApp } from '../state/MobileAppContext'
import { Section, SettingsScroll, Toggle, settingsUiStyles as styles } from './settingsUi'

export function GeneralSettingsPanel() {
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
      <Section title={t('general.title')}>
        <Text style={styles.label}>{t('general.language')}</Text>
        <View style={styles.providerGrid}>
          {(['zh-CN', 'en'] as const).map((id: AppLanguage) => {
            const active = app.language === id
            return (
              <Pressable
                key={id}
                style={[styles.providerChip, active ? styles.providerChipActive : null]}
                onPress={() => void patchApp({ language: id })}
              >
                <Text style={[styles.providerChipText, active ? styles.providerChipTextActive : null]}>
                  {t(id === 'zh-CN' ? 'language.zhCN' : 'language.en')}
                </Text>
              </Pressable>
            )
          })}
        </View>
        <Text style={styles.hint}>{t('general.languageHint')}</Text>
        <Toggle
          label={t('general.restoreSession')}
          value={app.restoreLastSession}
          onChange={(restoreLastSession) => void patchApp({ restoreLastSession })}
        />
        <Text style={styles.hint}>{t('general.restoreSessionHint')}</Text>
      </Section>
    </SettingsScroll>
  )
}
