import { app } from 'electron'
import { logStructured } from '../structured-log.service'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { toErrorMessage } from '@toolman/shared'
import { join } from 'node:path'
import {P2pIceServerListSchema,
  P2pNetworkIceConfigSchema,
  P2pXirsysConfigSchema,
  isTurnIceServer,
  resolveP2pIceServers,
  summarizeIceServers,
  type P2pIceServer,
  type P2pXirsysConfig } from '@toolman/shared'
import { P2pBridge } from './p2p-bridge'
import { recordDiagnosticEvent } from '../diagnostics-log'
import { fetchXirsysIceServers } from './p2p-xirsys.service'

let runtimeIceServersOverride: P2pIceServer[] | null = null

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

function readXirsysConfigFromEnv(): P2pXirsysConfig | null {
  const ident = process.env.TOOLMAN_P2P_XIRSYS_IDENT?.trim()
  const secret = process.env.TOOLMAN_P2P_XIRSYS_SECRET?.trim()
  const channel = process.env.TOOLMAN_P2P_XIRSYS_CHANNEL?.trim()
  if (!ident || !secret || !channel) {
    return null
  }

  const parsed = P2pXirsysConfigSchema.safeParse({
    path: process.env.TOOLMAN_P2P_XIRSYS_PATH?.trim() || 'https://global.xirsys.net',
    ident,
    secret,
    channel,
  })
  return parsed.success ? parsed.data : null
}

function readXirsysConfigFromFile(): P2pXirsysConfig | null {
  const parsed = P2pNetworkIceConfigSchema.safeParse(readRawConfig())
  if (!parsed.success || !parsed.data.xirsys) {
    return null
  }
  const result = P2pXirsysConfigSchema.safeParse(parsed.data.xirsys)
  return result.success ? result.data : null
}

function resolveXirsysConfig(): P2pXirsysConfig | null {
  return readXirsysConfigFromEnv() ?? readXirsysConfigFromFile()
}

export async function bootstrapP2pIceServers(): Promise<boolean> {
  const xirsys = resolveXirsysConfig()
  if (!xirsys) {
    return false
  }

  const servers = await fetchXirsysIceServers(xirsys)
  runtimeIceServersOverride = servers
  writeNetworkConfig(servers, xirsys)
  resetWanReadinessLogDedup()
  logStructured(
    'p2p',
    'info',
    `loaded ICE servers from Xirsys (${summarizeIceServers(servers).summary})`,
  )
  return true
}

export function clearRuntimeIceServersOverrideForTests(): void {
  runtimeIceServersOverride = null
}

export function getP2pIceServers(): P2pIceServer[] {
  if (runtimeIceServersOverride) {
    return runtimeIceServersOverride
  }
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

function resolveXirsysConfigForPersistence(): P2pXirsysConfig | null {
  return readXirsysConfigFromEnv() ?? readXirsysConfigFromFile()
}

function writeNetworkConfig(iceServers: P2pIceServer[], xirsys?: P2pXirsysConfig | null): P2pIceServer[] {
  const normalized = P2pIceServerListSchema.parse(iceServers)
  const xirsysConfig = xirsys ?? resolveXirsysConfigForPersistence()
  const payload: Record<string, unknown> = {
    iceServers: normalized,
    stunServers: normalized
      .flatMap((server) => (Array.isArray(server.urls) ? server.urls : [server.urls]))
      .filter((url) => /^stun:/i.test(url)),
  }
  if (xirsysConfig) {
    payload.xirsys = xirsysConfig
  }
  writeFileSync(getConfigPath(), JSON.stringify(payload, null, 2), 'utf8')
  return normalized
}

function writeFileIceServers(iceServers: P2pIceServer[]): P2pIceServer[] {
  return writeNetworkConfig(iceServers)
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
  reasonCode?: 'turn_not_configured' | 'turn_missing_credentials'
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
      reasonCode: 'turn_not_configured',
      reason: 'TURN server not configured; WAN collaboration may fail',
    }
  }

  if (!turnWithCredentials) {
    return {
      ready: false,
      summary: summary.summary,
      reasonCode: 'turn_missing_credentials',
      reason: 'TURN server is missing credentials',
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
