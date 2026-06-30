import { describe, expect, it } from 'vitest'
import { normalizeP2pGroupSavedKnowledgeMeta } from '@toolman/shared'
import { resolveGroupSavedKnowledgeStorageDir } from './knowledge-kb-storage-path.service'

describe('resolveGroupSavedKnowledgeStorageDir', () => {
  it('uses group name only and ignores shared folder segment', () => {
    const meta = normalizeP2pGroupSavedKnowledgeMeta('测试 A', '默认文件夹', 'ws-1')
    expect(resolveGroupSavedKnowledgeStorageDir(meta)).toBe('测试 A')
  })
})
