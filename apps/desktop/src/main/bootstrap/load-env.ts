import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ENV_FILE_NAMES = ['.env', '.env.local', 'release.env'] as const

const PACKAGED_FORBIDDEN_DEV_ENV_PATTERN =
  /^(TOOLMAN_.*_DEV_MODE|TOOLMAN_BILLING_MOCK|TENCENT_SMS_DEV_MODE|WECHAT_DEV_MODE)$/

function parseEnvFile(content: string): Record<string, string> {
  const values: Record<string, string> = {}

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const separatorIndex = line.indexOf('=')
    if (separatorIndex <= 0) continue

    const key = line.slice(0, separatorIndex).trim()
    if (!key) continue

    let value = line.slice(separatorIndex + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    values[key] = value
  }

  return values
}

function applyEnvFile(filePath: string): void {
  const parsed = parseEnvFile(readFileSync(filePath, 'utf8'))
  for (const [key, value] of Object.entries(parsed)) {
    if (!shouldLoadReleaseEnvKey(key, filePath)) continue
    if (process.env[key] === undefined) {
      process.env[key] = value
    }
  }
}

function collectEnvSearchRoots(): string[] {
  const roots = new Set<string>([
    process.cwd(),
    join(process.cwd(), '../..'),
    join(__dirname, '../..'),
    join(__dirname, '../../..'),
    join(__dirname, '../../../..'),
  ])

  if (typeof process.resourcesPath === 'string' && process.resourcesPath.length > 0) {
    roots.add(join(process.resourcesPath, 'config'))
  }

  return [...roots]
}

function shouldLoadReleaseEnvKey(key: string, filePath: string): boolean {
  if (!filePath.endsWith('release.env')) return true
  if (PACKAGED_FORBIDDEN_DEV_ENV_PATTERN.test(key)) return false
  return /^(TOOLMAN_FIREBASE_|TOOLMAN_AUTHING_|TOOLMAN_TENCENT_|TOOLMAN_WECHAT_|TOOLMAN_AUTH_BUILD_|TOOLMAN_BUILD_REGION|TOOLMAN_COMMUNITY_JWT_SECRET|TOOLMAN_P2P_)/.test(
    key,
  )
}

export function loadWorkspaceEnvFiles(): void {
  const visited = new Set<string>()

  for (const root of collectEnvSearchRoots()) {
    for (const fileName of ENV_FILE_NAMES) {
      const filePath = join(root, fileName)
      if (visited.has(filePath) || !existsSync(filePath)) continue
      visited.add(filePath)
      applyEnvFile(filePath)
    }
  }
}
