import { useCallback, useEffect, useState } from 'react'
import {
  APP_UPDATE_STATUS_CHANNEL,
  IpcChannel,
  type AppUpdateStatus,
} from '@toolman/shared'

function updateButtonLabel(status: AppUpdateStatus | null): string {
  if (!status) return '检查更新'
  switch (status.phase) {
    case 'checking':
      return '检查中…'
    case 'available':
      return '下载更新'
    case 'downloading':
      return status.downloadProgress != null
        ? `下载中 ${status.downloadProgress}%`
        : '下载中…'
    case 'downloaded':
      return '立即重启安装'
    case 'not-available':
      return '已是最新'
    case 'error':
      return '重试检查'
    default:
      return status.enabled ? '检查更新' : '立即更新'
  }
}

function isUpdateButtonDisabled(status: AppUpdateStatus | null): boolean {
  if (!status) return true
  if (status.phase === 'checking' || status.phase === 'downloading') return true
  if (!status.enabled && status.phase !== 'error') return true
  return false
}

function parseReleaseNotes(notes: string | null | undefined): string[] {
  if (!notes?.trim()) return []
  return notes
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

export function useAppUpdate() {
  const [status, setStatus] = useState<AppUpdateStatus | null>(null)
  const [currentVersion, setCurrentVersion] = useState('0.1.0')

  const refresh = useCallback(async () => {
    const infoResult = await window.api.invoke(IpcChannel.AppGetInfo)
    if (infoResult.ok && infoResult.data && typeof infoResult.data === 'object') {
      const version = (infoResult.data as { version?: string }).version
      if (version) setCurrentVersion(version)
    }

    const statusResult = await window.api.invoke(IpcChannel.AppUpdateGetStatus)
    if (statusResult.ok && statusResult.data) {
      setStatus(statusResult.data as AppUpdateStatus)
    }
  }, [])

  useEffect(() => {
    void refresh()
    return window.api.subscribe(APP_UPDATE_STATUS_CHANNEL, (payload) => {
      setStatus(payload as AppUpdateStatus)
    })
  }, [refresh])

  const setAutoUpdate = useCallback(async (autoUpdate: boolean) => {
    const result = await window.api.invoke(IpcChannel.AppUpdateSetAuto, { autoUpdate })
    if (result.ok && result.data) {
      setStatus(result.data as AppUpdateStatus)
    }
  }, [])

  const runUpdateAction = useCallback(async () => {
    if (!status) return

    let channel = IpcChannel.AppUpdateCheck
    if (status.phase === 'available') {
      channel = IpcChannel.AppUpdateDownload
    } else if (status.phase === 'downloaded') {
      channel = IpcChannel.AppUpdateInstall
    }

    const result = await window.api.invoke(channel)
    if (result.ok && result.data) {
      setStatus(result.data as AppUpdateStatus)
    }
  }, [status])

  return {
    status,
    currentVersion,
    releaseNotes: parseReleaseNotes(status?.notes),
    updateButtonLabel: updateButtonLabel(status),
    updateButtonDisabled: isUpdateButtonDisabled(status),
    refresh,
    setAutoUpdate,
    runUpdateAction,
  }
}
