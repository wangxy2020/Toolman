import { useCallback, useEffect, useState } from 'react'
import {
  APP_UPDATE_STATUS_CHANNEL,
  IpcChannel,
  type AppUpdateStatus,
} from '@toolman/shared'
import { getAppUpdateButtonLabel, getAppUpdateStatusHint } from '../../i18n/settings-labels'
import { useI18n } from '../../i18n/useI18n'

function isUpdateButtonDisabled(status: AppUpdateStatus | null): boolean {
  if (!status) return true
  return status.phase === 'checking' || status.phase === 'downloading'
}

function parseReleaseNotes(notes: string | null | undefined): string[] {
  if (!notes?.trim()) return []
  return notes
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

export function useAppUpdate() {
  const { t } = useI18n()
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
    updateButtonLabel: getAppUpdateButtonLabel(status, t),
    updateStatusHint: getAppUpdateStatusHint(status, t),
    updateButtonDisabled: isUpdateButtonDisabled(status),
    refresh,
    setAutoUpdate,
    runUpdateAction,
  }
}
