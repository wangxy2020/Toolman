import { describe, expect, it } from 'vitest'

import {
  DEFAULT_KNOWLEDGE_FOLDER_ID,
  DEFAULT_NETWORK_KNOWLEDGE_FOLDER_ID,
  SYSTEM_DEFAULT_FOLDER_KB_NAME,
} from './knowledge-sidebar-types'
import { resolveDefaultKbStoragePath, resolveKnowledgeImportTarget, resolveKnowledgeRootFromDefaultStorage, resolveKnowledgeSectionRoots } from './knowledge-import-files'

describe('resolveKnowledgeImportTarget', () => {
  it('uses the default-folder subpath for local default folder imports', () => {
    const target = resolveKnowledgeImportTarget({
      workspaceId: 'ws-1',
      section: 'local',
      activeId: DEFAULT_KNOWLEDGE_FOLDER_ID,
      activeKbId: null,
      activeKbName: null,
      activeKbKind: null,
      defaultFolderKbId: 'kb-local',
      defaultNetworkFolderKbId: 'kb-network',
      defaultLocalFilesKbId: null,
      knowledgeFolderPath: '/Users/demo/Toolman/本地知识库',
      networkKnowledgeFolderPath: '/Users/demo/Toolman/网络知识库',
      localFilesFolderPath: null,
    })

    expect(target.storagePath).toBe(
      `/Users/demo/Toolman/本地知识库/${SYSTEM_DEFAULT_FOLDER_KB_NAME}`,
    )
    expect(target.kbId).toBe('kb-local')
    expect(target.ready).toBe(true)
  })

  it('uses the network kb id and storage root for network default folder', () => {
    const target = resolveKnowledgeImportTarget({
      workspaceId: 'ws-1',
      section: 'network',
      activeId: DEFAULT_NETWORK_KNOWLEDGE_FOLDER_ID,
      activeKbId: null,
      activeKbName: null,
      activeKbKind: null,
      defaultFolderKbId: 'kb-local',
      defaultNetworkFolderKbId: 'kb-network',
      defaultLocalFilesKbId: null,
      knowledgeFolderPath: '/Users/demo/Toolman/本地知识库',
      networkKnowledgeFolderPath: '/Users/demo/Toolman/网络知识库',
      localFilesFolderPath: null,
    })

    expect(target.storagePath).toBe(
      `/Users/demo/Toolman/网络知识库/${SYSTEM_DEFAULT_FOLDER_KB_NAME}`,
    )
    expect(target.kbId).toBe('kb-network')
    expect(target.kbId).not.toBe('kb-local')
    expect(target.ready).toBe(true)
  })
})

describe('knowledge path layout', () => {
  it('derives section roots from default storage paths without double nesting', () => {
    const roots = resolveKnowledgeSectionRoots({
      knowledgeFolderPath: null,
      networkKnowledgeFolderPath: null,
      localFilesFolderPath: null,
      localDefaultKbStoragePath: '/Users/demo/Toolman/本地知识库/默认文件夹',
      networkDefaultKbStoragePath: '/Users/demo/Toolman/网络知识库/默认文件夹',
      localFilesDefaultKbStoragePath: '/Users/demo/Toolman/本地文件/默认文件夹',
    })

    expect(roots.local).toBe('/Users/demo/Toolman/本地知识库')
    expect(roots.network).toBe('/Users/demo/Toolman/网络知识库')
    expect(roots.localFiles).toBe('/Users/demo/Toolman/本地文件')

    expect(resolveDefaultKbStoragePath(roots.local)).toBe(
      '/Users/demo/Toolman/本地知识库/默认文件夹',
    )
    expect(resolveDefaultKbStoragePath(roots.network)).toBe(
      '/Users/demo/Toolman/网络知识库/默认文件夹',
    )
  })

  it('does not treat storage path as root when workspace roots are already set', () => {
    const target = resolveKnowledgeImportTarget({
      workspaceId: 'ws-1',
      section: 'local',
      activeId: DEFAULT_KNOWLEDGE_FOLDER_ID,
      activeKbId: null,
      activeKbName: null,
      activeKbKind: null,
      defaultFolderKbId: 'kb-local',
      defaultNetworkFolderKbId: 'kb-network',
      defaultLocalFilesKbId: null,
      knowledgeFolderPath: resolveKnowledgeSectionRoots({
        knowledgeFolderPath: '/Users/demo/Toolman/本地知识库',
        networkKnowledgeFolderPath: '/Users/demo/Toolman/网络知识库',
        localFilesFolderPath: null,
        localDefaultKbStoragePath: '/Users/demo/Toolman/本地知识库/默认文件夹',
        networkDefaultKbStoragePath: '/Users/demo/Toolman/网络知识库/默认文件夹',
        localFilesDefaultKbStoragePath: null,
      }).local,
      networkKnowledgeFolderPath: '/Users/demo/Toolman/网络知识库',
      localFilesFolderPath: null,
    })

    expect(target.storagePath).toBe('/Users/demo/Toolman/本地知识库/默认文件夹')
    expect(target.storagePath).not.toContain('默认文件夹/默认文件夹')
  })

  it('supports legacy default folder segment names when deriving roots', () => {
    expect(
      resolveKnowledgeRootFromDefaultStorage('/Users/demo/Toolman/网络知识库/默认网络文件夹'),
    ).toBe('/Users/demo/Toolman/网络知识库')
  })
})

describe('knowledge path layout', () => {
  it('derives section roots from default storage paths without double nesting', () => {
    const roots = resolveKnowledgeSectionRoots({
      knowledgeFolderPath: null,
      networkKnowledgeFolderPath: null,
      localFilesFolderPath: null,
      localDefaultKbStoragePath: '/Users/demo/Toolman/本地知识库/默认文件夹',
      networkDefaultKbStoragePath: '/Users/demo/Toolman/网络知识库/默认文件夹',
      localFilesDefaultKbStoragePath: '/Users/demo/Toolman/本地文件/默认文件夹',
    })

    expect(roots.local).toBe('/Users/demo/Toolman/本地知识库')
    expect(roots.network).toBe('/Users/demo/Toolman/网络知识库')
    expect(roots.localFiles).toBe('/Users/demo/Toolman/本地文件')

    expect(resolveDefaultKbStoragePath(roots.local)).toBe(
      '/Users/demo/Toolman/本地知识库/默认文件夹',
    )
    expect(resolveDefaultKbStoragePath(roots.network)).toBe(
      '/Users/demo/Toolman/网络知识库/默认文件夹',
    )
  })

  it('does not treat storage path as root when workspace roots are already set', () => {
    const target = resolveKnowledgeImportTarget({
      workspaceId: 'ws-1',
      section: 'local',
      activeId: DEFAULT_KNOWLEDGE_FOLDER_ID,
      activeKbId: null,
      activeKbName: null,
      activeKbKind: null,
      defaultFolderKbId: 'kb-local',
      defaultNetworkFolderKbId: 'kb-network',
      defaultLocalFilesKbId: null,
      knowledgeFolderPath: resolveKnowledgeSectionRoots({
        knowledgeFolderPath: '/Users/demo/Toolman/本地知识库',
        networkKnowledgeFolderPath: '/Users/demo/Toolman/网络知识库',
        localFilesFolderPath: null,
        localDefaultKbStoragePath: '/Users/demo/Toolman/本地知识库/默认文件夹',
        networkDefaultKbStoragePath: '/Users/demo/Toolman/网络知识库/默认文件夹',
        localFilesDefaultKbStoragePath: null,
      }).local,
      networkKnowledgeFolderPath: '/Users/demo/Toolman/网络知识库',
      localFilesFolderPath: null,
    })

    expect(target.storagePath).toBe('/Users/demo/Toolman/本地知识库/默认文件夹')
    expect(target.storagePath).not.toContain('默认文件夹/默认文件夹')
  })

  it('supports legacy default folder segment names when deriving roots', () => {
    expect(
      resolveKnowledgeRootFromDefaultStorage('/Users/demo/Toolman/网络知识库/默认网络文件夹'),
    ).toBe('/Users/demo/Toolman/网络知识库')
  })
})
