import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { P2pLibp2pConfigSchema, type P2pLibp2pConfig } from '@toolman/shared'

const DEFAULT_CONFIG: P2pLibp2pConfig = {
  mdnsEnabled: true,
  dhtMode: 'client',
  bootstrapMultiaddrs: [],
}

function getConfigPath(): string {
  const dir = join(app.getPath('userData'), 'p2p')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return join(dir, 'libp2p.json')
}

export function readLibp2pConfig(): P2pLibp2pConfig {
  const path = getConfigPath()
  if (!existsSync(path)) {
    return { ...DEFAULT_CONFIG }
  }

  try {
    const raw = readFileSync(path, 'utf8')
    return P2pLibp2pConfigSchema.parse(JSON.parse(raw))
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export function writeLibp2pConfig(config: P2pLibp2pConfig): P2pLibp2pConfig {
  const parsed = P2pLibp2pConfigSchema.parse(config)
  writeFileSync(getConfigPath(), JSON.stringify(parsed, null, 2), 'utf8')
  return parsed
}

export function ensureDefaultLibp2pConfig(): P2pLibp2pConfig {
  const path = getConfigPath()
  if (existsSync(path)) {
    return readLibp2pConfig()
  }
  return writeLibp2pConfig(DEFAULT_CONFIG)
}
