import { useCallback, useEffect, useState } from 'react'
import { IpcChannel } from '@toolman/shared'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { useI18n } from '../../i18n/useI18n'
import {
  SettingsPageLayout,
  SettingsRow,
  SettingsSection,
} from './SettingsShared'
import { loadNotesData } from '../notes/notes-storage'

function IconSave({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
    </svg>
  )
}

function IconFolderOpen({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`
}

function truncatePath(path: string, max = 34): string {
  if (path.length <= max) return path
  return `${path.slice(0, max)}…`
}

type PendingConfirm =
  | { kind: 'deleteKnowledge' }
  | { kind: 'clearCache' }
  | { kind: 'resetData' }

export function DataSettingsPanel() {
  const { t } = useI18n()
  const [stats, setStats] = useState<{
    cacheBytes: number
    userData: string
    userWorkDirectory: string
    logs: string
    knowledgeBase: string
  } | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null)

  const loadStats = useCallback(async () => {
    setStatsLoading(true)
    const result = await window.api.invoke(IpcChannel.AppGetStorageStats)
    setStatsLoading(false)
    if (!result.ok) {
      setError(result.error.message)
      return
    }
    setStats(result.data as typeof stats)
    setError(null)
  }, [])

  useEffect(() => {
    void loadStats()
  }, [loadStats])

  const openPath = async (path: string) => {
    const result = await window.api.invoke(IpcChannel.AppShellOpenPath, { path })
    if (!result.ok) {
      setMessage(result.error.message)
      return
    }
    const data = result.data as { opened: boolean; error?: string }
    if (!data.opened && data.error) setMessage(data.error)
  }

  const handleBackup = async () => {
    setBusy(true)
    setMessage(null)
    const notesData = loadNotesData()
    const result = await window.api.invoke(IpcChannel.AppBackupData, {
      notesDataJson: JSON.stringify(notesData),
    })
    setBusy(false)
    if (!result.ok) {
      setMessage(result.error.message)
      return
    }
    const data = result.data as {
      backupPath: string
      includesKnowledge?: boolean
      includesNotes?: boolean
    }
    const parts = [t('settings.data.backupParts.database')]
    if (data.includesKnowledge) parts.push(t('settings.data.backupParts.knowledge'))
    if (data.includesNotes) parts.push(t('settings.data.backupParts.notes'))
    setMessage(
      t('settings.data.messages.backupSuccess', {
        path: data.backupPath,
        parts: parts.join('、'),
      }),
    )
  }

  const handleRestore = async () => {
    const pick = await window.api.invoke(IpcChannel.DialogSelectFolder, {})
    if (!pick.ok) return
    const folder = (pick.data as { path: string | null }).path
    if (!folder) return

    if (!window.confirm(t('settings.data.restoreConfirm'))) return

    setBusy(true)
    setMessage(null)
    const result = await window.api.invoke(IpcChannel.AppRestoreData, {
      backupPath: folder,
      restoreKnowledge: true,
    })
    setBusy(false)
    if (!result.ok) {
      setMessage(result.error.message)
      return
    }
    const data = result.data as {
      restored: boolean
      includesKnowledge?: boolean
      notesDataJson?: string
    }
    if (data.notesDataJson) {
      window.dispatchEvent(new CustomEvent('toolman:notes-restore', { detail: data.notesDataJson }))
    }
    const parts = [t('settings.data.backupParts.database')]
    if (data.includesKnowledge) parts.push(t('settings.data.backupParts.knowledge'))
    if (data.notesDataJson) parts.push(t('settings.data.backupParts.notes'))
    setMessage(t('settings.data.messages.restoreSuccess', { parts: parts.join('、') }))
  }

  const handleDeleteKnowledge = async () => {
    setBusy(true)
    const result = await window.api.invoke(IpcChannel.AppDeleteKnowledge)
    setBusy(false)
    if (!result.ok) {
      setMessage(result.error.message)
      return
    }
    await loadStats()
    setMessage(t('settings.data.messages.deleteKnowledge'))
  }

  const handleClearCache = async () => {
    setBusy(true)
    const result = await window.api.invoke(IpcChannel.AppClearCache)
    setBusy(false)
    if (!result.ok) {
      setMessage(result.error.message)
      return
    }
    await loadStats()
    setMessage(t('settings.data.messages.clearCache'))
  }

  const handleReset = async () => {
    setBusy(true)
    const result = await window.api.invoke(IpcChannel.AppResetData)
    setBusy(false)
    if (!result.ok) {
      setMessage(result.error.message)
      return
    }
    await loadStats()
    const data = result.data as { cleared?: string[]; memoryEntriesDeleted?: number }
    const memoryCount = data.memoryEntriesDeleted ?? 0
    const clearedItems = data.cleared ?? []
    if (memoryCount === 0 && clearedItems.length === 0) {
      setMessage(t('settings.data.messages.resetRestart'))
    } else {
      const segments: string[] = []
      if (memoryCount > 0) {
        segments.push(t('settings.data.messages.resetMemory', { count: memoryCount }))
      }
      if (clearedItems.length > 0) {
        segments.push(t('settings.data.messages.resetCleared', { items: clearedItems.join('、') }))
      }
      setMessage(segments.join(''))
    }
  }

  const handleConfirm = () => {
    if (!pendingConfirm) return
    const action = pendingConfirm
    setPendingConfirm(null)

    if (action.kind === 'deleteKnowledge') {
      void handleDeleteKnowledge()
      return
    }
    if (action.kind === 'clearCache') {
      void handleClearCache()
      return
    }
    void handleReset()
  }

  const confirmDialog = pendingConfirm
    ? {
        deleteKnowledge: {
          title: t('settings.data.confirm.deleteKnowledge.title'),
          message: t('settings.data.confirm.deleteKnowledge.message'),
          confirmLabel: t('settings.data.confirm.deleteKnowledge.confirmLabel'),
          danger: true,
        },
        clearCache: {
          title: t('settings.data.confirm.clearCache.title'),
          message: t('settings.data.confirm.clearCache.message'),
          confirmLabel: t('settings.data.confirm.clearCache.confirmLabel'),
          danger: false,
        },
        resetData: {
          title: t('settings.data.confirm.resetData.title'),
          message: t('settings.data.confirm.resetData.message'),
          confirmLabel: t('settings.data.confirm.resetData.confirmLabel'),
          danger: true,
        },
      }[pendingConfirm.kind]
    : null

  return (
    <SettingsPageLayout>
      <div className="tm-data-settings">
        <SettingsSection title={t('settings.data.title')}>
          <SettingsRow label={t('settings.data.backupRestore')}>
            <div className="tm-data-actions">
              <button
                type="button"
                className="tm-data-btn"
                disabled={busy}
                onClick={() => void handleBackup()}
              >
                <IconSave />
                {t('settings.data.fullBackup')}
              </button>
              <button
                type="button"
                className="tm-data-btn"
                disabled={busy}
                onClick={() => void handleRestore()}
              >
                <IconFolderOpen />
                {t('settings.data.restore')}
              </button>
            </div>
          </SettingsRow>
        </SettingsSection>

        <SettingsSection title={t('settings.data.directories.title')}>
          <SettingsRow
            label={t('settings.data.directories.userWork')}
            hint={t('settings.data.directories.userWorkHint')}
          >
            <div className="tm-data-path-control">
              <span className="tm-data-path" title={stats?.userWorkDirectory}>
                {statsLoading
                  ? t('settings.data.loading')
                  : stats?.userWorkDirectory
                    ? truncatePath(stats.userWorkDirectory)
                    : '—'}
              </span>
              <button
                type="button"
                className="tm-data-btn"
                disabled={!stats?.userWorkDirectory}
                onClick={() => stats?.userWorkDirectory && void openPath(stats.userWorkDirectory)}
              >
                {t('settings.data.openDir')}
              </button>
            </div>
          </SettingsRow>

          <SettingsRow label={t('settings.data.directories.appData')}>
            <div className="tm-data-path-control">
              <span className="tm-data-path" title={stats?.userData}>
                {statsLoading ? t('settings.data.loading') : stats ? truncatePath(stats.userData) : '—'}
              </span>
              <button
                type="button"
                className="tm-data-btn"
                disabled={!stats}
                onClick={() => stats && void openPath(stats.userData)}
              >
                {t('settings.data.openDir')}
              </button>
            </div>
          </SettingsRow>

          <SettingsRow label={t('settings.data.directories.appLogs')}>
            <div className="tm-data-path-control">
              <span className="tm-data-path" title={stats?.logs}>
                {statsLoading ? t('settings.data.loading') : stats ? truncatePath(stats.logs) : '—'}
              </span>
              <button
                type="button"
                className="tm-data-btn"
                disabled={!stats}
                onClick={() => stats && void openPath(stats.logs)}
              >
                {t('settings.data.openLogs')}
              </button>
            </div>
          </SettingsRow>

          <SettingsRow label={t('settings.data.directories.knowledgeFiles')}>
            <button
              type="button"
              className="tm-data-btn"
              disabled={busy || !stats}
              onClick={() => setPendingConfirm({ kind: 'deleteKnowledge' })}
            >
              {t('settings.data.deleteFiles')}
            </button>
          </SettingsRow>

          <SettingsRow
            label={
              stats
                ? t('settings.data.clearCacheWithSize', { size: formatBytes(stats.cacheBytes) })
                : t('settings.data.clearCache')
            }
          >
            <button
              type="button"
              className="tm-data-btn"
              disabled={busy}
              onClick={() => setPendingConfirm({ kind: 'clearCache' })}
            >
              {t('settings.data.clearCache')}
            </button>
          </SettingsRow>

          <SettingsRow label={t('settings.data.resetData')}>
            <button
              type="button"
              className="tm-data-btn tm-data-btn--danger"
              disabled={busy}
              onClick={() => setPendingConfirm({ kind: 'resetData' })}
            >
              {t('settings.data.resetData')}
            </button>
          </SettingsRow>
        </SettingsSection>

        {error ? <div className="tm-settings-error">{error}</div> : null}
        {message ? <p className="tm-settings-msg">{message}</p> : null}
      </div>

      {confirmDialog ? (
        <ConfirmDialog
          title={confirmDialog.title}
          message={confirmDialog.message}
          confirmLabel={confirmDialog.confirmLabel}
          cancelLabel={t('common.cancel')}
          danger={confirmDialog.danger}
          onCancel={() => setPendingConfirm(null)}
          onConfirm={handleConfirm}
        />
      ) : null}
    </SettingsPageLayout>
  )
}
