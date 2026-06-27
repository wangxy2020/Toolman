#!/usr/bin/env node
/**
 * Print multiline TOOLMAN_RELEASE_ENV from .env.local / .env.p2p.turn for GitHub Secrets.
 *
 * Usage:
 *   node scripts/print-toolman-release-env.mjs
 *   pnpm release:print-env
 *
 * Copy the output into GitHub → Settings → Secrets → Actions → TOOLMAN_RELEASE_ENV
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  formatReleaseEnvLines,
  parseEnvFile,
  validateReleaseEnv,
} from './release-env-utils.mjs'

const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..')

const SOURCE_FILES = [
  join(ROOT_DIR, '.env.local'),
  join(ROOT_DIR, '.env.p2p.turn'),
]

const values = new Map()

for (const sourceFile of SOURCE_FILES) {
  if (!existsSync(sourceFile)) continue
  for (const [key, value] of parseEnvFile(readFileSync(sourceFile, 'utf8'))) {
    values.set(key, value)
  }
}

const lines = formatReleaseEnvLines(values)
const validation = validateReleaseEnv(values)

console.log('# Paste everything below into GitHub Secret TOOLMAN_RELEASE_ENV\n')
if (lines.length === 0) {
  console.error('error: no release env keys found in .env.local / .env.p2p.turn')
  console.error('hint: copy docs/engineering/templates/env.p2p.turn.example → .env.p2p.turn and fill secrets')
  process.exit(1)
}

console.log(lines.join('\n'))
console.log('')

if (validation.warnings.length > 0) {
  console.error('# warnings:')
  for (const warning of validation.warnings) {
    console.error(`#   - ${warning}`)
  }
  console.error('')
}

if (!validation.ok) {
  console.error('# errors (fix before using in CI):')
  for (const error of validation.errors) {
    console.error(`#   - ${error}`)
  }
  process.exit(1)
}

console.error(`# ok: ${lines.length} keys ready for TOOLMAN_RELEASE_ENV`)
