import { app } from 'electron'
import { toErrorMessage, isVersionNewer } from '@toolman/shared'
import { autoUpdater } from 'electron-updater'
import type { AppUpdateStatus } from '@toolman/shared'
import { recordDiagnosticEvent } from '../diagnostics-log'
import { broadcastAppUpdateStatus } from '../app-update-broadcast'
import { getAppUpdateConfig } from '../app-update.config'
import { fetchRemoteManifest, getRemoteManifest } from './manifest'
import {
  buildInitialStatus,
  ensureStatus,
  publishStatus,
  readUpdatePreferences,
  setStatus,
  writeUpdatePreferences,
} from './status'

let autoUpdaterReady = false

function syncAutoUpdaterPreferences(): void {
  const prefs = readUpdatePreferences()
  autoUpdater.autoDownload = prefs.autoUpdate
  autoUpdater.autoInstallOnAppQuit = prefs.autoUpdate
}

export function ensureAutoUpdaterConfigured(
  onAvailable?: () => void,
): void {
  if (autoUpdaterReady) return

  const config = getAppUpdateConfig()
  syncAutoUpdaterPreferences()
  autoUpdater.allowDowngrade = false

  if (config.autoUpdaterFeedUrl) {
    autoUpdater.setFeedURL({
      provider: 'generic',
      url: config.autoUpdaterFeedUrl,
    })
  }

  autoUpdater.on('checking-for-update', () => {
    publishStatus({ phase: 'checking', error: null }, broadcastAppUpdateStatus)
  })

  autoUpdater.on('update-available', (info) => {
    publishStatus({
      phase: 'available',
      latestVersion: info.version ?? ensureStatus().latestVersion,
      updateAvailable: true,
      error: null,
    }, broadcastAppUpdateStatus)
    if (readUpdatePreferences().autoUpdate) {
      onAvailable?.()
    }
  })

  autoUpdater.on('update-not-available', () => {
    publishStatus({
      phase: 'not-available',
      updateAvailable: false,
      error: null,
    }, broadcastAppUpdateStatus)
  })

  autoUpdater.on('download-progress', (progress) => {
    publishStatus({
      phase: 'downloading',
      downloadProgress: Math.round(progress.percent),
      error: null,
    }, broadcastAppUpdateStatus)
  })

  autoUpdater.on('update-downloaded', (info) => {
    publishStatus({
      phase: 'downloaded',
      latestVersion: info.version ?? ensureStatus().latestVersion,
      downloadProgress: 100,
      updateAvailable: true,
      error: null,
    }, broadcastAppUpdateStatus)
  })

  autoUpdater.on('error', (error) => {
    const message = toErrorMessage(error, String(error))
    recordDiagnosticEvent('update', 'error', message)
    publishStatus({ phase: 'error', error: message }, broadcastAppUpdateStatus)
  })

  autoUpdaterReady = true
}

export function getAppUpdateStatus(): AppUpdateStatus {
  return ensureStatus()
}

export function setAppUpdateAutoEnabled(autoUpdate: boolean): AppUpdateStatus {
  writeUpdatePreferences({ autoUpdate })
  ensureAutoUpdaterConfigured(() => {
    void downloadAppUpdate().catch((error) => {
      const message = toErrorMessage(error, String(error))
      recordDiagnosticEvent('update', 'warn', `auto download failed: ${message}`)
    })
  })
  syncAutoUpdaterPreferences()
  const next = publishStatus({ autoUpdate }, broadcastAppUpdateStatus)

  const config = getAppUpdateConfig()
  if (autoUpdate && config.enabled) {
    void checkForAppUpdate()
      .then((result) => {
        if (result.autoUpdate && result.updateAvailable && result.phase === 'available') {
          return downloadAppUpdate()
        }
        return result
      })
      .catch((error) => {
        const message = toErrorMessage(error, String(error))
        recordDiagnosticEvent('update', 'warn', `auto check on enable failed: ${message}`)
      })
  }

  return next
}

export async function checkForAppUpdate(): Promise<AppUpdateStatus> {
  const config = getAppUpdateConfig()
  publishStatus({ phase: 'checking', error: null }, broadcastAppUpdateStatus)

  if (!config.enabled) {
    return publishStatus({
      phase: 'idle',
      error: '在线更新未配置（需 Release 包 + TOOLMAN_UPDATE_FEED_URL）',
    }, broadcastAppUpdateStatus)
  }

  try {
    const manifest = await fetchRemoteManifest()
    if (!manifest) {
      throw new Error('无法获取更新清单')
    }

    const currentVersion = app.getVersion()
    const updateAvailable = isVersionNewer(manifest.version, currentVersion)
    publishStatus({
      latestVersion: manifest.version,
      updateAvailable,
      notes: manifest.notes ?? null,
      phase: updateAvailable ? 'available' : 'not-available',
      error: null,
    }, broadcastAppUpdateStatus)

    if (!updateAvailable) {
      return ensureStatus()
    }

    ensureAutoUpdaterConfigured()
    await autoUpdater.checkForUpdates()
    return ensureStatus()
  } catch (error) {
    const message = toErrorMessage(error, String(error))
    recordDiagnosticEvent('update', 'error', message)
    return publishStatus({ phase: 'error', error: message }, broadcastAppUpdateStatus)
  }
}

export async function downloadAppUpdate(): Promise<AppUpdateStatus> {
  const config = getAppUpdateConfig()
  if (!config.enabled) {
    return publishStatus({
      phase: 'error',
      error: '在线更新未配置',
    }, broadcastAppUpdateStatus)
  }

  ensureAutoUpdaterConfigured()

  try {
    if (!getRemoteManifest()) {
      await fetchRemoteManifest()
    }
    publishStatus({ phase: 'downloading', downloadProgress: 0, error: null }, broadcastAppUpdateStatus)
    await autoUpdater.downloadUpdate()
    return ensureStatus()
  } catch (error) {
    const message = toErrorMessage(error, String(error))
    recordDiagnosticEvent('update', 'error', message)
    return publishStatus({ phase: 'error', error: message }, broadcastAppUpdateStatus)
  }
}

export function installAppUpdate(): AppUpdateStatus {
  const current = ensureStatus()
  if (current.phase !== 'downloaded') {
    return publishStatus({
      phase: 'error',
      error: '更新尚未下载完成',
    }, broadcastAppUpdateStatus)
  }

  autoUpdater.quitAndInstall()
  return ensureStatus()
}

export function bootstrapAppUpdateService(): void {
  setStatus(buildInitialStatus())

  const config = getAppUpdateConfig()
  if (!config.enabled || !ensureStatus().autoUpdate) {
    return
  }

  ensureAutoUpdaterConfigured()
  setTimeout(() => {
    void checkForAppUpdate()
      .then((result) => {
        if (result.autoUpdate && result.updateAvailable && result.phase === 'available') {
          return downloadAppUpdate()
        }
        return result
      })
      .catch((error) => {
        const message = toErrorMessage(error, String(error))
        recordDiagnosticEvent('update', 'warn', `startup check failed: ${message}`)
      })
  }, 30_000)
}
