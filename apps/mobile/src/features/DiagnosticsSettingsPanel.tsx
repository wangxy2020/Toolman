import { useState } from 'react'
import { Linking, Pressable, Text } from 'react-native'
import { useI18n } from '../i18n'
import { saveModulePrefs, type ModulePrefs } from '../settings/prefs'
import { useMobileApp } from '../state/MobileAppContext'
import {
  countDesktopHostsOnline,
  getMobileSyncBaseUrl,
  resetMobileSyncBaseUrlCache,
  resolveReachableMobileSyncBaseUrl,
} from '../sync/mobileSync'
import { hostedWebSyncSoftHint } from '../sync/hostedWebSync'
import { formatMobileP2pPathMetrics } from '../p2p/pathMetrics'
import {
  Field,
  Section,
  SettingsScroll,
  Toggle,
  settingsUiStyles as styles,
} from './settingsUi'

const TOOLMAN_PRIVACY_URL = 'https://github.com/wangxy2020/Toolman/blob/main/docs/mobile/PRIVACY.md'

export function DiagnosticsSettingsPanel() {
  const { t } = useI18n()
  const {
    syncStatus,
    desktopHostsOnline,
    setDesktopHostsOnline,
    notes,
    knowledgeMeta,
    classroomCourses,
    modulePrefs,
    setModulePrefs,
    runSync,
  } = useMobileApp()
  const [hubUrl, setHubUrl] = useState(getMobileSyncBaseUrl())
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const persistPrefs = async (next: ModulePrefs) => {
    setModulePrefs(next)
    await saveModulePrefs(next)
  }

  const patchApp = (patch: Partial<ModulePrefs['app']>) =>
    persistPrefs({ ...modulePrefs, app: { ...modulePrefs.app, ...patch } })

  const refreshConnection = async () => {
    setBusy(true)
    setMessage(null)
    resetMobileSyncBaseUrlCache()
    try {
      const url = await resolveReachableMobileSyncBaseUrl()
      setHubUrl(url)
      setDesktopHostsOnline(await countDesktopHostsOnline())
      setMessage(t('diagnostics.refreshOk'))
    } catch (error) {
      setHubUrl(getMobileSyncBaseUrl())
      setDesktopHostsOnline(0)
      const soft = hostedWebSyncSoftHint({
        configuredSyncBaseUrl: modulePrefs.sync.hubBaseUrl,
        envSyncBaseUrl: process.env.EXPO_PUBLIC_SYNC_BASE_URL,
      })
      setMessage(
        soft ?? (error instanceof Error ? error.message : String(error)),
      )
    } finally {
      setBusy(false)
    }
  }

  const handleSyncNow = async () => {
    setBusy(true)
    setMessage(null)
    try {
      const result = await runSync('manual')
      setHubUrl(getMobileSyncBaseUrl())
      setMessage(result)
    } finally {
      setBusy(false)
    }
  }

  const syncLabel =
    syncStatus === 'syncing'
      ? t('diagnostics.syncSyncing')
      : syncStatus === 'error'
        ? t('diagnostics.syncError')
        : syncStatus === 'offline'
          ? t('diagnostics.syncOffline')
          : t('diagnostics.syncIdle')

  return (
    <SettingsScroll>
      <Section
        title={t('diagnostics.runtime')}
        trailing={
          <Pressable onPress={() => void refreshConnection()} disabled={busy} hitSlop={8}>
            <Text style={styles.linkText}>
              {busy ? t('diagnostics.refreshing') : t('diagnostics.refresh')}
            </Text>
          </Pressable>
        }
      >
        <Text style={styles.hint}>{t('diagnostics.intro')}</Text>
        <Text style={styles.meta}>
          {t('diagnostics.syncStatus')}：{syncLabel}
        </Text>
        <Text style={styles.meta}>
          {t('diagnostics.desktopHost')}：
          {desktopHostsOnline > 0
            ? t('diagnostics.hostOnline', { count: desktopHostsOnline })
            : t('diagnostics.hostNone')}
        </Text>
        <Text style={styles.meta}>
          {t('diagnostics.p2pPath')}：{formatMobileP2pPathMetrics()}
        </Text>
        <Pressable onPress={() => void handleSyncNow()} disabled={busy} hitSlop={8}>
          <Text style={styles.linkText}>{t('diagnostics.syncNow')}</Text>
        </Pressable>
      </Section>

      <Section title={t('diagnostics.hub')}>
        <Text style={styles.meta}>
          {t('diagnostics.hubUrl')}：{hubUrl}
        </Text>
        <Text style={styles.hint}>{t('diagnostics.hubHint')}</Text>
        <Field
          label={t('user.httpsDesktopUrl')}
          value={modulePrefs.sync.hubBaseUrl ?? ''}
          onChangeText={(hubBaseUrl) =>
            void persistPrefs({
              ...modulePrefs,
              sync: { ...modulePrefs.sync, hubBaseUrl },
            }).then(() => {
              resetMobileSyncBaseUrlCache()
            })
          }
          placeholder={t('user.httpsDesktopUrlPlaceholder')}
          keyboardType="url"
        />
      </Section>

      <Section title={t('diagnostics.syncToggles')}>
        <Toggle
          label={t('diagnostics.notesSync')}
          value={modulePrefs.notes.syncEnabled}
          onChange={(syncEnabled) =>
            void persistPrefs({
              ...modulePrefs,
              notes: { ...modulePrefs.notes, syncEnabled },
            })
          }
        />
        <Toggle
          label={t('diagnostics.notesAutoSync')}
          value={modulePrefs.notes.autoSyncOnEdit}
          onChange={(autoSyncOnEdit) =>
            void persistPrefs({
              ...modulePrefs,
              notes: { ...modulePrefs.notes, autoSyncOnEdit },
            })
          }
        />
        <Toggle
          label={t('diagnostics.knowledgeSync')}
          value={modulePrefs.knowledge.syncEnabled}
          onChange={(syncEnabled) =>
            void persistPrefs({
              ...modulePrefs,
              knowledge: { ...modulePrefs.knowledge, syncEnabled },
            })
          }
        />
        <Toggle
          label={t('diagnostics.classroomSync')}
          value={modulePrefs.classroom.syncEnabled}
          onChange={(syncEnabled) =>
            void persistPrefs({
              ...modulePrefs,
              classroom: { ...modulePrefs.classroom, syncEnabled },
            })
          }
        />
        <Text style={styles.hint}>{t('diagnostics.syncTogglesHint')}</Text>
      </Section>

      <Section title={t('diagnostics.localData')}>
        <Text style={styles.meta}>
          {t('diagnostics.notes')}：{notes.length}
        </Text>
        <Text style={styles.meta}>
          {t('diagnostics.knowledge')}：{knowledgeMeta.length}
        </Text>
        <Text style={styles.meta}>
          {t('diagnostics.courses')}：{classroomCourses.length}
        </Text>
        <Text style={styles.hint}>{t('diagnostics.desktopHint')}</Text>
      </Section>

      <Section title={t('diagnostics.operations')}>
        <Toggle
          label={t('diagnostics.analytics')}
          value={modulePrefs.app.analyticsOptIn}
          onChange={(analyticsOptIn) => {
            void patchApp({ analyticsOptIn })
            setMessage(analyticsOptIn ? t('diagnostics.analyticsOn') : t('diagnostics.analyticsOff'))
          }}
        />
        <Pressable onPress={() => void Linking.openURL(TOOLMAN_PRIVACY_URL)} hitSlop={8}>
          <Text style={styles.linkText}>{t('diagnostics.privacy')}</Text>
        </Pressable>
      </Section>

      {message ? <Text style={styles.hint}>{message}</Text> : null}
    </SettingsScroll>
  )
}
