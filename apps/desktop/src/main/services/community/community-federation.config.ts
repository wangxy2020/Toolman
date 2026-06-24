import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

import { CommunityFederationConfigSchema, type CommunityFederationConfig } from '@toolman/shared'

const DEFAULT_CONFIG: CommunityFederationConfig = {
  federationEnabled: true,
  syncIntervalMs: 60_000,
  peerTimeoutMs: 15_000,
}

function getConfigPath(): string {
  const dir = join(app.getPath('userData'), 'community')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return join(dir, 'federation.json')
}

export function readCommunityFederationConfig(): CommunityFederationConfig {
  const path = getConfigPath()
  if (!existsSync(path)) {
    return { ...DEFAULT_CONFIG }
  }
  try {
    return CommunityFederationConfigSchema.parse(JSON.parse(readFileSync(path, 'utf8')))
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export function writeCommunityFederationConfig(
  config: CommunityFederationConfig,
): CommunityFederationConfig {
  const parsed = CommunityFederationConfigSchema.parse(config)
  writeFileSync(getConfigPath(), JSON.stringify(parsed, null, 2), 'utf8')
  return parsed
}

export function isCommunityFederationEnabled(): boolean {
  return readCommunityFederationConfig().federationEnabled
}

export function ensureDefaultCommunityFederationConfig(): CommunityFederationConfig {
  const path = getConfigPath()
  if (existsSync(path)) {
    return readCommunityFederationConfig()
  }
  return writeCommunityFederationConfig(DEFAULT_CONFIG)
}
