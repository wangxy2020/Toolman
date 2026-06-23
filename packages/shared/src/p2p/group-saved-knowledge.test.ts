import { describe, expect, it } from 'vitest'
import {
  buildP2pGroupSavedKnowledgeDisplayName,
  findGroupSavedKnowledgeBaseId,
  normalizeP2pGroupSavedKnowledgeMeta,
  parseP2pGroupSavedKnowledgeMeta,
  resolveGroupSavedKnowledgeSidebarLabel,
} from './group-saved-knowledge.js'

describe('group-saved-knowledge', () => {
  it('normalizes group metadata without shared folder segment', () => {
    expect(normalizeP2pGroupSavedKnowledgeMeta('测试群', '默认文件夹')).toEqual({
      groupName: '测试群',
    })
  })

  it('stores p2p workspace id in metadata when provided', () => {
    expect(normalizeP2pGroupSavedKnowledgeMeta('测试群', '默认文件夹', 'ws-1')).toEqual({
      groupName: '测试群',
      p2pWorkspaceId: 'ws-1',
    })
  })

  it('uses group name as display name', () => {
    expect(buildP2pGroupSavedKnowledgeDisplayName('测试群')).toBe('测试群')
  })

  it('round-trips description metadata', () => {
    const meta = normalizeP2pGroupSavedKnowledgeMeta('测试群', undefined, 'ws-1')
    const description = JSON.stringify({ groupSavedKnowledge: meta })
    expect(parseP2pGroupSavedKnowledgeMeta(description)).toEqual(meta)
  })

  it('finds saved kb by workspace id after group rename', () => {
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

  it('resolves sidebar label from metadata or legacy name', () => {
    expect(
      resolveGroupSavedKnowledgeSidebarLabel({
        name: '[测试群] 默认文件夹',
        description: JSON.stringify({
          groupSavedKnowledge: normalizeP2pGroupSavedKnowledgeMeta('测试群', undefined, 'ws-1'),
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
})
