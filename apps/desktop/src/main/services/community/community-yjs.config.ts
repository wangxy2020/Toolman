import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { z } from 'zod'

const CommunitySyncConfigSchema = z.object({
  yjsEnabled: z.boolean().default(false),
  requireSignedUpdates: z.boolean().default(true),
})

export type CommunitySyncConfig = z.infer<typeof CommunitySyncConfigSchema>

const DEFAULT_CONFIG: CommunitySyncConfig = {
  yjsEnabled: false,
  requireSignedUpdates: true,
}

function getConfigPath(): string {
  const dir = join(app.getPath('userData'), 'community')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return join(dir, 'sync.json')
}

export function readCommunitySyncConfig(): CommunitySyncConfig {
  const path = getConfigPath()
  if (!existsSync(path)) {
    return { ...DEFAULT_CONFIG }
  }
  try {
    return CommunitySyncConfigSchema.parse(JSON.parse(readFileSync(path, 'utf8')))
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export function writeCommunitySyncConfig(config: CommunitySyncConfig): CommunitySyncConfig {
  const parsed = CommunitySyncConfigSchema.parse(config)
  writeFileSync(getConfigPath(), JSON.stringify(parsed, null, 2), 'utf8')
  return parsed
}

export function isCommunityYjsEnabled(): boolean {
  return readCommunitySyncConfig().yjsEnabled
}

export function isCommunityYjsRequireSignedUpdates(): boolean {
  return readCommunitySyncConfig().requireSignedUpdates
}

export function ensureDefaultCommunitySyncConfig(): CommunitySyncConfig {
  const path = getConfigPath()
  if (existsSync(path)) {
    return readCommunitySyncConfig()
  }
  return writeCommunitySyncConfig(DEFAULT_CONFIG)
}
