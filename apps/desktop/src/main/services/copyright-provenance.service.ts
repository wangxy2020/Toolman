import { app } from 'electron'
import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  AppDiagnosticsProvenanceSchema,
  getToolmanBuildProvenance,
  type AppDiagnosticsProvenance,
  type ProvenanceBeaconEvent,
  type ToolmanBuildProvenance,
} from '@toolman/shared'
import { logStructured } from './structured-log.service'
import { getP2pDeviceId } from './p2p/p2p-device-identity.service'

const SESSION_HEARTBEAT_MS = 6 * 60 * 60 * 1000

let sessionStartedAt = Date.now()
let beaconCount = 0
let lastBeaconAt: number | null = null
let lastBeaconEvent: ProvenanceBeaconEvent | null = null
let heartbeatTimer: ReturnType<typeof setInterval> | null = null
let bootstrapped = false

function provenanceLogPath(): string {
  const dir = join(app.getPath('userData'), 'diagnostics')
  mkdirSync(dir, { recursive: true })
  return join(dir, 'provenance.jsonl')
}

function resolveDeviceIdForProvenance(): string | null {
  try {
    return getP2pDeviceId()
  } catch {
    return null
  }
}

function appendProvenanceRecord(
  event: ProvenanceBeaconEvent,
  provenance: ToolmanBuildProvenance,
): void {
  const payload = {
    type: 'toolman.provenance',
    event,
    at: Date.now(),
    buildId: provenance.buildId,
    buildFingerprint: provenance.buildFingerprint,
    gitCommit: provenance.gitCommit,
    version: provenance.version,
    deviceId: resolveDeviceIdForProvenance(),
    platform: process.platform,
    arch: process.arch,
  }
  try {
    appendFileSync(provenanceLogPath(), `${JSON.stringify(payload)}\n`, 'utf8')
  } catch {
    // Best-effort audit trail only.
  }
}

export function getToolmanBuildProvenanceSnapshot(): ToolmanBuildProvenance {
  return getToolmanBuildProvenance()
}

export function getProvenanceDiagnostics(): AppDiagnosticsProvenance {
  const provenance = getToolmanBuildProvenance()
  return AppDiagnosticsProvenanceSchema.parse({
    ...provenance,
    sessionStartedAt,
    beaconCount,
    lastBeaconAt,
    lastBeaconEvent,
  })
}

export function recordProvenanceBeacon(event: ProvenanceBeaconEvent): ToolmanBuildProvenance {
  const provenance = getToolmanBuildProvenance()
  beaconCount += 1
  lastBeaconAt = Date.now()
  lastBeaconEvent = event

  logStructured('provenance', 'info', `${event}`, {
    buildId: provenance.buildId,
    buildFingerprint: provenance.buildFingerprint,
    gitCommit: provenance.gitCommit.slice(0, 7),
    version: provenance.version,
  })
  appendProvenanceRecord(event, provenance)
  return provenance
}

function scheduleSessionHeartbeat(): void {
  if (heartbeatTimer) return
  heartbeatTimer = setInterval(() => {
    recordProvenanceBeacon('app.session.heartbeat')
  }, SESSION_HEARTBEAT_MS)
  heartbeatTimer.unref?.()
}

export function bootstrapCopyrightProvenance(): void {
  if (bootstrapped) return
  bootstrapped = true
  sessionStartedAt = Date.now()
  recordProvenanceBeacon('app.start')
  scheduleSessionHeartbeat()
}
