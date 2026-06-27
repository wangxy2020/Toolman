import { describe, expect, it } from 'vitest'

import {
  buildReleaseArtifactUrl,
  createUpdateManifest,
  formatUpdateManifest,
  parseReleaseChannel,
  pickPrimaryArtifact,
  resolveReleasePaths,
} from './release-update.js'

describe('parseReleaseChannel', () => {
  it('defaults to staging for invalid input', () => {
    expect(parseReleaseChannel(undefined)).toBe('staging')
    expect(parseReleaseChannel('beta')).toBe('staging')
    expect(parseReleaseChannel('stable')).toBe('stable')
  })
})

describe('createUpdateManifest', () => {
  it('builds CDN manifest payload', () => {
    const manifest = createUpdateManifest({
      version: '0.2.0',
      artifactUrl: 'https://releases.toolman.app/staging/darwin/arm64/Toolman-0.2.0-arm64.dmg',
      sha256: 'a'.repeat(64),
      notes: 'Staging RC',
      minVersion: '0.1.0',
    })
    expect(formatUpdateManifest(manifest)).toContain('"version": "0.2.0"')
  })
})

describe('resolveReleasePaths', () => {
  it('maps feed URLs for electron-updater generic provider', () => {
    expect(
      resolveReleasePaths('https://releases.toolman.app', 'staging', 'darwin', 'arm64'),
    ).toEqual({
      manifestUrl: 'https://releases.toolman.app/staging/manifest.json',
      autoUpdaterFeedUrl: 'https://releases.toolman.app/staging/darwin/arm64',
    })
  })
})

describe('pickPrimaryArtifact', () => {
  it('prefers dmg over other artifacts', () => {
    const picked = pickPrimaryArtifact([
      {
        fileName: 'latest-mac.yml',
        filePath: '/tmp/latest-mac.yml',
        platform: 'darwin',
        arch: 'arm64',
        publicUrl: 'https://example.com/latest-mac.yml',
      },
      {
        fileName: 'Toolman-0.2.0-arm64.dmg',
        filePath: '/tmp/Toolman-0.2.0-arm64.dmg',
        platform: 'darwin',
        arch: 'arm64',
        publicUrl: 'https://example.com/Toolman-0.2.0-arm64.dmg',
      },
    ])
    expect(picked?.fileName).toBe('Toolman-0.2.0-arm64.dmg')
  })

  it('prefers Windows Portable exe for OTA manifest', () => {
    const picked = pickPrimaryArtifact([
      {
        fileName: 'Toolman-0.2.0-x64-Portable.exe',
        filePath: '/tmp/Toolman-0.2.0-x64-Portable.exe',
        platform: 'win32',
        arch: 'x64',
        publicUrl: 'https://example.com/Toolman-0.2.0-x64-Portable.exe',
      },
      {
        fileName: 'Toolman-0.2.0-x64-Setup.exe',
        filePath: '/tmp/Toolman-0.2.0-x64-Setup.exe',
        platform: 'win32',
        arch: 'x64',
        publicUrl: 'https://example.com/Toolman-0.2.0-x64-Setup.exe',
      },
    ])
    expect(picked?.fileName).toBe('Toolman-0.2.0-x64-Portable.exe')
  })
})

describe('buildReleaseArtifactUrl', () => {
  it('joins feed, channel, platform, arch and file name', () => {
    expect(
      buildReleaseArtifactUrl(
        'https://releases.toolman.app/',
        'stable',
        'win32',
        'x64',
        'Toolman-0.2.0-x64.exe',
      ),
    ).toBe('https://releases.toolman.app/stable/win32/x64/Toolman-0.2.0-x64.exe')
  })
})
