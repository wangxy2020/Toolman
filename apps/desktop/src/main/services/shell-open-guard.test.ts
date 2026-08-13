import { describe, expect, it, vi } from 'vitest'

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

describe('shell-open-guard', () => {
  it('rejects executable-like paths', async () => {
    const { isExecutableLikePath, assertPathSafeToOpenInShell } = await import('./shell-open-guard')
    expect(isExecutableLikePath('/tmp/Desktop/evil.command')).toBe(true)
    expect(isExecutableLikePath('/tmp/Desktop/Evil.app/Contents/MacOS/Evil')).toBe(true)
    expect(isExecutableLikePath('/tmp/Desktop/notes.pdf')).toBe(false)
    expect(() => assertPathSafeToOpenInShell('/tmp/Desktop/evil.command')).toThrow(
      '不允许通过系统打开可执行文件',
    )
  })

  it('allows documents under sandbox roots', async () => {
    const { assertPathSafeToOpenInShell } = await import('./shell-open-guard')
    expect(assertPathSafeToOpenInShell('/tmp/Documents/ToolmanData/notes.pdf')).toContain(
      'ToolmanData',
    )
  })
})
