import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CommunityHubConfigSchema,
  hostnameOfBaseUrl,
  isOfficialCommunityHubHost,
  normalizeCommunityHubBaseUrl,
  type CommunityHubConfig,
  type CommunityHubMode,
} from '@toolman/shared'

import { getCommunityDataDir } from './community-paths'

function getHubConfigPath(): string {
  const dir = getCommunityDataDir()
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return join(dir, 'hub.json')
}

function isOfficialHubUrl(url?: string): boolean {
  if (!url?.trim()) return false
  return isOfficialCommunityHubHost(hostnameOfBaseUrl(url))
}

/** Community edition is P2P federation — never seed or keep hub.toolman.app. */
export function sanitizeCommunityHubConfig(config: CommunityHubConfig): CommunityHubConfig {
  const peers = (config.peers ?? []).filter((url) => !isOfficialHubUrl(url))
  const upstream = isOfficialHubUrl(config.upstream) ? undefined : config.upstream
  const baseUrl = isOfficialHubUrl(config.baseUrl) ? undefined : config.baseUrl
  const mode: CommunityHubMode = config.mode === 'remote' && !baseUrl ? 'local' : config.mode
  return CommunityHubConfigSchema.parse({
    mode,
    federation: config.federation ?? { enabled: true },
    ...(baseUrl ? { baseUrl } : {}),
    ...(upstream ? { upstream } : {}),
    ...(peers.length > 0 ? { peers } : {}),
  })
}

function defaultHubConfig(): CommunityHubConfig {
  return {
    mode: 'local',
    federation: { enabled: true },
  }
}

function resolveEnvHubConfig(): CommunityHubConfig | null {
  const baseUrl = process.env['TOOLMAN_COMMUNITY_HUB_URL']?.trim()
  if (baseUrl && !isOfficialHubUrl(baseUrl)) {
    return {
      mode: 'remote',
      baseUrl: normalizeCommunityHubBaseUrl(baseUrl),
    }
  }

  const mode = process.env['TOOLMAN_COMMUNITY_HUB_MODE']?.trim().toLowerCase()
  if (mode === 'local') {
    return { mode: 'local' }
  }

  return null
}

export function readCommunityHubConfig(): CommunityHubConfig {
  const envConfig = resolveEnvHubConfig()
  if (envConfig) return sanitizeCommunityHubConfig(envConfig)

  const path = getHubConfigPath()
  if (!existsSync(path)) {
    return defaultHubConfig()
  }

  try {
    return sanitizeCommunityHubConfig(
      CommunityHubConfigSchema.parse(JSON.parse(readFileSync(path, 'utf8'))),
    )
  } catch {
    return defaultHubConfig()
  }
}

export function writeCommunityHubConfig(config: CommunityHubConfig): CommunityHubConfig {
  const parsed = sanitizeCommunityHubConfig(CommunityHubConfigSchema.parse(config))
  writeFileSync(getHubConfigPath(), JSON.stringify(parsed, null, 2), 'utf8')
  return parsed
}

export function ensureDefaultCommunityHubConfig(): CommunityHubConfig {
  if (resolveEnvHubConfig()) {
    return readCommunityHubConfig()
  }
  const path = getHubConfigPath()
  if (!existsSync(path)) {
    return writeCommunityHubConfig(defaultHubConfig())
  }
  const current = readCommunityHubConfig()
  try {
    const raw = CommunityHubConfigSchema.parse(JSON.parse(readFileSync(path, 'utf8')))
    if (JSON.stringify(raw) !== JSON.stringify(current)) {
      return writeCommunityHubConfig(current)
    }
  } catch {
    return writeCommunityHubConfig(current)
  }
  return current
}

export function getCommunityHubMode(): CommunityHubMode {
  return readCommunityHubConfig().mode
}

export function resolveCommunityHubBaseUrl(config = readCommunityHubConfig()): string | null {
  if (config.mode !== 'remote' || !config.baseUrl) return null
  const normalized = normalizeCommunityHubBaseUrl(config.baseUrl)
  return isOfficialHubUrl(normalized) ? null : normalized
}

export function isCommunityHubConfigEditable(): boolean {
  return resolveEnvHubConfig() === null
}
