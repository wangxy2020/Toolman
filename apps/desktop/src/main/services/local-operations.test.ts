import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { compareSemver } from '@toolman/shared'

const USER_DATA = join('/tmp', 'toolman-test-userdata')

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => (name === 'userData' ? USER_DATA : `/tmp/toolman-test-${name}`),
    getVersion: () => '0.1.0',
  },
}))

vi.mock('@toolman/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@toolman/shared')>()
  return {
    ...actual,
    getToolmanBuildProvenance: () => ({
      buildId: 'test-build',
      buildFingerprint: 'test-fingerprint',
    }),
  }
})

describe('compareSemver', () => {
  it('orders semver strings for update checks', () => {
    expect(compareSemver('0.2.0', '0.1.0')).toBeGreaterThan(0)
    expect(compareSemver('0.1.0', '0.2.0')).toBeLessThan(0)
    expect(compareSemver('1.0.0', '1.0.0')).toBe(0)
  })
})

describe('local-operations path helpers', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('builds diagnostics and update paths from electron userData', async () => {
    const {
      crashReportDir,
      diagnosticsDir,
      diagnosticsLogPath,
      updateManifestPath,
    } = await import('./local-operations.service')

    expect(diagnosticsDir()).toBe(join(USER_DATA, 'diagnostics'))
    expect(crashReportDir()).toBe(join(USER_DATA, 'diagnostics', 'crashes'))
    expect(diagnosticsLogPath()).toBe(join(USER_DATA, 'diagnostics', 'events.jsonl'))
    expect(updateManifestPath()).toBe(join(USER_DATA, 'updates', 'manifest.json'))
  })

  it('reports updateAvailable when manifest version is newer', async () => {
    const { mkdirSync, writeFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const { updateManifestPath, getOperationsDiagnostics } = await import('./local-operations.service')

    const manifestPath = updateManifestPath()
    mkdirSync(join(USER_DATA, 'updates'), { recursive: true })
    writeFileSync(
      manifestPath,
      JSON.stringify({
        channel: 'local',
        latestVersion: '0.9.0',
        notes: 'test',
      }),
      'utf8',
    )

    const diagnostics = getOperationsDiagnostics()
    expect(diagnostics.update.updateAvailable).toBe(true)
    expect(diagnostics.update.latestVersion).toBe('0.9.0')
    expect(diagnostics.update.manifestPath).toBe(manifestPath)
  })
})
