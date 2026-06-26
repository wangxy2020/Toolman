#!/usr/bin/env node
/**
 * Bake release auth/community/P2P env into apps/desktop/resources/release.env
 * from .env.local, .env.p2p.turn, and/or process environment (CI secrets).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_FILE = join(ROOT_DIR, 'apps/desktop/resources/release.env')

const ALLOWED_PREFIXES = [
  'TOOLMAN_FIREBASE_',
  'TOOLMAN_AUTHING_',
  'TOOLMAN_TENCENT_',
  'TOOLMAN_WECHAT_',
  'TOOLMAN_AUTH_BUILD_',
  'TOOLMAN_BUILD_REGION',
  'TOOLMAN_COMMUNITY_JWT_SECRET',
  'TOOLMAN_P2P_XIRSYS_',
  'TOOLMAN_P2P_TURN_',
  'TOOLMAN_P2P_ICE_SERVERS',
  'TOOLMAN_P2P_STUN_SERVERS',
]

const SOURCE_FILES = [
  process.env.TOOLMAN_RELEASE_ENV_FILE?.trim(),
  join(ROOT_DIR, '.env.local'),
  join(ROOT_DIR, '.env.p2p.turn'),
].filter(Boolean)

function isAllowedKey(key) {
  if (/^(TOOLMAN_.*_DEV_MODE|TOOLMAN_BILLING_MOCK|TENCENT_SMS_DEV_MODE|WECHAT_DEV_MODE)$/.test(key)) {
    return false
  }
  return ALLOWED_PREFIXES.some((prefix) =>
    prefix.endsWith('_') ? key.startsWith(prefix) : key === prefix,
  )
}

function parseEnvFile(content) {
  const values = new Map()
  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const separatorIndex = line.indexOf('=')
    if (separatorIndex <= 0) continue
    const key = line.slice(0, separatorIndex).trim()
    let value = line.slice(separatorIndex + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (isAllowedKey(key) && value) {
      values.set(key, value)
    }
  }
  return values
}

const values = new Map()

for (const sourceFile of SOURCE_FILES) {
  if (!existsSync(sourceFile)) continue
  for (const [key, value] of parseEnvFile(readFileSync(sourceFile, 'utf8'))) {
    values.set(key, value)
  }
}

for (const [key, value] of Object.entries(process.env)) {
  if (!value?.trim() || !isAllowedKey(key)) continue
  values.set(key, value.trim())
}

mkdirSync(dirname(OUT_FILE), { recursive: true })
const lines = [...values.entries()]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([key, value]) => `${key}=${value}`)
writeFileSync(OUT_FILE, lines.length > 0 ? `${lines.join('\n')}\n` : '')

if (lines.length === 0) {
  console.warn(
    `warning: ${OUT_FILE} is empty — packaged app will show auth config hints until credentials are baked at build time`,
  )
} else {
  console.log(`Wrote ${lines.length} release env keys to apps/desktop/resources/release.env`)
}
