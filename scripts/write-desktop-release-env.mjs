#!/usr/bin/env node
/**
 * Bake release auth/community/P2P env into apps/desktop/resources/release.env
 * from .env.local, .env.p2p.turn, and/or process environment (CI secrets).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  formatReleaseEnvLines,
  isAllowedKey,
  parseEnvFile,
  validateReleaseEnv,
} from './release-env-utils.mjs'

const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_FILE = join(ROOT_DIR, 'apps/desktop/resources/release.env')

const SOURCE_FILES = [
  process.env.TOOLMAN_RELEASE_ENV_FILE?.trim(),
  join(ROOT_DIR, '.env.local'),
  join(ROOT_DIR, '.env.p2p.turn'),
].filter(Boolean)

const values = new Map()

for (const sourceFile of SOURCE_FILES) {
  if (!sourceFile || !existsSync(sourceFile)) continue
  for (const [key, value] of parseEnvFile(readFileSync(sourceFile, 'utf8'))) {
    values.set(key, value)
  }
}

for (const [key, value] of Object.entries(process.env)) {
  if (!value?.trim() || !isAllowedKey(key)) continue
  values.set(key, value.trim())
}

mkdirSync(dirname(OUT_FILE), { recursive: true })
const lines = formatReleaseEnvLines(values)
writeFileSync(OUT_FILE, lines.length > 0 ? `${lines.join('\n')}\n` : '')

const validation = validateReleaseEnv(values)
const isReleaseCi = process.env.TOOLMAN_RELEASE_BUILD === '1' && process.env.CI === 'true'

for (const warning of validation.warnings) {
  console.warn(`warning: ${warning}`)
}

if (lines.length === 0) {
  console.warn(
    `warning: ${OUT_FILE} is empty — packaged app will show auth config hints until credentials are baked at build time`,
  )
  if (isReleaseCi) {
    console.error(
      'error: release.env is empty in CI. Add GitHub secret TOOLMAN_RELEASE_ENV (run `pnpm release:print-env` locally and paste) or pass TOOLMAN_* vars in the workflow.',
    )
    process.exit(1)
  }
} else {
  console.log(`Wrote ${lines.length} release env keys to apps/desktop/resources/release.env`)
}

if (!validation.ok) {
  for (const error of validation.errors) {
    console.error(`error: ${error}`)
  }
  if (isReleaseCi) {
    console.error(
      'error: TOOLMAN_RELEASE_ENV is incomplete. Run `pnpm release:print-env` locally and update the GitHub secret.',
    )
    process.exit(1)
  }
}
