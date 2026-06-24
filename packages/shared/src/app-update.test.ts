import { describe, expect, it } from 'vitest'

import {
  AppUpdateManifestSchema,
  compareSemver,
  isVersionNewer,
  satisfiesMinVersion,
} from './app-update.js'

describe('compareSemver', () => {
  it('orders patch versions', () => {
    expect(compareSemver('0.1.1', '0.1.0')).toBeGreaterThan(0)
    expect(compareSemver('0.1.0', '0.1.1')).toBeLessThan(0)
  })

  it('treats equal versions as zero', () => {
    expect(compareSemver('0.1.0', '0.1.0')).toBe(0)
  })
})

describe('isVersionNewer', () => {
  it('detects newer semver', () => {
    expect(isVersionNewer('0.2.0', '0.1.0')).toBe(true)
    expect(isVersionNewer('0.1.0', '0.1.0')).toBe(false)
  })
})

describe('satisfiesMinVersion', () => {
  it('allows updates when current meets minVersion', () => {
    expect(satisfiesMinVersion('0.2.0', '0.1.0')).toBe(true)
    expect(satisfiesMinVersion('0.1.0', '0.2.0')).toBe(false)
    expect(satisfiesMinVersion('0.1.0', undefined)).toBe(true)
  })
})

describe('AppUpdateManifestSchema', () => {
  it('parses production manifest fields', () => {
    const manifest = AppUpdateManifestSchema.parse({
      version: '0.2.0',
      url: 'https://releases.toolman.app/stable/darwin/arm64/Toolman-0.2.0.dmg',
      sha256: 'a'.repeat(64),
      notes: 'Bug fixes',
      minVersion: '0.1.0',
    })
    expect(manifest.version).toBe('0.2.0')
  })
})
