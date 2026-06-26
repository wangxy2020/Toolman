import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

describe('toolman user document path helpers', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.doUnmock('electron')
  })

  it('detects stale workspace paths under a different user folder', async () => {
    vi.doMock('electron', () => ({
      app: {
        getPath: (name: string) => (name === 'documents' ? '/Users/wangxy/Documents' : '/tmp'),
        isPackaged: false,
      },
    }))

    const {
      getUserFolderFromToolmanUserPath,
      isStoredPathUnderDifferentUserFolder,
    } = await import('./toolman-user-documents.service')

    const stalePath = '/Users/wangxy/Documents/ToolmanData/wangxy/本地知识库'
    expect(getUserFolderFromToolmanUserPath(stalePath)).toBe('wangxy')
    expect(isStoredPathUnderDifferentUserFolder(stalePath, '31897124')).toBe(true)
    expect(isStoredPathUnderDifferentUserFolder(stalePath, 'wangxy')).toBe(false)
  })
})
