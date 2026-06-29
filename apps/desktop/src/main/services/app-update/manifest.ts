import { app } from 'electron'
import { writeFileSync } from 'node:fs'
import {
  parseAppUpdateManifest,
  satisfiesMinVersion,
  type AppUpdateManifest,
} from '@toolman/shared'
import { getAppUpdateConfig } from '../app-update.config'
import { updateManifestPath } from '../local-operations.service'

let remoteManifest: AppUpdateManifest | null = null

export function getRemoteManifest(): AppUpdateManifest | null {
  return remoteManifest
}

export function cacheRemoteManifest(manifest: AppUpdateManifest): void {
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

export async function fetchRemoteManifest(): Promise<AppUpdateManifest | null> {
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
