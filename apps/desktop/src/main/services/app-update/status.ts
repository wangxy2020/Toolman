import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  AppUpdateStatusSchema,
  isVersionNewer,
  type AppUpdateStatus,
} from '@toolman/shared'
import { getAppUpdateConfig } from '../app-update.config'
import { readLocalUpdateManifest } from '../local-operations.service'

export const UPDATE_PREFS_PATH = () => join(app.getPath('userData'), 'updates', 'preferences.json')

export interface UpdatePreferences {
  autoUpdate: boolean
}

let status: AppUpdateStatus | null = null

export function readUpdatePreferences(): UpdatePreferences {
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

export function writeUpdatePreferences(prefs: UpdatePreferences): void {
  writeFileSync(UPDATE_PREFS_PATH(), JSON.stringify(prefs, null, 2), 'utf8')
}

export function buildInitialStatus(): AppUpdateStatus {
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

export function ensureStatus(): AppUpdateStatus {
  if (!status) {
    status = buildInitialStatus()
  }
  return status
}

export function setStatus(next: AppUpdateStatus | null): void {
  status = next
}

export function publishStatus(
  patch: Partial<AppUpdateStatus>,
  broadcast: (status: AppUpdateStatus) => void,
): AppUpdateStatus {
  status = AppUpdateStatusSchema.parse({ ...ensureStatus(), ...patch })
  broadcast(status)
  return status
}
