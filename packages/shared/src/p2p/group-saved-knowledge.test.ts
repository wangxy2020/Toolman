import { describe, expect, it } from 'vitest'
import {
  buildP2pGroupSavedKnowledgeDisplayName,
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

  it('builds display name for sidebar', () => {
    expect(buildP2pGroupSavedKnowledgeDisplayName('测试群', '默认文件夹')).toBe(
      '[测试群] 默认文件夹',
    )
  })

  it('round-trips description metadata', () => {
    const meta = normalizeP2pGroupSavedKnowledgeMeta('测试群', '默认文件夹')
    const description = JSON.stringify({ groupSavedKnowledge: meta })
    expect(parseP2pGroupSavedKnowledgeMeta(description)).toEqual(meta)
  })
})
