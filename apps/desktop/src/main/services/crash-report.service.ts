import { app } from 'electron'
import { toErrorMessage } from '@toolman/shared'
import {
  existsSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import {CrashReportPayloadSchema,
  CrashReportUploadResultSchema,
  CrashReportUploadStatusSchema,
  redactCrashReportText,
  type CrashReportUploadResult,
  type CrashReportUploadStatus } from '@toolman/shared'
import { recordDiagnosticEvent } from './diagnostics-log'
import { crashReportDir } from './local-operations.service'
import { resolveCrashReportIngestUrl } from './crash-report.config'
import { getP2pDeviceInfo } from './p2p/p2p-device-identity.service'

const PREFS_PATH = () => join(app.getPath('userData'), 'diagnostics', 'preferences.json')

interface CrashReportPreferences {
  uploadEnabled: boolean
  lastUploadAt: number | null
  lastUploadError: string | null
}

let prefs: CrashReportPreferences = readPreferences()
let uploadInFlight: Promise<CrashReportUploadResult> | null = null

function readPreferences(): CrashReportPreferences {
  try {
    if (!existsSync(PREFS_PATH())) {
      return { uploadEnabled: false, lastUploadAt: null, lastUploadError: null }
    }
    const raw = JSON.parse(readFileSync(PREFS_PATH(), 'utf8')) as Partial<CrashReportPreferences>
    return {
      uploadEnabled: raw.uploadEnabled === true,
      lastUploadAt: typeof raw.lastUploadAt === 'number' ? raw.lastUploadAt : null,
      lastUploadError:
        typeof raw.lastUploadError === 'string' ? raw.lastUploadError : null,
    }
  } catch {
    return { uploadEnabled: false, lastUploadAt: null, lastUploadError: null }
  }
}

function writePreferences(next: CrashReportPreferences): void {
  prefs = next
  writeFileSync(PREFS_PATH(), JSON.stringify(next, null, 2), 'utf8')
}

function listPendingCrashFiles(): string[] {
  try {
    if (!existsSync(crashReportDir())) return []
    return readdirSync(crashReportDir())
      .filter((name) => name.endsWith('.json'))
      .map((name) => join(crashReportDir(), name))
  } catch {
    return []
  }
}

function sanitizePayload(raw: unknown): ReturnType<typeof CrashReportPayloadSchema.parse> | null {
  try {
    const parsed = CrashReportPayloadSchema.parse(raw)
    const homePath = app.getPath('home')
    return {
      ...parsed,
      message: redactCrashReportText(parsed.message, homePath),
      stack: parsed.stack ? redactCrashReportText(parsed.stack, homePath) : undefined,
      deviceId: parsed.deviceId ?? resolveDeviceId(),
    }
  } catch {
    return null
  }
}

function resolveDeviceId(): string | undefined {
  try {
    return getP2pDeviceInfo().deviceId
  } catch {
    return undefined
  }
}

async function uploadCrashFile(path: string, ingestUrl: string): Promise<void> {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown
  const payload = sanitizePayload(raw)
  if (!payload) {
    throw new Error(`invalid crash report: ${path}`)
  }

  const response = await fetch(ingestUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      at: payload.at,
      app_version: payload.appVersion,
      platform: payload.platform,
      arch: payload.arch,
      kind: payload.kind,
      message: payload.message,
      stack: payload.stack,
      device_id: payload.deviceId,
    }),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(`crash upload failed (${response.status})${text ? `: ${text}` : ''}`)
  }
}

export function getCrashReportUploadStatus(): CrashReportUploadStatus {
  const pending = listPendingCrashFiles()
  return CrashReportUploadStatusSchema.parse({
    uploadEnabled: prefs.uploadEnabled,
    ingestUrl: resolveCrashReportIngestUrl(),
    pendingCount: pending.length,
    lastUploadAt: prefs.lastUploadAt,
    lastUploadError: prefs.lastUploadError,
  })
}

export function getCrashReportDiagnosticsFields(): {
  crashReportUploadEnabled: boolean
  crashReportPendingUpload: number
  crashReportIngestUrl: string | null
} {
  const status = getCrashReportUploadStatus()
  return {
    crashReportUploadEnabled: status.uploadEnabled,
    crashReportPendingUpload: status.pendingCount,
    crashReportIngestUrl: status.ingestUrl,
  }
}

export function setCrashReportUploadEnabled(uploadEnabled: boolean): CrashReportUploadStatus {
  writePreferences({ ...prefs, uploadEnabled })
  if (uploadEnabled) {
    void flushPendingCrashReports().catch(() => undefined)
  }
  return getCrashReportUploadStatus()
}

export async function flushPendingCrashReports(): Promise<CrashReportUploadResult> {
  if (uploadInFlight) return uploadInFlight

  uploadInFlight = (async () => {
    const ingestUrl = resolveCrashReportIngestUrl()
    const pending = listPendingCrashFiles()
    if (!prefs.uploadEnabled || !ingestUrl || pending.length === 0) {
      return CrashReportUploadResultSchema.parse({
        uploaded: 0,
        failed: 0,
        remaining: pending.length,
      })
    }

    let uploaded = 0
    let failed = 0
    let lastError: string | null = null

    for (const path of pending) {
      try {
        await uploadCrashFile(path, ingestUrl)
        unlinkSync(path)
        uploaded += 1
      } catch (error) {
        failed += 1
        lastError = toErrorMessage(error, 'upload failed')
        recordDiagnosticEvent('crash-report', 'warn', lastError)
      }
    }

    const remaining = listPendingCrashFiles().length
    writePreferences({
      ...prefs,
      lastUploadAt: uploaded > 0 ? Date.now() : prefs.lastUploadAt,
      lastUploadError: lastError,
    })

    if (uploaded > 0) {
      recordDiagnosticEvent(
        'crash-report',
        'info',
        `uploaded ${uploaded} crash report(s); ${remaining} remaining`,
      )
    }

    return CrashReportUploadResultSchema.parse({ uploaded, failed, remaining })
  })().finally(() => {
    uploadInFlight = null
  })

  return uploadInFlight
}

export function bootstrapCrashReportService(): void {
  prefs = readPreferences()
  if (prefs.uploadEnabled) {
    void flushPendingCrashReports().catch(() => undefined)
  }
}

export function notifyCrashReportRecorded(): void {
  if (!prefs.uploadEnabled) return
  void flushPendingCrashReports().catch(() => undefined)
}
