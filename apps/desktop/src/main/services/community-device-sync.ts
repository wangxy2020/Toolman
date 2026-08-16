/**
 * Mirror the desktop Sync Hub changelog to Community Hub so mobile/web can
 * sync off-LAN (same probe order as community: local sidecar first, official HTTPS next).
 *
 * Device-sync on Community Hub is still per logged-in identity. Cross-user
 * sharing uses the LAN Sync Hub token, not this private changelog.
 */
import {
  DEFAULT_LOCAL_COMMUNITY_HUB_BASE_URL,
  OFFICIAL_TOOLMAN_HUB_URL,
  hostnameOfBaseUrl,
  isOfficialCommunityHubHost,
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
import { resolveCommunityHubBaseUrl } from './community/community-hub.config'
import { getP2pDeviceInfo } from './p2p/p2p-device-identity.service'
import { logStructured } from './structured-log.service'

const WAN_SYNC_INTERVAL_MS = 60_000

let applyingWan = false
let wanCursor: string | null = null
let timer: ReturnType<typeof setInterval> | null = null
let nextHubProbeAt = 0
let skipLogged = false

export function listCommunityDeviceSyncHubCandidates(): string[] {
  const remote = resolveCommunityHubBaseUrl()
  if (remote) return [remote]
  return [DEFAULT_LOCAL_COMMUNITY_HUB_BASE_URL, OFFICIAL_TOOLMAN_HUB_URL]
}

/** Local sidecar is up but has no device_sync — do not fall through to official Hub. */
export function shouldStopDeviceSyncProbe(input: {
  official: boolean
  deviceSync?: boolean
}): boolean {
  return !input.official && input.deviceSync !== true
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

async function createWanClient(baseUrl: string): Promise<CommunityHttpClient> {
  return new CommunityHttpClient({
    baseUrl,
    // Same as mobile WAN: identity header only. Authing Bearer is rejected by
    // the official Hub and is not required by the local sidecar.
    resolveAuth: async () => ({ identityId: getAuthSession().identityId }),
  })
}

async function withDeviceSyncHub<T>(
  run: (client: CommunityHttpClient) => Promise<T>,
): Promise<T | undefined> {
  if (Date.now() < nextHubProbeAt) return undefined
  const errors: string[] = []
  for (const baseUrl of listCommunityDeviceSyncHubCandidates()) {
    const official = isOfficialCommunityHubHost(hostnameOfBaseUrl(baseUrl))
    try {
      const client = await createWanClient(baseUrl)
      const health = await client.health()
      if (health.device_sync === true) {
        resetHubProbeState()
        return await run(client)
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
      let cursor = wanCursor
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
      wanCursor = cursor
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
