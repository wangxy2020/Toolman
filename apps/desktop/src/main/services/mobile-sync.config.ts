/**
 * Persisted preferences for desktop ↔ mobile Sync Hub / agent host.
 * Env `TOOLMAN_MOBILE_*` still overrides when set (CI / forced enable).
 */
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import { z } from 'zod'

const MobileSyncPreferencesSchema = z.object({
  syncEnabled: z.boolean().default(true),
  agentHostEnabled: z.boolean().default(true),
  classroomSyncEnabled: z.boolean().default(true),
  /** When false, Hub binds 127.0.0.1 only. */
  lanAccessEnabled: z.boolean().default(false),
  /**
   * Mirror private changelog to Community Hub (local sidecar + official) for
   * off-LAN mobile/web sync. Default on.
   */
  wanSyncEnabled: z.boolean().default(true),
  /** Pairing token required by Sync Hub APIs (except `/health`). */
  hubToken: z.string().min(16).optional(),
  /** Optional override; empty → default port 17890. */
  port: z.number().int().positive().optional(),
})

export type MobileSyncPreferences = z.infer<typeof MobileSyncPreferencesSchema>

const DEFAULT_PREFS: MobileSyncPreferences = {
  syncEnabled: true,
  agentHostEnabled: true,
  classroomSyncEnabled: true,
  lanAccessEnabled: false,
  wanSyncEnabled: true,
}

function getConfigPath(): string {
  return join(app.getPath('userData'), 'mobile-sync', 'preferences.json')
}

export function readMobileSyncPreferences(): MobileSyncPreferences {
  try {
    const path = getConfigPath()
    if (!existsSync(path)) return { ...DEFAULT_PREFS }
    return MobileSyncPreferencesSchema.parse(JSON.parse(readFileSync(path, 'utf8')))
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

export function writeMobileSyncPreferences(
  prefs: MobileSyncPreferences,
): MobileSyncPreferences {
  const parsed = MobileSyncPreferencesSchema.parse(prefs)
  const path = getConfigPath()
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(parsed, null, 2), 'utf8')
  return parsed
}

function envTriState(name: string): boolean | null {
  const value = process.env[name]
  if (value === '1' || value === 'true') return true
  if (value === '0' || value === 'false') return false
  return null
}

/** Sync Hub enabled: env override wins, else persisted preference. */
export function isMobileSyncPreferenceEnabled(): boolean {
  const env = envTriState('TOOLMAN_MOBILE_SYNC')
  if (env !== null) return env
  return readMobileSyncPreferences().syncEnabled
}

/** Agent host enabled: requires sync; env override wins when set. */
export function isMobileAgentHostPreferenceEnabled(): boolean {
  if (!isMobileSyncPreferenceEnabled()) return false
  const env = envTriState('TOOLMAN_MOBILE_AGENT_HOST')
  if (env !== null) return env
  return readMobileSyncPreferences().agentHostEnabled
}

/** Classroom course sync: persisted preference (independent of env hub override). */
export function isClassroomSyncPreferenceEnabled(): boolean {
  return readMobileSyncPreferences().classroomSyncEnabled === true
}

export function setClassroomSyncPreferenceEnabled(enabled: boolean): MobileSyncPreferences {
  const current = readMobileSyncPreferences()
  return writeMobileSyncPreferences({
    ...current,
    classroomSyncEnabled: enabled,
    ...(enabled ? { syncEnabled: true } : {}),
  })
}

export function isMobileSyncLanAccessEnabled(): boolean {
  const env = envTriState('TOOLMAN_MOBILE_SYNC_LAN')
  if (env !== null) return env
  return readMobileSyncPreferences().lanAccessEnabled === true
}

export function setMobileSyncLanAccessEnabled(enabled: boolean): MobileSyncPreferences {
  const current = readMobileSyncPreferences()
  return writeMobileSyncPreferences({
    ...current,
    lanAccessEnabled: enabled,
    ...(enabled ? { syncEnabled: true } : {}),
  })
}

/** Cross-network private sync via Community Hub device_sync. */
export function isMobileSyncWanEnabled(): boolean {
  const env = envTriState('TOOLMAN_MOBILE_SYNC_WAN')
  if (env !== null) return env
  if (!isMobileSyncPreferenceEnabled()) return false
  return readMobileSyncPreferences().wanSyncEnabled !== false
}

export function setMobileSyncWanEnabled(enabled: boolean): MobileSyncPreferences {
  const current = readMobileSyncPreferences()
  return writeMobileSyncPreferences({
    ...current,
    wanSyncEnabled: enabled,
    ...(enabled ? { syncEnabled: true } : {}),
  })
}

export function resolveMobileSyncListenHost(): string {
  return isMobileSyncLanAccessEnabled() ? '0.0.0.0' : '127.0.0.1'
}

export function ensureMobileSyncHubToken(): string {
  const fromEnv = process.env.TOOLMAN_MOBILE_SYNC_TOKEN?.trim()
  if (fromEnv && fromEnv.length >= 16) return fromEnv
  const current = readMobileSyncPreferences()
  if (current.hubToken && current.hubToken.length >= 16) return current.hubToken
  const hubToken = randomBytes(32).toString('hex')
  writeMobileSyncPreferences({ ...current, hubToken })
  return hubToken
}

export function resolveMobileSyncPort(): number {
  const fromEnv = Number.parseInt(process.env.TOOLMAN_MOBILE_SYNC_PORT ?? '', 10)
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv
  const fromPrefs = readMobileSyncPreferences().port
  if (typeof fromPrefs === 'number' && fromPrefs > 0) return fromPrefs
  return 17890
}
