import { ToolmanSyncClient } from '@toolman/sync-client'
import {
  DEFAULT_LOCAL_SYNC_BASE_URL,
  isForeignDesktopSyncHub,
  isForeignSyncIdentity,
  isOfficialCommunityHubHost,
  isReachableSyncEndpointHealth,
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
import { boundFetch, localNetworkRequestTimeoutMs, primeLocalNetworkAccess } from './localNetworkFetch'

let cachedSyncBaseUrl: string | null = null

export type KnowledgeMetaItem = {
  id: string
  name: string
  kind: string
  documentCount: number
  updatedAt: number
}

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

export type MobileSyncTransport = 'lan-hub' | 'community-hub' | 'personal-mailbox' | 'webrtc'

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
    mode: 'cors',
  })
  if (!res.ok) {
    // Hosted-web proxy returns 502 when upstream Hub DNS/deploy is down.
    if (
      res.status === 502 &&
      isHostedWebPage() &&
      (url.includes(`${COMMUNITY_HUB_SYNC_PROXY_BASE}/`) ||
        url.startsWith(COMMUNITY_HUB_SYNC_PROXY_BASE))
    ) {
      return { __proxyUpstreamDown: true }
    }
    return null
  }
  try {
    return await res.json()
  } catch {
    return null
  }
}

type SyncHubProbeKind = 'ok' | 'foreign' | 'miss' | 'no-device-sync' | 'proxy-upstream-down'

function isProxyUpstreamDownPayload(payload: unknown): boolean {
  return Boolean(
    payload &&
      typeof payload === 'object' &&
      (payload as { __proxyUpstreamDown?: boolean }).__proxyUpstreamDown === true,
  )
}

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
  const timer = setTimeout(
    () => ctrl.abort(),
    localNetworkRequestTimeoutMs(`${origin}/health`),
  )
  try {
    const health =
      (await probeJson(`${origin}/health`, ctrl.signal)) ??
      (await probeJson(`${origin}/api/v1/health`, ctrl.signal))
    if (!health) return 'miss'
    if (isProxyUpstreamDownPayload(health)) return 'proxy-upstream-down'
    if (isReachableSyncEndpointHealth(health)) {
      if (isForeignDesktopSyncHub(health, localIdentityId)) return 'foreign'
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
  options?: { noDeviceSyncUrl?: string | null; proxyUpstreamDown?: boolean },
): string {
  if (options?.proxyUpstreamDown) {
    return (
      '网页同源代理无法连接官方社区 Hub（上游不可达）。' +
      '这不影响真机局域网同步。请用手机 + 配对令牌，或完成设备配对后走点到点/加密投递；' +
      '若需明文跨网镜像，请自行部署 Hub 并配置 COMMUNITY_HUB_UPSTREAM。'
    )
  }
  if (options?.noDeviceSyncUrl) {
    return `已连接到社区 Hub（${options.noDeviceSyncUrl}），但未开启跨网同步（device_sync）。可忽略并改用局域网/设备配对；或升级部署官方 Hub。`
  }
  const list = tried.length > 0 ? tried.join('、') : DEFAULT_LOCAL_SYNC_BASE_URL
  const hostedHint =
    '请先启动本机桌面端，并在浏览器弹出的本地网络权限中选择允许（建议 Chrome / Edge）。手机请开局域网访问并填写 4 位配对码。'
  const localHint =
    '请确认桌面端已开启同步。本机预览一般无需配对码；手机请开局域网访问并填写配对码。'
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
  await primeLocalNetworkAccess()
  if (
    cachedSyncBaseUrl &&
    uniqueCandidates.includes(cachedSyncBaseUrl) &&
    (await probeSyncBaseUrl(cachedSyncBaseUrl, localIdentityId))
  ) {
    return cachedSyncBaseUrl
  }
  let foreignUrl: string | null = null
  let noDeviceSyncUrl: string | null = null
  let proxyUpstreamDown = false
  for (const url of uniqueCandidates) {
    const kind = await classifySyncBaseUrl(url, localIdentityId)
    if (kind === 'ok') {
      cachedSyncBaseUrl = url
      return url
    }
    if (kind === 'foreign' && !foreignUrl) foreignUrl = url
    if (kind === 'no-device-sync' && !noDeviceSyncUrl) noDeviceSyncUrl = url
    if (kind === 'proxy-upstream-down') proxyUpstreamDown = true
  }
  if (foreignUrl) {
    cachedSyncBaseUrl = null
    throw new ForeignSyncHubError(foreignUrl)
  }
  throw new Error(
    unreachableSyncHubMessage(uniqueCandidates, { noDeviceSyncUrl, proxyUpstreamDown }),
  )
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
