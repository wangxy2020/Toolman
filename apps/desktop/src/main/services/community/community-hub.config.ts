import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CommunityHubConfigSchema,
  OFFICIAL_TOOLMAN_HUB_URL,
  normalizeCommunityHubBaseUrl,
  type CommunityHubConfig,
  type CommunityHubMode,
} from '@toolman/shared'

function getHubConfigPath(): string {
  const dir = join(app.getPath('userData'), 'community')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return join(dir, 'hub.json')
}

function defaultHubConfig(): CommunityHubConfig {
  if (app.isPackaged) {
    return {
      mode: 'remote',
      baseUrl: OFFICIAL_TOOLMAN_HUB_URL,
    }
  }
  return { mode: 'local' }
}

function resolveEnvHubConfig(): CommunityHubConfig | null {
  const baseUrl = process.env['TOOLMAN_COMMUNITY_HUB_URL']?.trim()
  if (baseUrl) {
    return {
      mode: 'remote',
      baseUrl: normalizeCommunityHubBaseUrl(baseUrl),
    }
  }

  const mode = process.env['TOOLMAN_COMMUNITY_HUB_MODE']?.trim().toLowerCase()
  if (mode === 'remote') {
    return {
      mode: 'remote',
      baseUrl: OFFICIAL_TOOLMAN_HUB_URL,
    }
  }
  if (mode === 'local') {
    return { mode: 'local' }
  }

  return null
}

export function readCommunityHubConfig(): CommunityHubConfig {
  const envConfig = resolveEnvHubConfig()
  if (envConfig) return envConfig

  const path = getHubConfigPath()
  if (!existsSync(path)) {
    return defaultHubConfig()
  }

  try {
    return CommunityHubConfigSchema.parse(JSON.parse(readFileSync(path, 'utf8')))
  } catch {
    return defaultHubConfig()
  }
}

export function writeCommunityHubConfig(config: CommunityHubConfig): CommunityHubConfig {
  const parsed = CommunityHubConfigSchema.parse(config)
  writeFileSync(getHubConfigPath(), JSON.stringify(parsed, null, 2), 'utf8')
  return parsed
}

export function ensureDefaultCommunityHubConfig(): CommunityHubConfig {
  const path = getHubConfigPath()
  if (existsSync(path) || resolveEnvHubConfig()) {
    return readCommunityHubConfig()
  }
  return writeCommunityHubConfig(defaultHubConfig())
}

export function getCommunityHubMode(): CommunityHubMode {
  return readCommunityHubConfig().mode
}

export function resolveCommunityHubBaseUrl(config = readCommunityHubConfig()): string | null {
  if (config.mode !== 'remote') return null
  return normalizeCommunityHubBaseUrl(config.baseUrl ?? OFFICIAL_TOOLMAN_HUB_URL)
}
