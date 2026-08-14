import { useState } from 'react'
import { Linking, Pressable, Text } from 'react-native'
import { useI18n } from '../i18n'
import { saveModulePrefs, type ModulePrefs } from '../settings/prefs'
import { useMobileApp } from '../state/MobileAppContext'
import {
  countDesktopHostsOnline,
  getMobileSyncBaseUrl,
  pullAndApplySync,
  pushNoteChanges,
  resetMobileSyncBaseUrlCache,
  resolveReachableMobileSyncBaseUrl,
} from '../sync/mobileSync'
import {
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
    setSyncStatus,
    syncCursor,
    setSyncCursor,
    desktopHostsOnline,
    setDesktopHostsOnline,
    notes,
    setNotes,
    deletedNotes,
    setDeletedNotes,
    knowledgeMeta,
    setKnowledgeMeta,
    classroomCourses,
    setClassroomCourses,
    modulePrefs,
    setModulePrefs,
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
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const runSync = async () => {
    setBusy(true)
    setMessage(null)
    setSyncStatus('syncing')
    try {
      if (modulePrefs.notes.syncEnabled) {
        await pushNoteChanges(notes, syncCursor, { deletedNotes })
      }
      const applied = await pullAndApplySync({
        cursor: syncCursor,
        notes,
        deletedNotes,
        knowledgeMeta,
        classroomCourses,
      })
      setNotes(applied.notes)
      setDeletedNotes(applied.deletedNotes)
      setKnowledgeMeta(applied.knowledgeMeta)
      setClassroomCourses(applied.classroomCourses)
      setSyncCursor(applied.nextCursor)
      setDesktopHostsOnline(applied.hostsOnline)
      setHubUrl(getMobileSyncBaseUrl())
      if (applied.knowledgeError) {
        setSyncStatus('error')
        setMessage(applied.knowledgeError)
        return
      }
      setSyncStatus('idle')
      setMessage(
        t('diagnostics.syncDone', {
          notes: applied.notes.length,
          knowledge: applied.knowledgeMeta.length,
          courses: applied.classroomCourses.length,
        }),
      )
    } catch (error) {
      setSyncStatus('error')
      setMessage(error instanceof Error ? error.message : String(error))
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
        <Pressable onPress={() => void runSync()} disabled={busy} hitSlop={8}>
          <Text style={styles.linkText}>{t('diagnostics.syncNow')}</Text>
        </Pressable>
      </Section>

      <Section title={t('diagnostics.hub')}>
        <Text style={styles.meta}>
          {t('diagnostics.hubUrl')}：{hubUrl}
        </Text>
        <Text style={styles.hint}>{t('diagnostics.hubHint')}</Text>
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
