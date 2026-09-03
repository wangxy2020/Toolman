import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: (name: string) => {
      const paths: Record<string, string> = {
        userData: '/tmp/toolman-user-data',
        temp: '/tmp',
        documents: '/tmp/Documents',
        desktop: '/tmp/Desktop',
        downloads: '/tmp/Downloads',
      }
      return paths[name] ?? `/tmp/${name}`
    },
  },
}))

vi.mock('./community/community-paths', () => ({
  getCommunityDataDir: () => '/tmp/toolman-user-data/community',
}))

vi.mock('./toolman-user-documents.service', () => ({
  listAllToolmanDocumentsRoots: () => ['/tmp/Documents/ToolmanData'],
  normalizeFolderPath: (path: string) => path.replace(/\\/g, '/'),
}))

vi.mock('./workspace.service', () => ({
  listWorkspaces: () => [],
}))

describe('path-sandbox.service', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('allows paths under userData', async () => {
    const { assertPathWithinAllowedRoots } = await import('./path-sandbox.service')
    expect(assertPathWithinAllowedRoots('/tmp/toolman-user-data/knowledge/doc.pdf')).toContain(
      'toolman-user-data',
    )
  })

  it('rejects paths outside allowed roots', async () => {
    const { assertPathWithinAllowedRoots } = await import('./path-sandbox.service')
    expect(() => assertPathWithinAllowedRoots('/etc/passwd')).toThrow('路径不在允许访问的范围内')
  })

  it('allows desktop and downloads for user document reads', async () => {
    const { assertPathWithinAllowedRoots } = await import('./path-sandbox.service')
    expect(assertPathWithinAllowedRoots('/tmp/Desktop/notes.pdf')).toContain('Desktop')
    expect(assertPathWithinAllowedRoots('/tmp/Downloads/file.txt')).toContain('Downloads')
  })

  it('lets user-selected files live outside the workspace folder', async () => {
    const { assertUserAccessiblePath, assertPathWithinAllowedRoots } = await import(
      './path-sandbox.service'
    )
    expect(assertUserAccessiblePath('/Users/test-user/Pictures/ScreenShot_2026-04-29_161251_059.png')).toContain(
      'Pictures',
    )
    expect(() =>
      assertPathWithinAllowedRoots('/Users/test-user/Pictures/ScreenShot_2026-04-29_161251_059.png'),
    ).toThrow('路径不在允许访问的范围内')
  })

  it('still blocks system files for user-selected reads', async () => {
    const { assertUserAccessiblePath } = await import('./path-sandbox.service')
    const blocked =
      process.platform === 'win32'
        ? `${process.env.WINDIR || 'C:\\Windows'}\\System32\\drivers\\etc\\hosts`
        : '/etc/passwd'
    expect(() => assertUserAccessiblePath(blocked)).toThrow('路径不在允许访问的范围内')
  })
})
