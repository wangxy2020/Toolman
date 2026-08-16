import { OFFICIAL_TOOLMAN_HUB_URL } from '../community/hub-config.js'

export const DEFAULT_LOCAL_SYNC_PORT = 17890
export const DEFAULT_LOCAL_SYNC_BASE_URL = `http://127.0.0.1:${DEFAULT_LOCAL_SYNC_PORT}`
/** Identity string returned by the desktop Sync Hub `/health` endpoint. */
export const SYNC_HUB_SERVICE_NAME = 'toolman-sync-hub'
/** Pairing token for desktop Sync Hub. Prefer this over a community JWT. */
export const SYNC_HUB_TOKEN_HEADER = 'X-Toolman-Sync-Token'
export const DEFAULT_LOCAL_COMMUNITY_HUB_PORT = 3721
export const DEFAULT_LOCAL_COMMUNITY_HUB_BASE_URL = `http://127.0.0.1:${DEFAULT_LOCAL_COMMUNITY_HUB_PORT}`
/** Matches desktop `DEFAULT_LOCAL_IDENTITY_ID` / hub seed identity. */
export const DEFAULT_LOCAL_SYNC_IDENTITY_ID = '00000000-0000-0000-0000-000000000001'

export function normalizeSyncBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '')
}

function uniqueUrls(urls: Array<string | null | undefined>): string[] {
  const out: string[] = []
  for (const raw of urls) {
    const url = raw ? normalizeSyncBaseUrl(raw) : ''
    if (url && !out.includes(url)) out.push(url)
  }
  return out
}

export function hostnameOfBaseUrl(baseUrl: string): string {
  try {
    return new URL(baseUrl).hostname
  } catch {
    return ''
  }
}

export function isLoopbackHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase()
  return host === '127.0.0.1' || host === 'localhost' || host === '::1' || host === '[::1]'
}

/** LAN / Tailscale / emulator hosts that may run the desktop sidecar. Public DNS names are not. */
export function isPrivateOrLoopbackHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase()
  if (!host) return false
  if (isLoopbackHostname(host)) return true
  if (host === '10.0.2.2') return true
  if (host.endsWith('.local')) return true
  if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(host)) return false
  const [a, b] = host.split('.').map((part) => Number(part))
  if (a === 10) return true
  if (a === 192 && b === 168) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  return false
}

export function isOfficialCommunityHubHost(hostname: string): boolean {
  return hostname.trim().toLowerCase() === 'hub.toolman.app'
}

/** Parse `192.168.1.8:8081`, `http://10.0.0.4:3721/`, or a bare hostname. */
export function hostnameFromHostOrUrl(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  try {
    const url = new URL(trimmed.includes('://') ? trimmed : `http://${trimmed}`)
    return url.hostname || null
  } catch {
    return null
  }
}

/** True when JSON is the desktop Sync Hub `/health` body (not Community Hub). */
export function isSyncHubHealthPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false
  const rec = payload as Record<string, unknown>
  return rec.service === SYNC_HUB_SERVICE_NAME && rec.status === 'ok'
}

/** Desktop Sync Hub `/health` may advertise the signed-in desktop identity. */
export function syncHubHealthIdentityId(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const rec = asHealthRecord(payload) ?? (payload as Record<string, unknown>)
  const identityId = rec.identityId
  return typeof identityId === 'string' && identityId.trim() ? identityId.trim() : null
}

/** Private notes / knowledge / classroom must not cross accounts. */
export function isForeignSyncIdentity(
  hubIdentityId?: string | null,
  localIdentityId?: string | null,
): boolean {
  const hub = hubIdentityId?.trim() ?? ''
  const local = localIdentityId?.trim() ?? ''
  return hub.length > 0 && local.length > 0 && hub !== local
}

function asHealthRecord(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== 'object') return null
  const rec = payload as Record<string, unknown>
  if (rec.data && typeof rec.data === 'object') return rec.data as Record<string, unknown>
  return rec
}

/** Community Hub `/health` when private device-sync fallback is enabled. */
export function isCommunityDeviceSyncHealthPayload(payload: unknown): boolean {
  const data = asHealthRecord(payload)
  if (!data) return false
  return data.device_sync === true && (data.status === 'healthy' || data.status === 'ok')
}

/** Community Hub `/health` when the encrypted workspace mailbox is enabled. */
export function isCommunityMailboxHealthPayload(payload: unknown): boolean {
  const data = asHealthRecord(payload)
  if (!data) return false
  return data.workspace_mailbox === true && (data.status === 'healthy' || data.status === 'ok')
}

export function isReachableSyncEndpointHealth(payload: unknown): boolean {
  return isSyncHubHealthPayload(payload) || isCommunityDeviceSyncHealthPayload(payload)
}

/**
 * True when JSON is the desktop Sync Hub `/api/v1/sync/hosts` body.
 * Community Hub wraps catalog replies as `{ ok, data }` and must not match.
 */
export function isSyncHubHostsPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false
  const rec = payload as Record<string, unknown>
  if ('ok' in rec && 'data' in rec && !('hosts' in rec)) return false
  return Array.isArray(rec.hosts)
}

export function siblingHttpOrigin(baseUrl: string, port: number): string | null {
  try {
    const url = new URL(baseUrl)
    if (!url.hostname) return null
    url.protocol = 'http:'
    url.port = String(port)
    url.pathname = ''
    url.search = ''
    url.hash = ''
    return url.origin
  } catch {
    return null
  }
}

/** Community Hub URLs to probe: user setting, Expo/LAN desktop host, local sidecar, then official Hub. */
export function listCommunityHubProbeCandidates(
  configured?: string | null,
  options?: {
    packagerHostnames?: Array<string | null | undefined>
    includeLoopback?: boolean
  },
): string[] {
  const fromPackager = (options?.packagerHostnames ?? [])
    .map((value) => (value ? hostnameFromHostOrUrl(value) : null))
    .filter(
      (host): host is string =>
        host != null && !isOfficialCommunityHubHost(host) && isPrivateOrLoopbackHostname(host),
    )
    .map((host) => siblingHttpOrigin(`http://${host}`, DEFAULT_LOCAL_COMMUNITY_HUB_PORT))
  const includeLoopback = options?.includeLoopback !== false

  return uniqueUrls([
    configured,
    ...fromPackager,
    includeLoopback ? `http://localhost:${DEFAULT_LOCAL_COMMUNITY_HUB_PORT}` : null,
    includeLoopback ? DEFAULT_LOCAL_COMMUNITY_HUB_BASE_URL : null,
    OFFICIAL_TOOLMAN_HUB_URL,
  ])
}

function syncOriginForHostname(hostname: string): string | null {
  const host = hostname.trim()
  if (!host || isOfficialCommunityHubHost(host) || !isPrivateOrLoopbackHostname(host)) return null
  return siblingHttpOrigin(`http://${host}`, DEFAULT_LOCAL_SYNC_PORT)
}

function isLoopbackOrigin(url: string | null | undefined): boolean {
  return Boolean(url && isLoopbackHostname(hostnameOfBaseUrl(url)))
}

/**
 * Sync Hub URLs to probe for desktop ↔ mobile classroom/notes (the user's own
 * desktop node, not Community Hub). A configured community Hub host is only
 * used to derive the sibling `:17890` address on LAN / Tailscale.
 */
export function listSyncBaseUrlCandidates(options?: {
  configuredSyncBaseUrl?: string | null
  communityHubBaseUrl?: string | null
  envSyncBaseUrl?: string | null
  packagerHostnames?: Array<string | null | undefined>
  includeLoopback?: boolean
}): string[] {
  const community = options?.communityHubBaseUrl
    ? normalizeSyncBaseUrl(options.communityHubBaseUrl)
    : ''
  const communityHost = community ? hostnameOfBaseUrl(community) : ''
  const lanSync =
    community && communityHost && !isOfficialCommunityHubHost(communityHost)
      ? siblingHttpOrigin(community, DEFAULT_LOCAL_SYNC_PORT)
      : null
  const fromPackager = (options?.packagerHostnames ?? [])
    .map((value) => (value ? hostnameFromHostOrUrl(value) : null))
    .map((host) => (host ? syncOriginForHostname(host) : null))
  const packagerLan = fromPackager.filter((url) => url && !isLoopbackOrigin(url))
  const packagerLoopback = fromPackager.filter((url) => url && isLoopbackOrigin(url))
  const communityLan = lanSync && !isLoopbackOrigin(lanSync) ? lanSync : null
  const includeLoopback = options?.includeLoopback !== false
  const wanCommunityHub =
    community &&
    (isOfficialCommunityHubHost(communityHost) || /^https:/i.test(community))
      ? community
      : null

  return uniqueUrls([
    options?.configuredSyncBaseUrl,
    options?.envSyncBaseUrl,
    ...packagerLan,
    communityLan,
    ...packagerLoopback,
    includeLoopback ? DEFAULT_LOCAL_SYNC_BASE_URL : null,
    includeLoopback ? `http://localhost:${DEFAULT_LOCAL_SYNC_PORT}` : null,
    wanCommunityHub,
    OFFICIAL_TOOLMAN_HUB_URL,
  ])
}
