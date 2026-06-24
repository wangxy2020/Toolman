import { z } from 'zod'

export const AppUpdateChannelSchema = z.enum(['stable', 'staging'])
export type AppUpdateChannel = z.infer<typeof AppUpdateChannelSchema>

export const AppUpdateManifestSchema = z.object({
  version: z.string().min(1),
  url: z.string().url(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/i),
  notes: z.string().optional(),
  minVersion: z.string().optional(),
})
export type AppUpdateManifest = z.infer<typeof AppUpdateManifestSchema>

export const AppUpdatePhaseSchema = z.enum([
  'idle',
  'checking',
  'available',
  'not-available',
  'downloading',
  'downloaded',
  'error',
])
export type AppUpdatePhase = z.infer<typeof AppUpdatePhaseSchema>

export const AppUpdateStatusSchema = z.object({
  enabled: z.boolean(),
  channel: z.string(),
  currentVersion: z.string(),
  latestVersion: z.string().nullable(),
  updateAvailable: z.boolean(),
  downloadProgress: z.number().min(0).max(100).nullable(),
  phase: AppUpdatePhaseSchema,
  notes: z.string().nullable(),
  error: z.string().nullable(),
  autoUpdate: z.boolean(),
})
export type AppUpdateStatus = z.infer<typeof AppUpdateStatusSchema>

export const AppUpdateSetAutoInputSchema = z.object({
  autoUpdate: z.boolean(),
})

export function compareSemver(left: string, right: string): number {
  const parse = (value: string) =>
    value
      .split('.')
      .map((part) => Number.parseInt(part.replace(/[^0-9].*$/, ''), 10))
      .map((part) => (Number.isFinite(part) ? part : 0))

  const leftParts = parse(left)
  const rightParts = parse(right)
  const length = Math.max(leftParts.length, rightParts.length)

  for (let index = 0; index < length; index += 1) {
    const delta = (leftParts[index] ?? 0) - (rightParts[index] ?? 0)
    if (delta !== 0) return delta
  }
  return 0
}

export function isVersionNewer(candidate: string, current: string): boolean {
  return compareSemver(candidate, current) > 0
}

export function satisfiesMinVersion(currentVersion: string, minVersion: string | undefined): boolean {
  if (!minVersion) return true
  return compareSemver(currentVersion, minVersion) >= 0
}

export function parseAppUpdateManifest(raw: unknown): AppUpdateManifest | null {
  const parsed = AppUpdateManifestSchema.safeParse(raw)
  return parsed.success ? parsed.data : null
}

export function buildUpdateManifestUrl(feedBaseUrl: string, channel: AppUpdateChannel): string {
  const base = feedBaseUrl.replace(/\/$/, '')
  return `${base}/${channel}/manifest.json`
}

export function buildAutoUpdaterFeedUrl(
  feedBaseUrl: string,
  channel: AppUpdateChannel,
  platform: 'darwin' | 'win32' | 'linux',
  arch: string,
): string {
  const base = feedBaseUrl.replace(/\/$/, '')
  return `${base}/${channel}/${platform}/${arch}`
}
