import { app } from 'electron'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

function cacheDir(): string {
  const dir = join(app.getPath('userData'), 'community', 'cache')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

function cachePath(key: string): string {
  const safe = key.replace(/[^a-zA-Z0-9._-]+/g, '_')
  return join(cacheDir(), `${safe}.json`)
}

export function writeCommunityHubCache(key: string, data: unknown): void {
  try {
    writeFileSync(
      cachePath(key),
      JSON.stringify({ cachedAt: Date.now(), data }, null, 2),
      'utf8',
    )
  } catch {
    // cache failures must not break hub requests
  }
}

export function readCommunityHubCache<T>(key: string): T | null {
  try {
    const path = cachePath(key)
    if (!existsSync(path)) return null
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as { data?: T }
    return parsed.data ?? null
  } catch {
    return null
  }
}

export function hasAnyCommunityHubCache(): boolean {
  try {
    const dir = cacheDir()
    return readdirSync(dir).some((name) => name.endsWith('.json'))
  } catch {
    return false
  }
}
