import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import {
  P2pIceServerListSchema,
  P2pNetworkIceConfigSchema,
  resolveP2pIceServers,
  type P2pIceServer,
} from '@toolman/shared'
import { P2pBridge } from './p2p-bridge'

function getConfigPath(): string {
  const dir = join(app.getPath('userData'), 'p2p')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return join(dir, 'network.json')
}

function readRawConfig(): Record<string, unknown> {
  const path = getConfigPath()
  if (!existsSync(path)) {
    return {}
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
  } catch {
    return {}
  }
}

function readFileConfig(): P2pIceServer[] {
  const parsed = P2pNetworkIceConfigSchema.safeParse(readRawConfig())
  if (!parsed.success) {
    return resolveP2pIceServers({})
  }
  return resolveP2pIceServers(parsed.data)
}

function parseIceServersFromEnv(): P2pIceServer[] | null {
  const json = process.env.TOOLMAN_P2P_ICE_SERVERS?.trim()
  if (json) {
    const parsed = JSON.parse(json) as unknown
    return P2pIceServerListSchema.parse(parsed)
  }

  const turnUrl = process.env.TOOLMAN_P2P_TURN_URL?.trim()
  if (!turnUrl) {
    return null
  }

  const stunFromEnv = process.env.TOOLMAN_P2P_STUN_SERVERS?.split(',')
    .map((item) => item.trim())
    .filter(Boolean)

  const servers: P2pIceServer[] = (stunFromEnv?.length ? stunFromEnv : ['stun:stun.l.google.com:19302']).map(
    (urls) => ({ urls }),
  )

  servers.push({
    urls: turnUrl.includes(',') ? turnUrl.split(',').map((item) => item.trim()) : turnUrl,
    username: process.env.TOOLMAN_P2P_TURN_USERNAME?.trim() || undefined,
    credential: process.env.TOOLMAN_P2P_TURN_CREDENTIAL?.trim() || undefined,
  })

  return servers
}

export function getP2pIceServers(): P2pIceServer[] {
  try {
    const fromEnv = parseIceServersFromEnv()
    if (fromEnv) {
      return fromEnv
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`[p2p] invalid TOOLMAN_P2P_ICE_SERVERS / TURN env: ${message}`)
  }
  return readFileConfig()
}

/** Legacy STUN URL list (IPC compat). */
export function getP2pStunServers(): string[] {
  return getP2pIceServers()
    .flatMap((server) => (Array.isArray(server.urls) ? server.urls : [server.urls]))
    .filter((url) => /^stun:/i.test(url))
}

function writeFileIceServers(iceServers: P2pIceServer[]): P2pIceServer[] {
  const normalized = P2pIceServerListSchema.parse(iceServers)
  writeFileSync(
    getConfigPath(),
    JSON.stringify(
      {
        iceServers: normalized,
        stunServers: normalized
          .flatMap((server) => (Array.isArray(server.urls) ? server.urls : [server.urls]))
          .filter((url) => /^stun:/i.test(url)),
      },
      null,
      2,
    ),
    'utf8',
  )
  return normalized
}

export function setP2pStunServers(stunServers: string[]): string[] {
  const normalized = stunServers.map((item) => item.trim()).filter(Boolean)
  writeFileIceServers(
    normalized.length > 0
      ? normalized.map((urls) => ({ urls }))
      : [{ urls: 'stun:stun.l.google.com:19302' }],
  )
  return getP2pStunServers()
}

export function setP2pIceServers(iceServers: P2pIceServer[]): P2pIceServer[] {
  return writeFileIceServers(iceServers)
}

export function applyP2pNetworkConfig(): void {
  if (!P2pBridge.isAvailable()) return
  const servers = getP2pIceServers()
  P2pBridge.connectionSetIceServers(servers)
}
