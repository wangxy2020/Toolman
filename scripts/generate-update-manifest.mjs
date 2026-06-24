#!/usr/bin/env node
/**
 * Generate channel manifest.json from a built desktop artifact.
 *
 * Usage:
 *   node scripts/generate-update-manifest.mjs \
 *     --artifact apps/desktop/dist/Toolman-0.2.0-arm64.dmg \
 *     --version 0.2.0 \
 *     --channel staging \
 *     --feed-base-url https://releases.toolman.app \
 *     --platform darwin \
 *     --arch arm64 \
 *     --notes "Staging build" \
 *     --out apps/desktop/dist/staging-manifest.json
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  createUpdateManifest,
  describeArtifact,
  formatUpdateManifest,
  parseReleaseChannel,
  sha256FileHex,
} from '../packages/shared/dist/release-update.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

function readArg(name) {
  const index = process.argv.indexOf(name)
  if (index === -1) return undefined
  return process.argv[index + 1]
}

function requireArg(name) {
  const value = readArg(name)
  if (!value) {
    console.error(`missing required argument: ${name}`)
    process.exit(1)
  }
  return value
}

async function main() {
  const artifactPath = resolve(ROOT, requireArg('--artifact'))
  const version = requireArg('--version')
  const channel = parseReleaseChannel(readArg('--channel') ?? 'staging')
  const feedBaseUrl = requireArg('--feed-base-url')
  const platform = requireArg('--platform')
  const arch = requireArg('--arch')
  const notes = readArg('--notes') ?? ''
  const minVersion = readArg('--min-version')
  const outPath = resolve(ROOT, readArg('--out') ?? `apps/desktop/dist/${channel}-manifest.json`)

  if (!['darwin', 'win32', 'linux'].includes(platform)) {
    throw new Error(`unsupported platform: ${platform}`)
  }

  const artifact = describeArtifact({
    feedBaseUrl,
    channel,
    platform,
    arch,
    filePath: artifactPath,
  })
  const sha256 = await sha256FileHex(artifact.filePath)
  const manifest = createUpdateManifest({
    version,
    artifactUrl: artifact.publicUrl,
    sha256,
    notes: notes || undefined,
    minVersion: minVersion || undefined,
  })

  mkdirSync(dirname(outPath), { recursive: true })
  writeFileSync(outPath, formatUpdateManifest(manifest), 'utf8')

  console.log(
    JSON.stringify(
      {
        channel,
        version,
        artifact: artifact.fileName,
        sha256,
        manifestPath: outPath,
        manifestUrl: `${feedBaseUrl.replace(/\/$/, '')}/${channel}/manifest.json`,
        autoUpdaterFeedUrl: `${feedBaseUrl.replace(/\/$/, '')}/${channel}/${platform}/${arch}`,
      },
      null,
      2,
    ),
  )
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
