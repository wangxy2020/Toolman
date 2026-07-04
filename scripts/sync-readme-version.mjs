#!/usr/bin/env node
/**
 * Sync README version markers from apps/desktop/package.json.
 * Does not modify user-written prose (see <!-- toolman:user-content --> in README.md).
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const README = join(ROOT, 'README.md')
const DESKTOP_PKG = join(ROOT, 'apps/desktop/package.json')

const VERSION_START = '<!-- toolman:version -->'
const VERSION_END = '<!-- /toolman:version -->'

function readDesktopVersion() {
  const pkg = JSON.parse(readFileSync(DESKTOP_PKG, 'utf8'))
  if (typeof pkg.version !== 'string' || !pkg.version.trim()) {
    throw new Error(`Invalid version in ${DESKTOP_PKG}`)
  }
  return pkg.version.trim()
}

function syncVersionMarkers(content, version) {
  const pattern = new RegExp(
    `${escapeRegExp(VERSION_START)}\`[^\`]*\`${escapeRegExp(VERSION_END)}`,
    'g',
  )
  const replacement = `${VERSION_START}\`${version}\`${VERSION_END}`
  if (!pattern.test(content)) {
    throw new Error(
      `README.md missing version markers (${VERSION_START} ... ${VERSION_END}). Run docs/engineering/README_MAINTENANCE.md`,
    )
  }
  return content.replace(pattern, replacement)
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function main() {
  const version = readDesktopVersion()
  const before = readFileSync(README, 'utf8')
  const after = syncVersionMarkers(before, version)

  if (after === before) {
    console.log(`README.md version already ${version}`)
    return
  }

  writeFileSync(README, after, 'utf8')
  console.log(`README.md version synced to ${version}`)
}

main()
