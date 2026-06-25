import { app } from 'electron'
import { toErrorMessage } from '@toolman/shared'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { autoUpdater } from 'electron-updater'
import {AppUpdateStatusSchema,
  isVersionNewer,
  parseAppUpdateManifest,
  satisfiesMinVersion,
  type AppUpdateManifest,
  type AppUpdateStatus } from '@toolman/shared'
import { recordDiagnosticEvent } from './diagnostics-log'
import { broadcastAppUpdateStatus } from './app-update-broadcast'
import { getAppUpdateConfig } from './app-update.config'
import { readLocalUpdateManifest, updateManifestPath } from './local-operations.service'

const UPDATE_PREFS_PATH = () => join(app.getPath('userData'), 'updates', 'preferences.json')

interface UpdatePreferences {
  autoUpdate: boolean
}

let status: AppUpdateStatus | null = null

function ensureStatus(): AppUpdateStatus {
  if (!status) {
    status = buildInitialStatus()
  }
  return status
}
let autoUpdaterReady = false
let remoteManifest: AppUpdateManifest | null = null

function readUpdatePreferences(): UpdatePreferences {
  try {
    if (!existsSync(UPDATE_PREFS_PATH())) {
      return { autoUpdate: true }
    }
    const raw = JSON.parse(readFileSync(UPDATE_PREFS_PATH(), 'utf8')) as Partial<UpdatePreferences>
    return { autoUpdate: raw.autoUpdate ?? true }
  } catch {
    return { autoUpdate: true }
  }
}

function writeUpdatePreferences(prefs: UpdatePreferences): void {
  writeFileSync(UPDATE_PREFS_PATH(), JSON.stringify(prefs, null, 2), 'utf8')
}

function buildInitialStatus(): AppUpdateStatus {
  const config = getAppUpdateConfig()
  const prefs = readUpdatePreferences()
  const localManifest = readLocalUpdateManifest()
  const currentVersion = app.getVersion()
  const latestVersion = localManifest?.latestVersion ?? null

  return AppUpdateStatusSchema.parse({
    enabled: config.enabled,
    channel: config.channel,
    currentVersion,
    latestVersion,
    updateAvailable: latestVersion != null && isVersionNewer(latestVersion, currentVersion),
    downloadProgress: null,
    phase: 'idle',
    notes: localManifest?.notes ?? null,
    error: null,
    autoUpdate: prefs.autoUpdate,
  })
}

function publishStatus(patch: Partial<AppUpdateStatus>): AppUpdateStatus {
  status = AppUpdateStatusSchema.parse({ ...ensureStatus(), ...patch })
  broadcastAppUpdateStatus(status)
  return status
}

function cacheRemoteManifest(manifest: AppUpdateManifest): void {
  remoteManifest = manifest
  writeFileSync(
    updateManifestPath(),
    JSON.stringify(
      {
        channel: getAppUpdateConfig().channel,
        latestVersion: manifest.version,
        publishedAt: new Date().toISOString(),
        notes: manifest.notes ?? '',
        downloadUrl: manifest.url,
        sha256: manifest.sha256,
        minVersion: manifest.minVersion ?? null,
      },
      null,
      2,
    ),
    'utf8',
  )
}

async function fetchRemoteManifest(): Promise<AppUpdateManifest | null> {
  const { manifestUrl } = getAppUpdateConfig()
  if (!manifestUrl) return null

  const response = await fetch(manifestUrl, {
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) {
    throw new Error(`更新清单请求失败 (${response.status})`)
  }

  const manifest = parseAppUpdateManifest(await response.json())
  if (!manifest) {
    throw new Error('更新清单格式无效')
  }

  const currentVersion = app.getVersion()
  if (!satisfiesMinVersion(currentVersion, manifest.minVersion)) {
    throw new Error(`当前版本 ${currentVersion} 低于最低要求 ${manifest.minVersion}`)
  }

  cacheRemoteManifest(manifest)
  return manifest
}

function syncAutoUpdaterPreferences(): void {
  const prefs = readUpdatePreferences()
  autoUpdater.autoDownload = prefs.autoUpdate
  autoUpdater.autoInstallOnAppQuit = prefs.autoUpdate
}

function ensureAutoUpdaterConfigured(): void {
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
    publishStatus({ phase: 'checking', error: null })
  })

  autoUpdater.on('update-available', (info) => {
    publishStatus({
      phase: 'available',
      latestVersion: info.version ?? ensureStatus().latestVersion,
      updateAvailable: true,
      error: null,
    })
    if (readUpdatePreferences().autoUpdate) {
      void downloadAppUpdate().catch((error) => {
        const message = toErrorMessage(error, String(error))
        recordDiagnosticEvent('update', 'warn', `auto download failed: ${message}`)
      })
    }
  })

  autoUpdater.on('update-not-available', () => {
    publishStatus({
      phase: 'not-available',
      updateAvailable: false,
      error: null,
    })
  })

  autoUpdater.on('download-progress', (progress) => {
    publishStatus({
      phase: 'downloading',
      downloadProgress: Math.round(progress.percent),
      error: null,
    })
  })

  autoUpdater.on('update-downloaded', (info) => {
    publishStatus({
      phase: 'downloaded',
      latestVersion: info.version ?? ensureStatus().latestVersion,
      downloadProgress: 100,
      updateAvailable: true,
      error: null,
    })
  })

  autoUpdater.on('error', (error) => {
    const message = toErrorMessage(error, String(error))
    recordDiagnosticEvent('update', 'error', message)
    publishStatus({ phase: 'error', error: message })
  })

  autoUpdaterReady = true
}

export function getAppUpdateStatus(): AppUpdateStatus {
  return ensureStatus()
}

export function setAppUpdateAutoEnabled(autoUpdate: boolean): AppUpdateStatus {
  writeUpdatePreferences({ autoUpdate })
  ensureAutoUpdaterConfigured()
  syncAutoUpdaterPreferences()
  const next = publishStatus({ autoUpdate })

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
  publishStatus({ phase: 'checking', error: null })

  if (!config.enabled) {
    return publishStatus({
      phase: 'idle',
      error: '在线更新未配置（需 Release 包 + TOOLMAN_UPDATE_FEED_URL）',
    })
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
    })

    if (!updateAvailable) {
      return ensureStatus()
    }

    ensureAutoUpdaterConfigured()
    await autoUpdater.checkForUpdates()
    return ensureStatus()
  } catch (error) {
    const message = toErrorMessage(error, String(error))
    recordDiagnosticEvent('update', 'error', message)
    return publishStatus({ phase: 'error', error: message })
  }
}

export async function downloadAppUpdate(): Promise<AppUpdateStatus> {
  const config = getAppUpdateConfig()
  if (!config.enabled) {
    return publishStatus({
      phase: 'error',
      error: '在线更新未配置',
    })
  }

  ensureAutoUpdaterConfigured()

  try {
    if (!remoteManifest) {
      await fetchRemoteManifest()
    }
    publishStatus({ phase: 'downloading', downloadProgress: 0, error: null })
    await autoUpdater.downloadUpdate()
    return ensureStatus()
  } catch (error) {
    const message = toErrorMessage(error, String(error))
    recordDiagnosticEvent('update', 'error', message)
    return publishStatus({ phase: 'error', error: message })
  }
}

export function installAppUpdate(): AppUpdateStatus {
  const current = ensureStatus()
  if (current.phase !== 'downloaded') {
    return publishStatus({
      phase: 'error',
      error: '更新尚未下载完成',
    })
  }

  autoUpdater.quitAndInstall()
  return ensureStatus()
}

export function bootstrapAppUpdateService(): void {
  status = buildInitialStatus()

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
