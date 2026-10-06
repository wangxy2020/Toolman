import { join } from 'node:path'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

describe('toolman user document path helpers', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.doUnmock('electron')
  })

  it('uses ToolmanData as documents root for packaged and dev builds', async () => {
    vi.doMock('electron', () => ({
      app: {
        getPath: (name: string) => (name === 'documents' ? '/Users/demo/Documents' : '/tmp'),
        isPackaged: true,
      },
    }))

    const {
      getToolmanDocumentsRootPath,
      getAlternateToolmanDocumentsRoot,
    } = await import('./toolman-user-documents.service')

    expect(getToolmanDocumentsRootPath()).toBe(join('/Users/demo/Documents', 'ToolmanData'))
    expect(getAlternateToolmanDocumentsRoot()).toBe(join('/Users/demo/Documents', 'Toolman'))
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
      TOOLMAN_DEFAULT_FOLDER_PARENTS,
    } = await import('./toolman-user-documents.service')

    const stalePath = '/Users/wangxy/Documents/ToolmanData/wangxy/本地知识库'
    expect(getUserFolderFromToolmanUserPath(stalePath)).toBe('wangxy')
    expect(isStoredPathUnderDifferentUserFolder(stalePath, '31897124')).toBe(true)
    expect(isStoredPathUnderDifferentUserFolder(stalePath, 'wangxy')).toBe(false)
    expect(TOOLMAN_DEFAULT_FOLDER_PARENTS).toContain('同步知识库')
  })

  it('treats a ToolmanData account directory as an account root', async () => {
    vi.doMock('electron', () => ({
      app: {
        getPath: (name: string) => (name === 'documents' ? 'C:/Users/Administrator/Documents' : '/tmp'),
        isPackaged: true,
      },
    }))

    const { isToolmanAccountRootPath } = await import('./toolman-user-documents.service')
    const root = 'C:/Users/Administrator/Documents/ToolmanData/本地用户'
    expect(isToolmanAccountRootPath(root)).toBe(true)
    expect(isToolmanAccountRootPath(`${root}/工作区`)).toBe(false)
  })
})
