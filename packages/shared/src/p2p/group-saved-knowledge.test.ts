import { describe, expect, it } from 'vitest'
import {
  buildP2pGroupSavedKnowledgeDisplayName,
  findGroupSavedKnowledgeBaseId,
  normalizeP2pGroupSavedKnowledgeMeta,
  parseP2pGroupSavedKnowledgeMeta,
} from './group-saved-knowledge.js'

describe('group-saved-knowledge', () => {
  it('normalizes group and shared folder names for storage metadata', () => {
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

  it('builds display name for sidebar', () => {
    expect(buildP2pGroupSavedKnowledgeDisplayName('测试群', '默认文件夹')).toBe(
      '[测试群] 默认文件夹',
    )
  })

  it('round-trips description metadata', () => {
    const meta = normalizeP2pGroupSavedKnowledgeMeta('测试群', '默认文件夹', 'ws-1')
    const description = JSON.stringify({ groupSavedKnowledge: meta })
    expect(parseP2pGroupSavedKnowledgeMeta(description)).toEqual(meta)
  })

  it('finds saved kb by workspace id and folder name after group rename', () => {
    const meta = normalizeP2pGroupSavedKnowledgeMeta('旧群名', '资料库', 'ws-1')
    const id = findGroupSavedKnowledgeBaseId(
      [
        {
          id: 'kb-1',
          kind: 'shared',
          name: '[旧群名] 资料库',
          description: JSON.stringify({ groupSavedKnowledge: meta }),
        },
      ],
      {
        p2pWorkspaceId: 'ws-1',
        groupName: '新群名',
        sharedFolderName: '资料库',
      },
    )
    expect(id).toBe('kb-1')
  })
})
