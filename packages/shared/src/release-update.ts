import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { basename } from 'node:path'

import {
  AppUpdateChannelSchema,
  AppUpdateManifestSchema,
  buildAutoUpdaterFeedUrl,
  buildUpdateManifestUrl,
  type AppUpdateChannel,
  type AppUpdateManifest,
} from './app-update.js'

export interface CreateUpdateManifestInput {
  version: string
  artifactUrl: string
  sha256: string
  notes?: string
  minVersion?: string
}

export function createUpdateManifest(input: CreateUpdateManifestInput): AppUpdateManifest {
  return AppUpdateManifestSchema.parse({
    version: input.version,
    url: input.artifactUrl,
    sha256: input.sha256,
    notes: input.notes,
    minVersion: input.minVersion,
  })
}

export function formatUpdateManifest(manifest: AppUpdateManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`
}

export interface ReleaseArtifactDescriptor {
  fileName: string
  filePath: string
  platform: 'darwin' | 'win32' | 'linux'
  arch: string
  publicUrl: string
}

export function buildReleaseArtifactUrl(
  feedBaseUrl: string,
  channel: AppUpdateChannel,
  platform: ReleaseArtifactDescriptor['platform'],
  arch: string,
  fileName: string,
): string {
  const base = feedBaseUrl.replace(/\/$/, '')
  return `${base}/${channel}/${platform}/${arch}/${fileName}`
}

export function resolveReleasePaths(
  feedBaseUrl: string,
  channel: AppUpdateChannel,
  platform: ReleaseArtifactDescriptor['platform'],
  arch: string,
): {
  manifestUrl: string
  autoUpdaterFeedUrl: string
} {
  return {
    manifestUrl: buildUpdateManifestUrl(feedBaseUrl, channel),
    autoUpdaterFeedUrl: buildAutoUpdaterFeedUrl(feedBaseUrl, channel, platform, arch),
  }
}

export function parseReleaseChannel(raw: string | undefined): AppUpdateChannel {
  const parsed = AppUpdateChannelSchema.safeParse(raw?.trim().toLowerCase())
  return parsed.success ? parsed.data : 'staging'
}

export async function sha256FileHex(filePath: string): Promise<string> {
  const hash = createHash('sha256')
  await new Promise<void>((resolve, reject) => {
    createReadStream(filePath)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolve())
  })
  return hash.digest('hex')
}

export function pickPrimaryArtifact(
  artifacts: ReleaseArtifactDescriptor[],
): ReleaseArtifactDescriptor | null {
  const setup = artifacts.find((item) => item.fileName.includes('-Setup.'))
  if (setup) return setup

  const preference = ['.dmg', '-Portable.exe', '.exe', '.AppImage']
  for (const suffix of preference) {
    const match = artifacts.find((item) => item.fileName.endsWith(suffix))
    if (match) return match
  }
  return artifacts[0] ?? null
}

export function describeArtifact(input: {
  feedBaseUrl: string
  channel: AppUpdateChannel
  platform: ReleaseArtifactDescriptor['platform']
  arch: string
  filePath: string
}): ReleaseArtifactDescriptor {
  const fileName = basename(input.filePath)
  return {
    fileName,
    filePath: input.filePath,
    platform: input.platform,
    arch: input.arch,
    publicUrl: buildReleaseArtifactUrl(
      input.feedBaseUrl,
      input.channel,
      input.platform,
      input.arch,
      fileName,
    ),
  }
}
