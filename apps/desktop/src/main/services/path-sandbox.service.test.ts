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
})
