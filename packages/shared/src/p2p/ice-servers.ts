import { z } from 'zod'

export const P2pIceServerSchema = z.object({
  urls: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
  username: z.string().min(1).optional(),
  credential: z.string().min(1).optional(),
})
export type P2pIceServer = z.infer<typeof P2pIceServerSchema>

export const P2pIceServerListSchema = z.array(P2pIceServerSchema)

export const P2pNetworkIceConfigSchema = z.object({
  /** @deprecated Prefer `iceServers`. Kept for existing `network.json` files. */
  stunServers: z.array(z.string().min(1)).optional(),
  iceServers: P2pIceServerListSchema.optional(),
})
export type P2pNetworkIceConfig = z.infer<typeof P2pNetworkIceConfigSchema>

export const DEFAULT_STUN_URLS = ['stun:stun.l.google.com:19302'] as const

export function normalizeIceServerUrls(urls: P2pIceServer['urls']): string[] {
  return (Array.isArray(urls) ? urls : [urls]).map((item) => item.trim()).filter(Boolean)
}

export function isTurnIceServer(server: P2pIceServer): boolean {
  return normalizeIceServerUrls(server.urls).some((url) => /^turn:/i.test(url) || /^turns:/i.test(url))
}

export function isStunIceServer(server: P2pIceServer): boolean {
  return normalizeIceServerUrls(server.urls).every(
    (url) => /^stun:/i.test(url) || /^stuns:/i.test(url),
  )
}

/** Merge legacy STUN-only config with structured ICE entries (dedupe by first URL). */
export function resolveP2pIceServers(config: P2pNetworkIceConfig): P2pIceServer[] {
  const fromStructured = (config.iceServers ?? []).map((item) => P2pIceServerSchema.parse(item))
  if (fromStructured.length > 0) {
    return fromStructured
  }

  const legacyStun = config.stunServers?.length ? config.stunServers : [...DEFAULT_STUN_URLS]
  return legacyStun.map((url) => ({ urls: url.trim() }))
}

export function summarizeIceServers(servers: readonly P2pIceServer[]): {
  stunCount: number
  turnCount: number
  turnWithCredentials: number
  summary: string
} {
  let stunCount = 0
  let turnCount = 0
  let turnWithCredentials = 0

  for (const server of servers) {
    if (isTurnIceServer(server)) {
      turnCount += 1
      if (server.username && server.credential) {
        turnWithCredentials += 1
      }
    } else if (isStunIceServer(server)) {
      stunCount += 1
    } else {
      stunCount += 1
    }
  }

  const parts: string[] = []
  if (stunCount > 0) parts.push(`${stunCount} STUN`)
  if (turnCount > 0) {
    parts.push(
      turnWithCredentials > 0
        ? `${turnCount} TURN（凭据已配置）`
        : `${turnCount} TURN（无凭据）`,
    )
  }

  return {
    stunCount,
    turnCount,
    turnWithCredentials,
    summary: parts.length > 0 ? parts.join(' · ') : '未配置',
  }
}

export function redactIceServersForDisplay(servers: readonly P2pIceServer[]): string[] {
  return servers.map((server) => {
    const urls = normalizeIceServerUrls(server.urls).join(', ')
    const hasAuth = Boolean(server.username && server.credential)
    if (isTurnIceServer(server)) {
      return hasAuth ? `${urls} (TURN · auth)` : `${urls} (TURN · no auth)`
    }
    return urls
  })
}
