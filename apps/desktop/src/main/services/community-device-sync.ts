/**
 * Mirror the desktop Sync Hub changelog to Community Hub so mobile/web can
 * sync off-LAN (local sidecar first, then official HTTPS Hub).
 *
 * Device-sync buckets are keyed by Authing/Firebase identity (`ag-…` / `fb-…`).
 * LAN Sync Hub pairing token remains the full-featured local path (incl. knowledge files).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { app } from 'electron'
import {
  DEFAULT_LOCAL_COMMUNITY_HUB_BASE_URL,
  OFFICIAL_TOOLMAN_HUB_URL,
  hostnameOfBaseUrl,
  isOfficialCommunityHubHost,
  resolveDeviceSyncIdentityId,
  toErrorMessage,
  type SyncChange,
} from '@toolman/shared'
import { applyInboundSyncChanges } from './mobile-sync-apply'
import {
  appendSyncChanges,
  listSyncChangelog,
} from './mobile-sync-store'
import { getAuthSession } from './auth-session.service'
import { CommunityHttpClient } from './community/community-http.client'
import { resolveCommunityHubAuth } from './community/community-hub-auth.service'
import { resolveCommunityHubBaseUrl } from './community/community-hub.config'
import {
  isMobileSyncWanEnabled,
} from './mobile-sync.config'
import { getP2pDeviceInfo } from './p2p/p2p-device-identity.service'
import { logStructured } from './structured-log.service'

const WAN_SYNC_INTERVAL_MS = 60_000

let applyingWan = false
let wanCursor: string | null = null
let wanCursorLoaded = false
let timer: ReturnType<typeof setInterval> | null = null
let nextHubProbeAt = 0
let skipLogged = false

function wanCursorPath(): string {
  return join(app.getPath('userData'), 'mobile-sync', 'wan-cursor.json')
}

function loadWanCursor(): string | null {
  if (wanCursorLoaded) return wanCursor
  wanCursorLoaded = true
  try {
    const path = wanCursorPath()
    if (!existsSync(path)) {
      wanCursor = null
      return wanCursor
    }
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as { cursor?: unknown }
    wanCursor =
      typeof parsed.cursor === 'string' && parsed.cursor.trim() ? parsed.cursor.trim() : null
  } catch {
    wanCursor = null
  }
  return wanCursor
}

function persistWanCursor(cursor: string | null): void {
  wanCursor = cursor
  wanCursorLoaded = true
  try {
    const path = wanCursorPath()
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, JSON.stringify({ cursor }, null, 2), 'utf8')
  } catch (error) {
    logStructured(
      'mobile-sync',
      'warn',
      `wan cursor persist failed: ${toErrorMessage(error, String(error))}`,
    )
  }
}

/**
 * Prefer configured remote Hub; otherwise try local sidecar then official Hub
 * so `mode: local` desktops still mirror into the public device_sync bucket.
 */
export function listCommunityDeviceSyncHubCandidates(): string[] {
  const remote = resolveCommunityHubBaseUrl()
  if (remote) {
    const urls = [remote]
    if (!isOfficialCommunityHubHost(hostnameOfBaseUrl(remote))) {
      urls.push(OFFICIAL_TOOLMAN_HUB_URL)
    }
    return urls
  }
  return [DEFAULT_LOCAL_COMMUNITY_HUB_BASE_URL, OFFICIAL_TOOLMAN_HUB_URL]
}

/**
 * Never stop probing after a local sidecar without device_sync — always allow
 * fallthrough to the official Hub for cross-network sync.
 */
export function shouldStopDeviceSyncProbe(_input: {
  official: boolean
  deviceSync?: boolean
}): boolean {
  return false
}

function noteHubUnavailable(message: string): void {
  nextHubProbeAt = Date.now() + WAN_SYNC_INTERVAL_MS
  if (skipLogged) return
  skipLogged = true
  logStructured('mobile-sync', 'info', message)
}

function resetHubProbeState(): void {
  nextHubProbeAt = 0
  skipLogged = false
}

function describeHubFailure(baseUrl: string, error: unknown): string {
  const host = hostnameOfBaseUrl(baseUrl)
  const detail = toErrorMessage(error, String(error))
  if (isOfficialCommunityHubHost(host)) {
    return `official hub ${baseUrl}: ${detail}`
  }
  return `local hub ${baseUrl}: ${detail}`
}

/** @deprecated Use shared resolveDeviceSyncIdentityId via community-hub-auth. */
export function resolveDeviceSyncIdentityIdDesktop(): string {
  const session = getAuthSession()
  return resolveDeviceSyncIdentityId({
    bindings: session.bindings,
    fallbackIdentityId: session.identityId,
  })
}

/** Match mobile `ag-…` / `fb-…` so Community Hub device_sync shares one bucket. */
export function resolveDeviceSyncIdentityIdForSession(): string {
  return resolveDeviceSyncIdentityIdDesktop()
}

async function createWanClient(baseUrl: string): Promise<CommunityHttpClient> {
  return new CommunityHttpClient({
    baseUrl,
    resolveAuth: async () => {
      try {
        return await resolveCommunityHubAuth()
      } catch {
        // Guest / unsigned desktop: identity header only (device_sync allows it).
        return { identityId: resolveDeviceSyncIdentityIdDesktop() }
      }
    },
  })
}

async function withDeviceSyncHub<T>(
  run: (client: CommunityHttpClient, baseUrl: string) => Promise<T>,
): Promise<T | undefined> {
  if (!isMobileSyncWanEnabled()) return undefined
  if (Date.now() < nextHubProbeAt) return undefined
  const errors: string[] = []
  for (const baseUrl of listCommunityDeviceSyncHubCandidates()) {
    const official = isOfficialCommunityHubHost(hostnameOfBaseUrl(baseUrl))
    try {
      const client = await createWanClient(baseUrl)
      const health = await client.health()
      if (health.device_sync === true) {
        resetHubProbeState()
        return await run(client, baseUrl)
      }
      if (shouldStopDeviceSyncProbe({ official, deviceSync: health.device_sync })) {
        noteHubUnavailable(
          'community hub device_sync unavailable on local sidecar; using LAN Sync Hub only',
        )
        return undefined
      }
      errors.push(`${baseUrl}: device_sync not enabled`)
    } catch (error) {
      errors.push(describeHubFailure(baseUrl, error))
    }
  }
  if (errors.length > 0) {
    noteHubUnavailable(`community hub sync skipped: ${errors.join('; ')}`)
  }
  return undefined
}

async function pushToCommunityHub(changes: SyncChange[]): Promise<void> {
  if (applyingWan || changes.length === 0) return
  try {
    await withDeviceSyncHub(async (client) => {
      const device = getP2pDeviceInfo()
      await client.post('/api/v1/sync/push', {
        deviceId: device.deviceId,
        cursor: null,
        changes,
      })
    })
  } catch (error) {
    noteHubUnavailable(
      `community hub sync push failed: ${toErrorMessage(error, String(error))}`,
    )
  }
}

export function replicateChangesToCommunityHub(changes: SyncChange[]): void {
  void pushToCommunityHub(changes)
}

export async function pullCommunityDeviceSync(): Promise<void> {
  if (applyingWan) return
  try {
    await withDeviceSyncHub(async (client) => {
      const device = getP2pDeviceInfo()
      const incoming: SyncChange[] = []
      let cursor = loadWanCursor()
      for (let page = 0; page < 50; page += 1) {
        const pulled = await client.post<{
          changes?: SyncChange[]
          nextCursor?: string | null
          hasMore?: boolean
        }>('/api/v1/sync/pull', {
          deviceId: device.deviceId,
          cursor,
          limit: 100,
        })
        const changes = pulled.changes ?? []
        incoming.push(...changes)
        cursor = pulled.nextCursor ?? cursor
        if (!pulled.hasMore || changes.length === 0) break
      }
      persistWanCursor(cursor)
      if (incoming.length === 0) return
      applyingWan = true
      try {
        applyInboundSyncChanges(incoming)
        appendSyncChanges(incoming, { skipWanReplicate: true })
      } finally {
        applyingWan = false
      }
    })
  } catch (error) {
    noteHubUnavailable(
      `community hub sync pull failed: ${toErrorMessage(error, String(error))}`,
    )
  }
}

export async function syncWithCommunityHub(): Promise<void> {
  await pullCommunityDeviceSync()
  await pushToCommunityHub(listSyncChangelog())
}

export function startCommunityDeviceSyncLoop(): void {
  if (timer) return
  // Sidecar Hub often comes up after Sync Hub; delay the first attempt.
  timer = setTimeout(() => {
    void syncWithCommunityHub()
    timer = setInterval(() => {
      void syncWithCommunityHub()
    }, WAN_SYNC_INTERVAL_MS)
  }, 2500)
}

export function stopCommunityDeviceSyncLoop(): void {
  if (!timer) return
  clearTimeout(timer)
  clearInterval(timer)
  timer = null
  resetHubProbeState()
}

/** Test helper */
export function resetCommunityDeviceSyncStateForTests(): void {
  stopCommunityDeviceSyncLoop()
  wanCursor = null
  wanCursorLoaded = false
  applyingWan = false
}
