import { app } from 'electron'
import { logStructured } from '../structured-log.service'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { toErrorMessage } from '@toolman/shared'
import { join } from 'node:path'
import {P2pIceServerListSchema,
  P2pNetworkIceConfigSchema,
  isTurnIceServer,
  resolveP2pIceServers,
  summarizeIceServers,
  type P2pIceServer } from '@toolman/shared'
import { P2pBridge } from './p2p-bridge'
import { recordDiagnosticEvent } from '../diagnostics-log'

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
    const message = toErrorMessage(error, String(error))
    logStructured('p2p', 'warn', `invalid TOOLMAN_P2P_ICE_SERVERS / TURN env: ${message}`)
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
  resetWanReadinessLogDedup()
  return getP2pStunServers()
}

export function setP2pIceServers(iceServers: P2pIceServer[]): P2pIceServer[] {
  resetWanReadinessLogDedup()
  return writeFileIceServers(iceServers)
}

export function getP2pWanNetworkReadiness(): {
  ready: boolean
  summary: string
  reason?: string
} {
  const servers = getP2pIceServers()
  const summary = summarizeIceServers(servers)
  const hasTurn = servers.some((server) => isTurnIceServer(server))
  const turnWithCredentials = servers.some(
    (server) => isTurnIceServer(server) && server.username && server.credential,
  )

  if (!hasTurn) {
    return {
      ready: false,
      summary: summary.summary,
      reason: '未配置 TURN 服务器，广域网协作可能失败',
    }
  }

  if (!turnWithCredentials) {
    return {
      ready: false,
      summary: summary.summary,
      reason: 'TURN 服务器缺少凭据',
    }
  }

  return { ready: true, summary: summary.summary }
}

let lastWanReadinessLogKey: string | null = null

function resetWanReadinessLogDedup(): void {
  lastWanReadinessLogKey = null
}

/** @internal */
export function resetP2pNetworkLogDedupForTests(): void {
  resetWanReadinessLogDedup()
}

export function applyP2pNetworkConfig(): void {
  if (!P2pBridge.isAvailable()) return
  const servers = getP2pIceServers()
  P2pBridge.connectionSetIceServers(servers)

  const readiness = getP2pWanNetworkReadiness()
  if (!readiness.ready) {
    const logKey = `${readiness.reason ?? 'unknown'}|${readiness.summary}`
    if (logKey === lastWanReadinessLogKey) return
    lastWanReadinessLogKey = logKey

    const level = app.isPackaged ? 'error' : 'warn'
    recordDiagnosticEvent('p2p-network', level, readiness.reason ?? 'WAN network not ready')
    if (app.isPackaged) {
      logStructured('p2p', 'error', `${readiness.reason} (${readiness.summary})`)
    } else {
      logStructured('p2p', 'warn', `${readiness.reason} (${readiness.summary})`)
    }
    return
  }

  lastWanReadinessLogKey = null
}
