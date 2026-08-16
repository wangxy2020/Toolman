import { ToolmanSyncClient } from '@toolman/sync-client'
import {
  DEFAULT_LOCAL_SYNC_BASE_URL,
  isForeignSyncIdentity,
  isOfficialCommunityHubHost,
  isReachableSyncEndpointHealth,
  isSyncHubHealthPayload,
  hostnameOfBaseUrl,
  listSyncBaseUrlCandidates,
  syncHubHealthIdentityId,
} from '@toolman/shared'
import { COMMUNITY_HUB_PROXY_PREFIX } from '../features/communityHubProxy'
import { getCurrentDataIdentity } from '../storage/identityScope'
import { loadIdentity } from '../storage/secure'
import { resolveCommunityHubBaseUrl } from '../settings/communityHubUrl'
import { loadModulePrefs } from '../settings/prefs'
import { isHostedWebPage, listDesktopDevHostnames, shouldProbeLoopbackSyncHub } from './desktopDevHost'

let cachedSyncBaseUrl: string | null = null

export type KnowledgeMetaItem = {
  id: string
  name: string
  kind: string
  documentCount: number
  updatedAt: number
}

/** Bind fetch to the global object — Expo Web throws Illegal invocation on unbound Window.fetch. */
const boundFetch: typeof fetch = (input, init) => globalThis.fetch.call(globalThis, input, init)

export async function loadSyncIdentityId(): Promise<string | null> {
  return getCurrentDataIdentity() ?? (await loadIdentity())?.identityId ?? null
}

export class ForeignSyncHubError extends Error {
  readonly foreign = true
  constructor(readonly baseUrl: string) {
    super('SYNC_HUB_FOREIGN_IDENTITY')
    this.name = 'ForeignSyncHubError'
  }
}

export function isForeignSyncHubError(error: unknown): error is ForeignSyncHubError {
  return error instanceof ForeignSyncHubError
}

export async function loadSyncHubToken(): Promise<string | null> {
  const fromEnv = process.env.EXPO_PUBLIC_SYNC_TOKEN?.trim()
  if (fromEnv) return fromEnv
  const prefs = await loadModulePrefs()
  const token = prefs.sync?.hubToken?.trim()
  return token || null
}

export type MobileSyncTransport = 'lan-hub' | 'community-hub'

/** Same-origin Community Hub proxy used by hosted web (avoids browser CORS to hub.toolman.app). */
export const COMMUNITY_HUB_SYNC_PROXY_BASE = COMMUNITY_HUB_PROXY_PREFIX

export function isCommunityHubSyncProxyBase(baseUrl: string): boolean {
  const normalized = baseUrl.trim().replace(/\/+$/, '')
  return (
    normalized === COMMUNITY_HUB_SYNC_PROXY_BASE ||
    normalized.startsWith(`${COMMUNITY_HUB_SYNC_PROXY_BASE}/`)
  )
}

/**
 * Hosted web must not call https://hub.toolman.app from the browser — use the
 * Vercel/Expo same-origin proxy that community already uses.
 */
export function rewriteSyncBaseUrlForClient(baseUrl: string): string {
  const normalized = baseUrl.trim().replace(/\/+$/, '')
  if (!normalized) return normalized
  if (isCommunityHubSyncProxyBase(normalized)) return COMMUNITY_HUB_SYNC_PROXY_BASE
  if (!isHostedWebPage()) return normalized
  if (!isWanCommunitySyncUrl(normalized)) return normalized
  return COMMUNITY_HUB_SYNC_PROXY_BASE
}

export function isWanCommunitySyncUrl(baseUrl: string): boolean {
  if (isCommunityHubSyncProxyBase(baseUrl)) return true
  const host = hostnameOfBaseUrl(baseUrl)
  if (isOfficialCommunityHubHost(host)) return true
  try {
    return new URL(baseUrl).port === '3721'
  } catch {
    return false
  }
}

export function classifyMobileSyncTransport(baseUrl: string): MobileSyncTransport {
  return isWanCommunitySyncUrl(baseUrl) ? 'community-hub' : 'lan-hub'
}

export type ReachableMobileSyncTarget = {
  baseUrl: string
  transport: MobileSyncTransport
}

export function createMobileSyncClient(baseUrl?: string): ToolmanSyncClient {
  const resolved = rewriteSyncBaseUrlForClient(
    baseUrl ?? cachedSyncBaseUrl ?? DEFAULT_LOCAL_SYNC_BASE_URL,
  )
  const wan = isWanCommunitySyncUrl(resolved)
  return new ToolmanSyncClient({
    baseUrl: resolved,
    // Community Hub device_sync accepts X-Community-User-Id (and Hub JWT when present).
    // Do not send the LAN pairing token or Authing access token as Bearer here.
    getAccessToken: wan ? async () => null : loadSyncHubToken,
    getSyncToken: wan ? async () => null : loadSyncHubToken,
    getIdentityId: loadSyncIdentityId,
    fetchImpl: boundFetch,
  })
}

async function probeJson(url: string, signal: AbortSignal): Promise<unknown | null> {
  const res = await boundFetch(url, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal,
  })
  if (!res.ok) return null
  try {
    return await res.json()
  } catch {
    return null
  }
}

type SyncHubProbeKind = 'ok' | 'foreign' | 'miss' | 'no-device-sync'

function asHealthRecord(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== 'object') return null
  const rec = payload as Record<string, unknown>
  if (rec.data && typeof rec.data === 'object') return rec.data as Record<string, unknown>
  return rec
}

function isCommunityHubHealthyWithoutDeviceSync(payload: unknown): boolean {
  const data = asHealthRecord(payload)
  if (!data) return false
  if (data.device_sync === true) return false
  return data.status === 'healthy' || data.status === 'ok'
}

/** Desktop Sync Hub first; Community Hub only when it advertises device_sync. */
async function classifySyncBaseUrl(
  baseUrl: string,
  localIdentityId?: string | null,
): Promise<SyncHubProbeKind> {
  const origin = rewriteSyncBaseUrlForClient(baseUrl)
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 2500)
  try {
    const health =
      (await probeJson(`${origin}/health`, ctrl.signal)) ??
      (await probeJson(`${origin}/api/v1/health`, ctrl.signal))
    if (!health) return 'miss'
    if (isReachableSyncEndpointHealth(health)) {
      // LAN Sync Hub authenticates with the pairing token. Its /health may still
      // advertise the desktop guest UUID, which must not reject Authing mobile IDs
      // (`ag-…` / `fb-…`) as a "foreign" hub.
      if (isSyncHubHealthPayload(health)) return 'ok'
      if (isForeignSyncIdentity(syncHubHealthIdentityId(health), localIdentityId)) {
        return 'foreign'
      }
      return 'ok'
    }
    if (isWanCommunitySyncUrl(origin) && isCommunityHubHealthyWithoutDeviceSync(health)) {
      return 'no-device-sync'
    }
    return 'miss'
  } catch {
    return 'miss'
  } finally {
    clearTimeout(timer)
  }
}

async function probeSyncBaseUrl(baseUrl: string, localIdentityId?: string | null): Promise<boolean> {
  return (await classifySyncBaseUrl(baseUrl, localIdentityId)) === 'ok'
}

export function resetMobileSyncBaseUrlCache(): void {
  cachedSyncBaseUrl = null
}

function unreachableSyncHubMessage(
  tried: string[],
  options?: { noDeviceSyncUrl?: string | null },
): string {
  if (options?.noDeviceSyncUrl) {
    return `已连接到社区 Hub（${options.noDeviceSyncUrl}），但未开启跨网同步（device_sync）。请升级部署官方 Hub 后重试。`
  }
  const list = tried.length > 0 ? tried.join('、') : DEFAULT_LOCAL_SYNC_BASE_URL
  const hostedHint =
    '网页会经同源代理访问官方社区 Hub；局域网 Sync Hub 浏览器通常不可达。请确认已登录同一账号，且桌面端已打开跨网同步。'
  const localHint =
    '同一局域网请开启桌面「与移动端同步」；跨网请登录同一账号，由官方社区 Hub 中转。'
  return `无法连接桌面 Sync Hub（${list}）。${isHostedWebPage() ? hostedHint : localHint}`
}

export async function resolveReachableMobileSyncBaseUrl(
  communityHubBaseUrl?: string | null,
): Promise<string> {
  const prefs = await loadModulePrefs()
  const configuredCommunity =
    communityHubBaseUrl === undefined ? prefs.community.hubBaseUrl : communityHubBaseUrl
  const packagerHostnames = listDesktopDevHostnames()
  const localIdentityId = await loadSyncIdentityId()
  const candidates = listSyncBaseUrlCandidates({
    configuredSyncBaseUrl: prefs.sync?.hubBaseUrl,
    envSyncBaseUrl: process.env.EXPO_PUBLIC_SYNC_BASE_URL,
    communityHubBaseUrl: resolveCommunityHubBaseUrl(configuredCommunity),
    packagerHostnames,
    includeLoopback: shouldProbeLoopbackSyncHub(packagerHostnames),
  }).map(rewriteSyncBaseUrlForClient)
  // De-dupe after hosted-web rewrite collapses official hub → proxy.
  const uniqueCandidates = Array.from(new Set(candidates))
  if (
    cachedSyncBaseUrl &&
    uniqueCandidates.includes(cachedSyncBaseUrl) &&
    (await probeSyncBaseUrl(cachedSyncBaseUrl, localIdentityId))
  ) {
    return cachedSyncBaseUrl
  }
  let foreignUrl: string | null = null
  let noDeviceSyncUrl: string | null = null
  for (const url of uniqueCandidates) {
    const kind = await classifySyncBaseUrl(url, localIdentityId)
    if (kind === 'ok') {
      cachedSyncBaseUrl = url
      return url
    }
    if (kind === 'foreign' && !foreignUrl) foreignUrl = url
    if (kind === 'no-device-sync' && !noDeviceSyncUrl) noDeviceSyncUrl = url
  }
  if (foreignUrl) {
    throw new ForeignSyncHubError(foreignUrl)
  }
  throw new Error(unreachableSyncHubMessage(uniqueCandidates, { noDeviceSyncUrl }))
}

export async function resolveReachableMobileSyncTarget(
  communityHubBaseUrl?: string | null,
): Promise<ReachableMobileSyncTarget> {
  const baseUrl = await resolveReachableMobileSyncBaseUrl(communityHubBaseUrl)
  return { baseUrl, transport: classifyMobileSyncTransport(baseUrl) }
}

export async function createReachableMobileSyncClient(
  communityHubBaseUrl?: string | null,
): Promise<ToolmanSyncClient> {
  return createMobileSyncClient(await resolveReachableMobileSyncBaseUrl(communityHubBaseUrl))
}

export function getMobileSyncBaseUrl(): string {
  return (
    cachedSyncBaseUrl ??
    (process.env.EXPO_PUBLIC_SYNC_BASE_URL?.trim() || DEFAULT_LOCAL_SYNC_BASE_URL)
  )
}

export function getMobileSyncTransport(): MobileSyncTransport {
  return classifyMobileSyncTransport(getMobileSyncBaseUrl())
}

/** Live probe of desktop agent hosts (does not depend on prior sync state). */
export async function countDesktopHostsOnline(client?: ToolmanSyncClient): Promise<number> {
  try {
    const syncClient = client ?? (await createReachableMobileSyncClient())
    const hosts = await syncClient.listHosts()
    return hosts.filter((h) => h.agentHost && h.deviceKind === 'desktop').length
  } catch {
    return 0
  }
}

export const AUTO_SYNC_PAGE_MODULES: ReadonlySet<string> = new Set([
  'notes',
  'knowledge',
  'classroom',
])

export const AUTO_SYNC_INTERVAL_MS = 180_000
export const AUTO_SYNC_MIN_GAP_MS = 30_000
