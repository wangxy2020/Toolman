import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import { z } from 'zod'

const CommunityCidConfigSchema = z.object({
  cidDistributionEnabled: z.boolean().default(false),
})

export type CommunityCidConfig = z.infer<typeof CommunityCidConfigSchema>

const DEFAULT_CONFIG: CommunityCidConfig = {
  cidDistributionEnabled: false,
}

function getConfigPath(): string {
  const dir = join(app.getPath('userData'), 'community')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return join(dir, 'cid.json')
}

export function readCommunityCidConfig(): CommunityCidConfig {
  const path = getConfigPath()
  if (!existsSync(path)) {
    return { ...DEFAULT_CONFIG }
  }
  try {
    return CommunityCidConfigSchema.parse(JSON.parse(readFileSync(path, 'utf8')))
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export function writeCommunityCidConfig(config: CommunityCidConfig): CommunityCidConfig {
  const parsed = CommunityCidConfigSchema.parse(config)
  writeFileSync(getConfigPath(), JSON.stringify(parsed, null, 2), 'utf8')
  return parsed
}

export function isCommunityCidDistributionEnabled(): boolean {
  return readCommunityCidConfig().cidDistributionEnabled
}

export function ensureDefaultCommunityCidConfig(): CommunityCidConfig {
  const path = getConfigPath()
  if (existsSync(path)) {
    return readCommunityCidConfig()
  }
  return writeCommunityCidConfig(DEFAULT_CONFIG)
}
