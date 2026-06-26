import { app } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

export const COMMUNITY_HUB_DEFAULT_PORT = 3721
export const COMMUNITY_HUB_HOST = '127.0.0.1'
export const COMMUNITY_HUB_IDENTITY_ID = '00000000-0000-0000-0000-000000000001'
export const COMMUNITY_HUB_HEADER = 'x-community-user-id'

const BINARY_NAME =
  process.platform === 'win32' ? 'toolman-community-hub.exe' : 'toolman-community-hub'

export function getCommunityDataDir(): string {
  const override = process.env.TOOLMAN_COMMUNITY_DATA_DIR?.trim()
  if (override) {
    return override
  }
  return join(app.getPath('userData'), 'community')
}

export function getCommunityHubPortFilePath(): string {
  return join(getCommunityDataDir(), 'hub.port')
}

export function resolveCommunityHubBinaryPath(): string | null {
  const resourceCandidates =
    typeof process.resourcesPath === 'string' && process.resourcesPath.length > 0
      ? [join(process.resourcesPath, 'bin', BINARY_NAME)]
      : []

  const candidates = [
    ...resourceCandidates,
    join(__dirname, '..', '..', '..', 'bin', BINARY_NAME),
    join(__dirname, '..', '..', '..', '..', 'bin', BINARY_NAME),
    join(process.cwd(), 'apps', 'desktop', 'bin', BINARY_NAME),
    join(process.cwd(), 'bin', BINARY_NAME),
    join(process.cwd(), 'target', 'release', BINARY_NAME),
    join(process.cwd(), 'target', 'debug', BINARY_NAME),
    join(process.cwd(), '..', '..', 'target', 'release', BINARY_NAME),
    join(process.cwd(), '..', '..', 'target', 'debug', BINARY_NAME),
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate
    }
  }

  return null
}

export function buildCommunityHubBaseUrl(port: number, host = COMMUNITY_HUB_HOST): string {
  return `http://${host}:${port}`
}
