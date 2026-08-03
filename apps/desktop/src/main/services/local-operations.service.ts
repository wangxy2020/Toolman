import { app, type WebContents } from 'electron'
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import type { AppGetDiagnosticsOutput, CrashReportKind } from '@toolman/shared'
import { compareSemver, getToolmanBuildProvenance } from '@toolman/shared'

export interface LocalUpdateManifest {
  channel: string
  latestVersion: string
  publishedAt?: string
  notes?: string
  downloadUrl?: string
}

export function diagnosticsDir(): string {
  return join(app.getPath('userData'), 'diagnostics')
}

export function crashReportDir(): string {
  return join(diagnosticsDir(), 'crashes')
}

export function diagnosticsLogPath(): string {
  return join(diagnosticsDir(), 'events.jsonl')
}

export function updateManifestPath(): string {
  return join(app.getPath('userData'), 'updates', 'manifest.json')
}

export function bootstrapLocalOperations(): void {
  mkdirSync(diagnosticsDir(), { recursive: true })
  mkdirSync(crashReportDir(), { recursive: true })
  mkdirSync(join(app.getPath('userData'), 'updates'), { recursive: true })
  ensureDefaultUpdateManifest()
  syncStaleLocalUpdateManifest()
}

function ensureDefaultUpdateManifest(): void {
  const path = updateManifestPath()
  if (existsSync(path)) return

  writeFileSync(
    path,
    JSON.stringify(
      {
        channel: 'local',
        latestVersion: app.getVersion(),
        publishedAt: new Date().toISOString(),
        notes:
          '本地更新通道：修改此 manifest 的 latestVersion 可模拟有新版本可用；downloadUrl 预留供后续接入 CDN。',
      },
      null,
      2,
    ),
    'utf8',
  )
}

/**
 * First-run local manifests keep a frozen latestVersion. After app bumps,
 * that stale value makes About/diagnostics look inconsistent. Bump only the
 * default local placeholder when it lags behind the running app version.
 */
function syncStaleLocalUpdateManifest(): void {
  const path = updateManifestPath()
  if (!existsSync(path)) return

  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as LocalUpdateManifest & {
      downloadUrl?: string
    }
    if (raw.channel !== 'local') return
    // Keep intentional test manifests that point at a downloadable newer build.
    if (raw.downloadUrl) return

    const currentVersion = app.getVersion()
    if (!raw.latestVersion || compareSemver(raw.latestVersion, currentVersion) >= 0) return

    writeFileSync(
      path,
      JSON.stringify(
        {
          ...raw,
          latestVersion: currentVersion,
          publishedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
      'utf8',
    )
  } catch {
    // Disk / parse failures must not break startup.
  }
}

export function appendPersistentDiagnosticLine(line: string): void {
  try {
    bootstrapLocalOperations()
    appendFileSync(diagnosticsLogPath(), `${line}\n`, 'utf8')
  } catch {
    // Disk failures must not break the app.
  }
}

export function recordCrashReport(input: {
  kind: CrashReportKind
  message: string
  stack?: string
}): string | null {
  try {
    bootstrapLocalOperations()
    const filename = `crash-${Date.now()}.json`
    const path = join(crashReportDir(), filename)
    writeFileSync(
      path,
      JSON.stringify(
        {
          at: Date.now(),
          appVersion: app.getVersion(),
          platform: process.platform,
          arch: process.arch,
          buildId: getToolmanBuildProvenance().buildId,
          buildFingerprint: getToolmanBuildProvenance().buildFingerprint,
          ...input,
        },
        null,
        2,
      ),
      'utf8',
    )
    onCrashReportRecorded(path)
    return path
  } catch {
    return null
  }
}

export function onCrashReportRecorded(path: string | null): void {
  if (!path) return
  void import('./crash-report.service')
    .then(({ notifyCrashReportRecorded }) => notifyCrashReportRecorded())
    .catch(() => undefined)
}

export function countCrashReports(): number {
  try {
    if (!existsSync(crashReportDir())) return 0
    return readdirSync(crashReportDir()).filter((name) => name.endsWith('.json')).length
  } catch {
    return 0
  }
}

export function readLocalUpdateManifest(): LocalUpdateManifest | null {
  try {
    syncStaleLocalUpdateManifest()
    const raw = readFileSync(updateManifestPath(), 'utf8')
    return JSON.parse(raw) as LocalUpdateManifest
  } catch {
    return null
  }
}

export function getOperationsDiagnostics(): AppGetDiagnosticsOutput['operations'] {
  const manifest = readLocalUpdateManifest()
  const currentVersion = app.getVersion()
  const latestVersion = manifest?.latestVersion ?? currentVersion
  const updateAvailable = compareSemver(latestVersion, currentVersion) > 0

  return {
    appVersion: currentVersion,
    logFilePath: diagnosticsLogPath(),
    crashReportDir: crashReportDir(),
    crashReportCount: countCrashReports(),
    crashReportUploadEnabled: false,
    crashReportPendingUpload: countCrashReports(),
    crashReportIngestUrl: null,
    update: {
      channel: manifest?.channel ?? 'local',
      currentVersion,
      latestVersion,
      updateAvailable,
      manifestPath: updateManifestPath(),
      notes: updateAvailable ? (manifest?.notes ?? null) : null,
    },
  }
}

export function registerProcessCrashHandlers(): void {
  process.on('uncaughtException', (error) => {
    recordCrashReport({
      kind: 'uncaughtException',
      message: error.message,
      stack: error.stack,
    })
  })

  process.on('unhandledRejection', (reason) => {
    const message = reason instanceof Error ? reason.message : String(reason)
    const stack = reason instanceof Error ? reason.stack : undefined
    recordCrashReport({
      kind: 'unhandledRejection',
      message,
      stack,
    })
  })
}

export function attachRendererCrashHandler(webContents: WebContents): void {
  webContents.on('render-process-gone', (_event, details) => {
    recordCrashReport({
      kind: 'renderProcessGone',
      message: details.reason,
      stack: JSON.stringify(details),
    })
  })
}
