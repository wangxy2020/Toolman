import { describe, expect, it } from 'vitest'
import {
  buildP2pGroupSavedKnowledgeDisplayName,
  findGroupSavedKnowledgeBaseId,
  normalizeP2pGroupSavedKnowledgeMeta,
  parseP2pGroupSavedKnowledgeMeta,
  resolveGroupSavedKnowledgeSidebarLabel,
} from './group-saved-knowledge.js'

describe('group-saved-knowledge', () => {
  it('normalizes group metadata with shared folder segment', () => {
    expect(normalizeP2pGroupSavedKnowledgeMeta('测试群', '默认文件夹')).toEqual({
      groupName: '测试群',
      sharedFolderName: '默认文件夹',
    })
  })

  it('stores p2p workspace id in metadata when provided', () => {
    expect(normalizeP2pGroupSavedKnowledgeMeta('测试群', '默认文件夹', 'ws-1')).toEqual({
      groupName: '测试群',
      sharedFolderName: '默认文件夹',
      p2pWorkspaceId: 'ws-1',
    })
  })

  it('uses group and shared folder in display name', () => {
    expect(buildP2pGroupSavedKnowledgeDisplayName('测试群')).toBe('测试群')
    expect(buildP2pGroupSavedKnowledgeDisplayName('测试群', '默认文件夹')).toBe(
      '[测试群] 默认文件夹',
    )
  })

  it('round-trips description metadata', () => {
    const meta = normalizeP2pGroupSavedKnowledgeMeta('测试群', undefined, 'ws-1')
    const description = JSON.stringify({ groupSavedKnowledge: meta })
    expect(parseP2pGroupSavedKnowledgeMeta(description)).toEqual(meta)
  })

  it('finds saved kb by workspace id regardless of shared folder segment', () => {
    const meta = normalizeP2pGroupSavedKnowledgeMeta('旧群名', undefined, 'ws-1')
    const id = findGroupSavedKnowledgeBaseId(
      [
        {
          id: 'kb-1',
          kind: 'shared',
          name: '旧群名',
          description: JSON.stringify({ groupSavedKnowledge: meta }),
        },
      ],
      {
        p2pWorkspaceId: 'ws-1',
        groupName: '新群名',
      },
    )
    expect(id).toBe('kb-1')
  })

  it('finds saved kb by group name even when legacy metadata still has shared folder segment', () => {
    const id = findGroupSavedKnowledgeBaseId(
      [
        {
          id: 'kb-legacy',
          kind: 'shared',
          name: '[测试群] 默认文件夹',
          description: JSON.stringify({
            groupSavedKnowledge: normalizeP2pGroupSavedKnowledgeMeta('测试群', '默认文件夹'),
          }),
        },
      ],
      {
        groupName: '测试群',
      },
    )
    expect(id).toBe('kb-legacy')
  })

  it('resolves sidebar label from metadata or legacy name', () => {
    expect(
      resolveGroupSavedKnowledgeSidebarLabel({
        name: '[测试群] 默认文件夹',
        description: JSON.stringify({
          groupSavedKnowledge: normalizeP2pGroupSavedKnowledgeMeta('测试群', '默认文件夹', 'ws-1'),
        }),
      }),
    ).toBe('测试群')
    expect(
      resolveGroupSavedKnowledgeSidebarLabel({
        name: '[测试群] 默认文件夹',
        description: null,
      }),
    ).toBe('测试群')
  })

  it('finds saved kb by workspace id regardless of shared folder segment', () => {
    const id = findGroupSavedKnowledgeBaseId(
      [
        {
          id: 'kb-1',
          kind: 'shared',
          name: '[测试群] 默认文件夹',
          description: JSON.stringify({
            groupSavedKnowledge: normalizeP2pGroupSavedKnowledgeMeta('测试群', '默认文件夹', 'ws-1'),
          }),
        },
      ],
      {
        p2pWorkspaceId: 'ws-1',
        groupName: '测试群',
        sharedFolderName: '默认文件夹',
      },
    )
    expect(id).toBe('kb-1')
  })
})
