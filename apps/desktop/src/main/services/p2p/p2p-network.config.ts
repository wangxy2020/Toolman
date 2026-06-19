import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { P2pBridge } from './p2p-bridge'

const DEFAULT_STUN_SERVERS = ['stun:stun.l.google.com:19302']

interface P2pNetworkConfig {
  stunServers: string[]
}

function getConfigPath(): string {
  const dir = join(app.getPath('userData'), 'p2p')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return join(dir, 'network.json')
}

function readConfig(): P2pNetworkConfig {
  const path = getConfigPath()
  if (!existsSync(path)) {
    return { stunServers: [...DEFAULT_STUN_SERVERS] }
  }
  try {
    const raw = readFileSync(path, 'utf8')
    const parsed = JSON.parse(raw) as Partial<P2pNetworkConfig>
    const servers = Array.isArray(parsed.stunServers)
      ? parsed.stunServers.filter((item) => typeof item === 'string' && item.trim().length > 0)
      : []
    return {
      stunServers: servers.length > 0 ? servers : [...DEFAULT_STUN_SERVERS],
    }
  } catch {
    return { stunServers: [...DEFAULT_STUN_SERVERS] }
  }
}

function writeConfig(config: P2pNetworkConfig): void {
  writeFileSync(getConfigPath(), JSON.stringify(config, null, 2), 'utf8')
}

export function getP2pStunServers(): string[] {
  return readConfig().stunServers
}

export function setP2pStunServers(stunServers: string[]): string[] {
  const normalized = stunServers
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
  const next = normalized.length > 0 ? normalized : [...DEFAULT_STUN_SERVERS]
  writeConfig({ stunServers: next })
  return next
}

export function applyP2pNetworkConfig(): void {
  if (!P2pBridge.isAvailable()) return
  P2pBridge.connectionSetStunServers(getP2pStunServers())
}
