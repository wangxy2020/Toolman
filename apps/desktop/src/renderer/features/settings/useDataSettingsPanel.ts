import { useCallback, useEffect, useState } from 'react'
import { IpcChannel } from '@toolman/shared'
import type { TranslateFn } from '../../i18n/useI18n'
import { loadNotesData } from '../notes/notes-storage'

export type PendingConfirm =
  | { kind: 'deleteKnowledge' }
  | { kind: 'clearCache' }
  | { kind: 'resetData' }
  | { kind: 'restore'; backupPath: string }

export type StorageStats = {
  cacheBytes: number
  userData: string
  userWorkDirectory: string
  logs: string
  knowledgeBase: string
}

export function useDataSettingsPanel() {
  const [stats, setStats] = useState<StorageStats | null>(null)
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
    setStats(result.data as StorageStats)
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

  const handleBackup = async (t: TranslateFn) => {
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

  const handleRestore = async (backupPath: string, t: TranslateFn) => {
    setBusy(true)
    setMessage(null)
    const result = await window.api.invoke(IpcChannel.AppRestoreData, {
      backupPath,
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

  const handleDeleteKnowledge = async (t: TranslateFn) => {
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

  const handleClearCache = async (t: TranslateFn) => {
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

  const handleReset = async (t: TranslateFn) => {
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

  const handlePickRestore = async () => {
    const pick = await window.api.invoke(IpcChannel.DialogSelectFolder, {})
    if (!pick.ok) return
    const folder = (pick.data as { path: string | null }).path
    if (!folder) return
    setPendingConfirm({ kind: 'restore', backupPath: folder })
  }

  const handleConfirm = (t: TranslateFn) => {
    if (!pendingConfirm) return
    const action = pendingConfirm
    setPendingConfirm(null)

    if (action.kind === 'restore') {
      void handleRestore(action.backupPath, t)
      return
    }
    if (action.kind === 'deleteKnowledge') {
      void handleDeleteKnowledge(t)
      return
    }
    if (action.kind === 'clearCache') {
      void handleClearCache(t)
      return
    }
    void handleReset(t)
  }

  return {
    stats,
    statsLoading,
    busy,
    error,
    message,
    pendingConfirm,
    setPendingConfirm,
    openPath,
    handleBackup,
    handlePickRestore,
    handleConfirm,
  }
}
